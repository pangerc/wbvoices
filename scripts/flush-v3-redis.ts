/**
 * Flush V3 Redis Database
 *
 * WARNING: This will delete ALL data in the V3 Redis instance!
 * Only use this for development/testing.
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";

// Load environment variables
config();

async function flushV3Redis() {
  console.log("⚠️  WARNING: About to flush V3 Redis database...");
  console.log("This will delete ALL data in the Version Streams database.");

  try {
    const redis = getRedisV3();
    await redis.flushall();
    console.log("✅ V3 Redis database flushed successfully!");
  } catch (error) {
    console.error("❌ Failed to flush V3 Redis:", error);
    process.exit(1);
  }
}

flushV3Redis();
