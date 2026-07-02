/**
 * Fixed-window rate limiter (AAC-185, P5 / §12).
 *
 * Guards grant minting + import attempts so a compromised admin session or a
 * runaway client can't hammer the backup surface. Fixed window via Redis
 * INCR + EXPIRE — cheap and good enough for admin-frequency operations.
 */

import { getRedisV3 } from "@/lib/redis-v3";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
};

export async function rateLimit(
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  try {
    const redis = getRedisV3();
    const key = `ratelimit:backup:${bucket}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), limit };
  } catch (err) {
    // Fail open: a limiter outage must not block legitimate admin work.
    console.warn("[rateLimit] check failed (allowing):", err);
    return { allowed: true, remaining: limit, limit };
  }
}
