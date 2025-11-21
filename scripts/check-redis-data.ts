/**
 * Check Redis Data - Debug script
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";

config();

async function checkRedisData() {
  console.log("🔍 Checking Redis data...\n");

  try {
    const redis = getRedisV3();

    // Check default-session ads
    console.log("📋 Ads for default-session:");
    const defaultSessionAds = await redis.get<string[]>("ads:by_user:default-session");
    console.log(defaultSessionAds || "No ads found");

    // Check global ads index
    console.log("\n📋 Global ads index:");
    const allAds = await redis.get<string[]>("ads:all");
    console.log(allAds || "No ads found");

    // Check each ad's metadata
    if (allAds && allAds.length > 0) {
      console.log("\n📝 Ad metadata:");
      for (const adId of allAds) {
        const meta = await redis.get(`ad:${adId}:meta`);
        console.log(`\n  ${adId}:`);
        console.log(`  ${JSON.stringify(meta, null, 2)}`);
      }
    }

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

checkRedisData();
