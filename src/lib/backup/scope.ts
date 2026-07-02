/**
 * Scope resolution (AAC-185, P1).
 *
 * Turns the admin's chosen `ExportScope` into a concrete `ScopePlan` (exact ad
 * ids + user emails + which global slices are included). Resolved once by the
 * orchestrator so every exporter shares the same plan (no re-listing).
 *
 * Rules (plan.md §4):
 * - complete → all ads (`ads:all`), all users, global reference + server-settings.
 * - per-user → those users' ads (`ads:by_user:{email}`); global reference is a
 *   per-run toggle; server-settings excluded (it's server-global, not user data).
 * - per-ad → selected ads + their owners' user rows only; no global slices.
 */

import { AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import type { ExportConfig, ScopePlan } from "./types";

const ALL_ADS_KEY = "ads:all";
const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;

async function readIdList(key: string): Promise<string[]> {
  const v = await getRedisV3().get<string[]>(key);
  return Array.isArray(v) ? v : [];
}

async function ownerOf(adId: string): Promise<string | null> {
  const meta = await getRedisV3().get<{ owner?: string }>(AD_KEYS.meta(adId));
  return meta?.owner ?? null;
}

export async function resolveScopePlan(
  config: ExportConfig,
): Promise<ScopePlan> {
  const scope = config.scope;

  if (scope.type === "complete") {
    const adIds = await readIdList(ALL_ADS_KEY);
    // Users are enumerated by the `user` exporter (full table); we don't need
    // to pre-list them for filtering, so emails stays empty = "all".
    return {
      adIds,
      emails: [],
      includeGlobalReference: true,
      includeServerSettings: true,
    };
  }

  if (scope.type === "per-user") {
    const emails = [...new Set(scope.emails.map((e) => e.toLowerCase()))];
    const lists = await Promise.all(emails.map((e) => readIdList(USER_ADS_KEY(e))));
    const adIds = [...new Set(lists.flat())];
    return {
      adIds,
      emails,
      includeGlobalReference: scope.includeGlobalReference,
      includeServerSettings: false,
    };
  }

  // per-ad
  const adIds = [...new Set(scope.adIds)];
  const owners = await Promise.all(adIds.map(ownerOf));
  const emails = [...new Set(owners.filter((o): o is string => !!o).map((o) => o.toLowerCase()))];
  return {
    adIds,
    emails,
    includeGlobalReference: false,
    includeServerSettings: false,
  };
}
