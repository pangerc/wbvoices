/**
 * Create Simple Test Ad - Direct Redis Write
 *
 * Creates a minimal test ad directly in Redis without API calls
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";
import { generateProjectId } from "../src/utils/projectId";

config();

async function createSimpleTestAd() {
  console.log("🚀 Creating simple test ad directly in Redis...\n");

  try {
    const redis = getRedisV3();
    const adId = generateProjectId();
    const sessionId = "default-session";

    console.log(`Ad ID: ${adId}`);
    console.log(`Session ID: ${sessionId}\n`);

    // 1. Create ad metadata
    const adMetadata = {
      name: "Spotify Premium Campaign",
      brief: {
        clientDescription: "Spotify - Leading music streaming platform",
        creativeBrief: "Promote Spotify Premium with ad-free listening",
      },
      createdAt: Date.now(),
      lastModified: Date.now(),
      owner: sessionId,
    };

    await redis.set(`ad:${adId}:meta`, JSON.stringify(adMetadata));
    console.log(`✅ Created ad metadata`);

    // 2. Add to user's ads list
    const userAdsKey = `ads:by_user:${sessionId}`;
    const existingAds = await redis.get<string[]>(userAdsKey) || [];
    await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));
    console.log(`✅ Added to user's ads list`);

    // 3. Add to global ads index
    const allAds = await redis.get<string[]>("ads:all") || [];
    await redis.set("ads:all", JSON.stringify([...allAds, adId]));
    console.log(`✅ Added to global ads index`);

    // 4. Create empty voice stream
    const voiceStream = {
      active: null,
      versions: [],
      versionsData: {},
    };
    await redis.set(`ad:${adId}:voices:stream`, JSON.stringify(voiceStream));
    console.log(`✅ Created voice stream`);

    // 5. Create empty music stream
    const musicStream = {
      active: null,
      versions: [],
      versionsData: {},
    };
    await redis.set(`ad:${adId}:music:stream`, JSON.stringify(musicStream));
    console.log(`✅ Created music stream`);

    // 6. Create empty sfx stream
    const sfxStream = {
      active: null,
      versions: [],
      versionsData: {},
    };
    await redis.set(`ad:${adId}:sfx:stream`, JSON.stringify(sfxStream));
    console.log(`✅ Created sfx stream\n`);

    console.log(`🎉 Test ad created successfully!`);
    console.log(`   Visit: http://localhost:3003/ad/${adId}`);
    console.log(`   History drawer will show this ad with session: ${sessionId}`);

  } catch (error) {
    console.error("❌ Error creating test ad:", error);
    process.exit(1);
  }
}

createSimpleTestAd();
