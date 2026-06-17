import { Redis } from "@upstash/redis";

/**
 * Redis V3 Connection - Dedicated Upstash instance for Version Streams architecture
 *
 * Uses V3_KV_REST_API_URL and V3_KV_REST_API_TOKEN environment variables
 * to connect to a separate Upstash instance for development and testing
 * of the new ad:* namespace without affecting production project:* data.
 */

let redisV3Instance: Redis | null = null;

export function getRedisV3(): Redis {
  if (!redisV3Instance) {
    const url = process.env.V3_KV_REST_API_URL;
    const token = process.env.V3_KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error(
        "V3_KV_REST_API_URL and V3_KV_REST_API_TOKEN are required for Version Streams. " +
        "Please set them in your .env file."
      );
    }

    redisV3Instance = new Redis({ url, token });
  }

  return redisV3Instance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetRedisV3Instance(): void {
  redisV3Instance = null;
}
