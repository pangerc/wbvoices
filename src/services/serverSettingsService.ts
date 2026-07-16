import { db } from "@/lib/db";
import { serverSettings, type ServerSettings } from "@/lib/db/schema";
import { getRedisV3 } from "@/lib/redis-v3";
import { eq, sql } from "drizzle-orm";

/**
 * Server settings (AAC-185) — global feature flags + maintenance mode.
 *
 * Single-row table (id = 1). Reads go through a short-TTL in-memory cache
 * because the maintenance check sits on the write hot path; writes bust the
 * cache and mirror `maintenanceMode` to a Redis key so the Edge middleware
 * (which has no Postgres access) can enforce a cheap broad block.
 *
 * **Maintenance enforcement is Redis-authoritative** (see `getMaintenanceState`).
 * Postgres stays the canonical store for the full settings object, but the
 * on/off decision on the write hot path is read from the Redis mirror. This
 * gives us a break-glass: `forceClearMaintenance()` clears the Redis key and
 * unblocks writes **even when Postgres is unreachable** (e.g. mid-migration),
 * so an admin can never lock themselves out.
 */

const SETTINGS_ROW_ID = 1;
const CACHE_TTL_MS = 5_000;
const MAINTENANCE_CACHE_TTL_MS = 3_000;

/** Edge-readable mirror of `maintenanceMode` (Upstash REST works on Edge). */
export const MAINTENANCE_REDIS_KEY = "server:maintenance";
/** Companion mirror of the maintenance message, so enforcement is fully Redis-driven. */
export const MAINTENANCE_MESSAGE_REDIS_KEY = "server:maintenance:message";

/** Fields a caller may patch. `id`/`updatedAt` are managed internally. */
export type ServerSettingsPatch = Partial<
  Pick<
    ServerSettings,
    | "maintenanceMode"
    | "maintenanceMessage"
    | "backupExportEnabled"
    | "backupImportEnabled"
    | "restoreFromFileEnabled"
    | "importWriteConcurrency"
    | "importBatchSize"
  >
>;

const DEFAULTS: Omit<ServerSettings, "updatedAt"> = {
  id: SETTINGS_ROW_ID,
  maintenanceMode: false,
  maintenanceMessage: null,
  backupExportEnabled: false,
  backupImportEnabled: false,
  restoreFromFileEnabled: false,
  importWriteConcurrency: 4,
  importBatchSize: 50,
  updatedBy: null,
};

let cache: { value: ServerSettings; expiresAt: number } | null = null;

/** Read the settings row (cached). Lazily creates it with defaults if absent. */
export async function getServerSettings(): Promise<ServerSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let row = (
    await db
      .select()
      .from(serverSettings)
      .where(eq(serverSettings.id, SETTINGS_ROW_ID))
      .limit(1)
  )[0];

  if (!row) {
    // Lazy-create the single row so no seed migration is needed.
    row = (
      await db
        .insert(serverSettings)
        .values({ ...DEFAULTS, updatedAt: new Date() })
        .onConflictDoNothing()
        .returning()
    )[0];
    // If a concurrent request created it first, re-read.
    if (!row) {
      row = (
        await db
          .select()
          .from(serverSettings)
          .where(eq(serverSettings.id, SETTINGS_ROW_ID))
          .limit(1)
      )[0];
    }
  }

  cache = { value: row, expiresAt: Date.now() + CACHE_TTL_MS };
  return row;
}

/** Patch settings, bust the cache, and mirror maintenance to Redis. */
export async function updateServerSettings(
  patch: ServerSettingsPatch,
  updatedBy: string | null,
): Promise<ServerSettings> {
  // Ensure the row exists first (lazy-create path).
  await getServerSettings();

  const [row] = await db
    .update(serverSettings)
    .set({ ...patch, updatedBy, updatedAt: new Date() })
    .where(eq(serverSettings.id, SETTINGS_ROW_ID))
    .returning();

  cache = { value: row, expiresAt: Date.now() + CACHE_TTL_MS };

  // Mirror maintenance to the Edge-readable Redis key when it was touched.
  // The Redis mirror is the enforcement source of truth (see getMaintenanceState),
  // so keep the flag + message in sync here.
  if (
    patch.maintenanceMode !== undefined ||
    patch.maintenanceMessage !== undefined
  ) {
    try {
      const redis = getRedisV3();
      await redis.set(MAINTENANCE_REDIS_KEY, row.maintenanceMode ? "1" : "0");
      await redis.set(MAINTENANCE_MESSAGE_REDIS_KEY, row.maintenanceMessage ?? "");
      maintenanceCache = null;
    } catch (err) {
      // Non-fatal: the Postgres row is the source of truth; the mirror is a
      // best-effort convenience for middleware.
      console.warn("[serverSettings] failed to mirror maintenance flag:", err);
    }
  }

  return row;
}

// --- Maintenance enforcement (Redis-authoritative) ---------------------------

export type MaintenanceState = {
  on: boolean;
  message: string | null;
  /** Where the decision came from — useful for diagnostics/logging. */
  source: "redis" | "postgres";
};

let maintenanceCache: { value: MaintenanceState; expiresAt: number } | null =
  null;

/**
 * The maintenance on/off decision for the write hot path.
 *
 * Reads the Redis mirror first (Postgres-independent — this is what makes the
 * break-glass work). Only when the mirror is absent/unreadable (cold start,
 * Redis hiccup) does it fall back to the canonical Postgres row.
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.value;
  }

  let state: MaintenanceState | null = null;
  try {
    // Upstash auto-deserializes "1"/"0" back to the numbers 1/0, so coerce to
    // string before comparing (a bare === "1" would silently miss the mirror).
    const raw = await getRedisV3().get<string>(MAINTENANCE_REDIS_KEY);
    const flag = raw == null ? null : String(raw);
    if (flag === "1" || flag === "0") {
      const rawMsg =
        flag === "1"
          ? await getRedisV3().get<string>(MAINTENANCE_MESSAGE_REDIS_KEY)
          : null;
      const msg = rawMsg == null ? null : String(rawMsg);
      state = {
        on: flag === "1",
        message: msg && msg.length > 0 ? msg : null,
        source: "redis",
      };
    }
  } catch (err) {
    // Redis unreadable — fall through to Postgres.
    console.warn("[serverSettings] maintenance mirror read failed:", err);
  }

  if (!state) {
    const settings = await getServerSettings();
    state = {
      on: settings.maintenanceMode,
      message: settings.maintenanceMessage,
      source: "postgres",
    };
  }

  maintenanceCache = { value: state, expiresAt: Date.now() + MAINTENANCE_CACHE_TTL_MS };
  return state;
}

/**
 * Break-glass: turn maintenance OFF regardless of Postgres availability.
 *
 * Clears the Redis mirror (the enforcement source of truth) first, so writes
 * are unblocked immediately even if Postgres is down. Then best-effort syncs
 * the canonical Postgres row; a Postgres failure here is logged, not thrown —
 * the important guarantee (writes unblocked) already holds via Redis.
 */
export async function forceClearMaintenance(
  updatedBy: string | null,
): Promise<{ redisCleared: boolean; postgresSynced: boolean }> {
  let redisCleared = false;
  try {
    const redis = getRedisV3();
    await redis.set(MAINTENANCE_REDIS_KEY, "0");
    await redis.set(MAINTENANCE_MESSAGE_REDIS_KEY, "");
    redisCleared = true;
  } catch (err) {
    console.error("[serverSettings] break-glass: Redis clear failed:", err);
  }
  maintenanceCache = null;

  let postgresSynced = false;
  try {
    await updateServerSettings({ maintenanceMode: false }, updatedBy);
    postgresSynced = true;
  } catch (err) {
    console.error(
      "[serverSettings] break-glass: Postgres sync failed (Redis already cleared, writes unblocked):",
      err,
    );
  }

  return { redisCleared, postgresSynced };
}

/** Force the next read to hit Postgres (used by tests). */
export function invalidateServerSettingsCache(): void {
  cache = null;
  maintenanceCache = null;
}

/**
 * True when an error is Postgres "undefined_table" (42P01) — i.e. the
 * `server_settings` table hasn't been created yet (migration 0004 not applied).
 * Preview/unmigrated environments hit this on the first settings read.
 */
export function isMissingSettingsTableError(err: unknown): boolean {
  // Drizzle wraps the driver error ("Failed query: …"), so the real Postgres
  // code (42P01 = undefined_table) lives on `error.cause`. Walk the chain.
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (e.code === "42P01") return true;
    if (e.message && /relation "?server_settings"? does not exist/i.test(e.message)) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

/**
 * Create the `server_settings` table if it doesn't exist. Idempotent — mirrors
 * `drizzle/migrations/0004_server_settings.sql` so an admin can self-provision
 * it from the UI when the migration hasn't run yet. The row itself is created
 * lazily on the next read.
 */
export async function ensureServerSettingsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "server_settings" (
      "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
      "maintenance_mode" boolean DEFAULT false NOT NULL,
      "maintenance_message" text,
      "backup_export_enabled" boolean DEFAULT false NOT NULL,
      "backup_import_enabled" boolean DEFAULT false NOT NULL,
      "restore_from_file_enabled" boolean DEFAULT false NOT NULL,
      "import_write_concurrency" integer DEFAULT 4 NOT NULL,
      "import_batch_size" integer DEFAULT 50 NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      "updated_by" text
    )
  `);
  invalidateServerSettingsCache();
}
