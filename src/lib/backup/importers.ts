/**
 * Model importers — the write side (AAC-185, P3-4).
 *
 * `merge` upserts (incoming overwrites on collision). `replace` wipes the target
 * scope first (see `wipeScope`) then writes. Version blobs are written to raw
 * Redis keys so version ids are preserved exactly; the ordered list + active
 * pointer + counter are reconstructed from the `version/__index` records.
 * Indexes (`ads:all`, `ads:by_user`) are rebuilt from imported `ad-meta`, never
 * imported verbatim (§4).
 *
 * `remap` is deferred to a follow-up (the duplicate-ad route is the precedent).
 */

import { db } from "@/lib/db";
import {
  instructionTemplates,
  serverSettings,
  suggestedTones,
  users,
  voiceBlacklist,
  voiceDescriptions,
  voiceMetadata,
} from "@/lib/db/schema";
import { CONVERSATION_KEYS } from "@/lib/redis/conversation";
import { AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import type { StreamType } from "@/types/versions";
import { and, eq, inArray } from "drizzle-orm";
import type { BackupRecord, ScopePlan } from "./types";

const STREAMS: StreamType[] = ["voices", "music", "sfx", "mixer"];
const ALL_ADS_KEY = "ads:all";
const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** JSON round-trips Dates to ISO strings; Drizzle timestamp columns want Date. */
function reviveDates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && ISO_DATE.test(v)) out[k] = new Date(v);
  }
  return out as T;
}

async function pgUpsert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conflictTarget: any,
  data: Record<string, unknown>,
) {
  const row = reviveDates(data);
  // Update every column except the conflict key(s) on collision.
  const set: Record<string, unknown> = { ...row };
  await db
    .insert(table)
    .values(row)
    .onConflictDoUpdate({ target: conflictTarget, set });
}

const jset = (key: string, value: unknown) =>
  getRedisV3().set(key, JSON.stringify(value));

// --- per-record writer ------------------------------------------------------

/** Owner emails discovered from imported ad-meta, for index rebuild. */
export type IndexAccumulator = Map<string, string | null>; // adId → owner

export async function writeRecord(
  record: BackupRecord,
  indexAcc: IndexAccumulator,
): Promise<void> {
  const d = record.data as Record<string, unknown>;
  switch (record.kind) {
    case "server-settings":
      await pgUpsert(serverSettings, serverSettings.id, d);
      return;
    case "user":
      await pgUpsert(users, users.email, d);
      return;
    case "voice-metadata":
      await pgUpsert(voiceMetadata, voiceMetadata.id, d);
      return;
    case "voice-blacklist":
      await pgUpsert(
        voiceBlacklist,
        [voiceBlacklist.voiceKey, voiceBlacklist.language, voiceBlacklist.accent],
        d,
      );
      return;
    case "voice-description":
      await pgUpsert(voiceDescriptions, voiceDescriptions.voiceKey, d);
      return;
    case "suggested-tone":
      await pgUpsert(suggestedTones, suggestedTones.id, d);
      return;
    case "instruction-template":
      await pgUpsert(instructionTemplates, instructionTemplates.id, d);
      return;
    case "ad-meta": {
      await jset(AD_KEYS.meta(record.id), d);
      const owner = typeof d.owner === "string" ? d.owner.toLowerCase() : null;
      indexAcc.set(record.id, owner);
      return;
    }
    case "version": {
      const meta = record.meta ?? {};
      const adId = meta.adId as string;
      if (meta.type === "index") {
        const stream = meta.stream as StreamType;
        const idx = record.data as {
          ids?: string[];
          active?: string | null;
          counter?: unknown;
        };
        const redis = getRedisV3();
        await redis.del(AD_KEYS.versions(adId, stream));
        if (idx.ids?.length) await redis.rpush(AD_KEYS.versions(adId, stream), ...idx.ids);
        if (idx.active != null) await redis.set(AD_KEYS.active(adId, stream), idx.active);
        if (idx.counter != null) await redis.set(AD_KEYS.counter(adId, stream), idx.counter as string | number);
      } else if (meta.type === "legacy-mixer") {
        await jset(AD_KEYS.mixer(adId), d);
      } else {
        const stream = meta.stream as StreamType;
        const versionId = meta.versionId as string;
        await jset(AD_KEYS.version(adId, stream, versionId), d);
      }
      return;
    }
    case "conversation":
      await jset(CONVERSATION_KEYS.conversation(record.id), d);
      return;
    case "preview":
      await jset(AD_KEYS.preview(record.id), d);
      return;
    case "blob":
      return; // blobs are handled by the archive reader, not as records
  }
}

/** Rebuild `ads:all` + `ads:by_user:{owner}` from imported ad-meta (union). */
export async function rebuildIndexes(indexAcc: IndexAccumulator): Promise<void> {
  if (indexAcc.size === 0) return;
  const redis = getRedisV3();

  const existingAll = (await redis.get<string[]>(ALL_ADS_KEY)) ?? [];
  const allSet = new Set(existingAll);
  const byUser = new Map<string, Set<string>>();

  for (const [adId, owner] of indexAcc) {
    allSet.add(adId);
    if (owner) {
      if (!byUser.has(owner)) {
        const existing = (await redis.get<string[]>(USER_ADS_KEY(owner))) ?? [];
        byUser.set(owner, new Set(existing));
      }
      byUser.get(owner)!.add(adId);
    }
  }

  await redis.set(ALL_ADS_KEY, [...allSet]);
  for (const [owner, ids] of byUser) {
    await redis.set(USER_ADS_KEY(owner), [...ids]);
  }
}

// --- replace: wipe target scope --------------------------------------------

/** Delete every Redis key for one ad (all streams + meta + preview + convo). */
async function wipeAd(adId: string): Promise<void> {
  const redis = getRedisV3();
  for (const stream of STREAMS) {
    const ids = await redis.lrange(AD_KEYS.versions(adId, stream), 0, -1);
    for (const vid of ids ?? []) await redis.del(AD_KEYS.version(adId, stream, vid));
    await redis.del(AD_KEYS.versions(adId, stream));
    await redis.del(AD_KEYS.active(adId, stream));
    await redis.del(AD_KEYS.counter(adId, stream));
  }
  await redis.del(AD_KEYS.mixer(adId));
  await redis.del(AD_KEYS.preview(adId));
  await redis.del(CONVERSATION_KEYS.conversation(adId));
  await redis.del(AD_KEYS.meta(adId));
}

/**
 * Wipe the target scope before a `replace`. Only touches kinds that the incoming
 * archive actually carries (`presentKinds`), so a scoped archive can't wipe more
 * than it will restore. A pre-import backup is taken by the caller first.
 */
export async function wipeScope(
  plan: ScopePlan,
  presentKinds: Set<string>,
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const redis = getRedisV3();

  // Ads (and their sub-keys + index membership).
  if (plan.adIds.length) {
    for (const adId of plan.adIds) await wipeAd(adId);
    deleted["ad"] = plan.adIds.length;

    const wipeSet = new Set(plan.adIds);
    const all = ((await redis.get<string[]>(ALL_ADS_KEY)) ?? []).filter(
      (id) => !wipeSet.has(id),
    );
    await redis.set(ALL_ADS_KEY, all);
    for (const email of plan.emails) {
      const list = ((await redis.get<string[]>(USER_ADS_KEY(email))) ?? []).filter(
        (id) => !wipeSet.has(id),
      );
      await redis.set(USER_ADS_KEY(email), list);
    }
  }

  // Postgres: global reference tables (only on a global-including scope).
  if (plan.includeGlobalReference) {
    const globals: Array<[string, unknown]> = [
      ["voice-metadata", voiceMetadata],
      ["voice-blacklist", voiceBlacklist],
      ["voice-description", voiceDescriptions],
      ["suggested-tone", suggestedTones],
      ["instruction-template", instructionTemplates],
    ];
    for (const [kind, table] of globals) {
      if (!presentKinds.has(kind)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.delete(table as any);
      deleted[kind] = -1; // count unknown pre-wipe; -1 = "all"
    }
  }

  // Users: those in scope (per-user) or all (complete → emails empty).
  if (presentKinds.has("user")) {
    if (plan.emails.length) {
      await db.delete(users).where(inArray(users.email, plan.emails));
      deleted["user"] = plan.emails.length;
    } else {
      await db.delete(users);
      deleted["user"] = -1;
    }
  }

  return deleted;
}

/** Count existing records in the target scope (for the dry-run blast radius). */
export async function countTargetScope(
  plan: ScopePlan,
  presentKinds: Set<string>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const redis = getRedisV3();

  if (presentKinds.has("ad-meta") && plan.adIds.length) {
    let n = 0;
    for (const adId of plan.adIds) {
      if ((await redis.get(AD_KEYS.meta(adId))) != null) n++;
    }
    counts["ad-meta"] = n;
  }

  if (presentKinds.has("user")) {
    const rows = plan.emails.length
      ? await db.select({ e: users.email }).from(users).where(inArray(users.email, plan.emails))
      : await db.select({ e: users.email }).from(users);
    counts["user"] = rows.length;
  }

  return counts;
}

export { and, eq }; // re-export for callers that build ad-hoc filters
