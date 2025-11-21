/**
 * Ad Creation API
 *
 * POST /api/ads - Create new advertisement
 * GET  /api/ads?sessionId={id} - List user's ads
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { setAdMetadata, getAdMetadata } from "@/lib/redis/versions";
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

// User ads index key pattern
const USER_ADS_KEY = (sessionId: string) => `ads:by_user:${sessionId}`;

// All ads index (for future admin listing)
const ALL_ADS_KEY = "ads:all";

/**
 * POST /api/ads
 *
 * Create a new advertisement with empty version streams
 *
 * Body:
 * {
 *   name?: string,
 *   brief?: ProjectBrief,
 *   sessionId: string
 * }
 *
 * Response:
 * {
 *   adId: string,
 *   meta: AdMetadata
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("📦 POST /api/ads - Request body:", body);

    const { name, brief, sessionId } = body;

    if (!sessionId) {
      console.error("❌ Missing required field: sessionId");
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Generate unique ad ID (cute name format: adjective-noun-number)
    const adId = generateProjectId();

    console.log(`✨ Creating new ad ${adId} for session ${sessionId}`);

    // Create ad metadata
    const metadata: AdMetadata = {
      name: name || "Untitled Ad",
      brief: brief || {}, // Empty brief if not provided
      createdAt: Date.now(),
      lastModified: Date.now(),
      owner: sessionId,
    };

    // Save metadata to Redis
    await setAdMetadata(adId, metadata);

    // Add to user's ads list
    const redis = getRedisV3();
    const userAdsKey = USER_ADS_KEY(sessionId);
    const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
    await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));

    // Add to global ads index
    const allAds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
    await redis.set(ALL_ADS_KEY, JSON.stringify([...allAds, adId]));

    console.log(`✅ Created ad ${adId}`);

    return NextResponse.json(
      {
        adId,
        meta: metadata,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Failed to create ad:", error);
    return NextResponse.json(
      {
        error: "Failed to create ad",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ads?sessionId={id}
 *
 * List all ads for a user session
 *
 * Response:
 * {
 *   ads: Array<{
 *     adId: string,
 *     meta: AdMetadata
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    console.log(`📋 GET /api/ads - Loading ads for session: ${sessionId}`);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Get user's ad IDs
    const redis = getRedisV3();
    const userAdsKey = USER_ADS_KEY(sessionId);
    const adIds = (await redis.get<string[]>(userAdsKey)) || [];

    console.log(`📋 Found ${adIds.length} ad IDs`);

    // Load metadata for each ad
    const ads = [];
    for (const adId of adIds) {
      const meta = await getAdMetadata(adId);
      if (meta) {
        ads.push({ adId, meta });
      } else {
        console.warn(`⚠️ No metadata found for ad ${adId}`);
      }
    }

    // Sort by last modified (newest first)
    ads.sort((a, b) => b.meta.lastModified - a.meta.lastModified);

    console.log(`📋 Returning ${ads.length} ads`);

    return NextResponse.json({ ads });
  } catch (error) {
    console.error("❌ Failed to load ads:", error);
    return NextResponse.json(
      {
        error: "Failed to load ads",
        details: error instanceof Error ? error.message : String(error),
        ads: [],
      },
      { status: 500 }
    );
  }
}

