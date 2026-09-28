/**
 * Server-wide single-flight lock for AAC-185 backup/export/import/migrate
 * actions (risk R-15). Only one such action may run per server at a time —
 * two concurrent imports (or an export racing an import) would corrupt state.
 *
 * Mirrors the per-ad lock (`adLock.ts`): SET NX + EX to acquire, a Lua
 * CAS-delete to release so an overrun can't drop a successor's lock. Fail-fast
 * (no wait/retry): a second attempt is rejected so the caller can surface a
 * clean 409 "migration already in progress".
 */

import { getRedisV3 } from "../redis-v3";

const MIGRATION_LOCK_KEY = "server:migration:lock";
// Long TTL: a full backup/migration can run for minutes. The CAS-release keeps
// a slow action from dropping a successor's lock after the TTL lapses.
const DEFAULT_TTL_SEC = 3600; // 1h ceiling; released explicitly on completion.

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`.trim();

/**
 * Try to acquire the migration lock. Returns a token on success, or `null` if
 * a backup action is already running (fail-fast, no wait).
 */
export async function tryAcquireMigrationLock(
  ttlSec = DEFAULT_TTL_SEC,
): Promise<string | null> {
  const redis = getRedisV3();
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.set(MIGRATION_LOCK_KEY, token, {
    nx: true,
    ex: ttlSec,
  });
  return acquired === "OK" ? token : null;
}

/** Release the migration lock iff the held token matches (CAS via Lua). */
export async function releaseMigrationLock(token: string): Promise<void> {
  try {
    await getRedisV3().eval(RELEASE_SCRIPT, [MIGRATION_LOCK_KEY], [token]);
  } catch (err) {
    // Non-fatal: TTL will eventually expire the lock if release fails.
    console.warn("[migrationLock] release failed:", err);
  }
}

/** Whether a backup action currently holds the lock (for status display). */
export async function isMigrationInProgress(): Promise<boolean> {
  const v = await getRedisV3().get<string>(MIGRATION_LOCK_KEY);
  return v != null;
}
