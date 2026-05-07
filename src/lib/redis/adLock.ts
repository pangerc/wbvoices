/**
 * Per-ad atomic primitive (stage 5 of mixer redesign).
 *
 * Serializes mutations on a single ad (freeze-with-pin-swap in stage 6,
 * lazy-bootstrap materialization of mixer:v1, and any future compound
 * write that can't be one Redis command). Uses Redis SET NX + EX for
 * acquisition and a Lua CAS-delete for release, so a long-running op
 * that overshoots TTL can't accidentally release a successor's lock.
 *
 * Not fair, not re-entrant, not distributed-consensus-grade. Good enough
 * to prevent two-tab races on the same ad, which is the concrete case
 * the redesign plan calls out.
 */

import { getRedisV3 } from "../redis-v3";

const DEFAULT_LOCK_TTL_SEC = 10;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_MS = 50;

function lockKey(adId: string): string {
  return `ad:${adId}:lock`;
}

/**
 * Release the lock only if the held token matches — prevents deleting a
 * successor's lock after we've exceeded our TTL. Atomic via Lua.
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`.trim();

export class AdLockTimeoutError extends Error {
  constructor(
    public readonly adId: string,
    public readonly waitedMs: number,
  ) {
    super(`Failed to acquire ad lock for ${adId} within ${waitedMs}ms`);
    this.name = "AdLockTimeoutError";
  }
}

export interface AdLockOptions {
  /** Lock TTL in seconds. Op must complete within this window. Default 10s. */
  ttlSec?: number;
  /** Max time to wait for acquisition before throwing. Default 5s. */
  timeoutMs?: number;
  /** Polling interval while waiting. Default 50ms. */
  retryMs?: number;
}

/**
 * Run `op` exclusively for `adId`. Acquires a Redis-backed per-ad lock,
 * executes op, releases the lock even if op throws. Throws AdLockTimeoutError
 * if the lock can't be acquired within `timeoutMs`.
 */
export async function withAdLock<T>(
  adId: string,
  op: () => Promise<T>,
  options: AdLockOptions = {},
): Promise<T> {
  const ttlSec = options.ttlSec ?? DEFAULT_LOCK_TTL_SEC;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;

  const redis = getRedisV3();
  const key = lockKey(adId);
  const token =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const startedAt = Date.now();

  while (true) {
    const acquired = await redis.set(key, token, { nx: true, ex: ttlSec });
    if (acquired === "OK") {
      try {
        return await op();
      } finally {
        try {
          await redis.eval(RELEASE_SCRIPT, [key], [token]);
        } catch (err) {
          // Non-fatal: if release fails, TTL will eventually expire the lock.
          // Log, don't throw — op already returned / rejected.
          console.warn(`[adLock] Release failed for ${adId}:`, err);
        }
      }
    }

    const waited = Date.now() - startedAt;
    if (waited >= timeoutMs) {
      throw new AdLockTimeoutError(adId, waited);
    }
    await new Promise((r) => setTimeout(r, retryMs));
  }
}
