/**
 * Ad Creation API
 *
 * POST /api/ads - Create new advertisement
 * GET  /api/ads - List user's ads (or all ads for admin with ?all=true)
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { setAdMetadata, getAdMetadataBatch } from "@/lib/redis/versions";
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";
import { requireAuth } from "@/lib/auth-helpers";
import { AuthError } from "@/lib/auth-helpers";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

// User ads index key pattern
const USER_ADS_KEY = (ownerEmail: string) => `ads:by_user:${ownerEmail}`;

// All ads index (for admin listing)
const ALL_ADS_KEY = "ads:all";

/**
 * POST /api/ads
 *
 * Create a new advertisement with empty version streams.
 * Owner is derived from the authenticated session.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await requireAuth();
    const body = await request.json();
    const { name, brief } = body;

    // Generate unique ad ID (cute name format: adjective-noun-number)
    const adId = generateProjectId();

    console.log(`✨ Creating new ad ${adId} for ${email}`);

    // Create ad metadata
    const metadata: AdMetadata = {
      name: name || "Untitled Ad",
      brief: brief || {},
      createdAt: Date.now(),
      lastModified: Date.now(),
      owner: email,
    };

    // Save metadata to Redis
    await setAdMetadata(adId, metadata);

    // Add to user's ads list
    const redis = getRedisV3();
    const userAdsKey = USER_ADS_KEY(email);
    const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
    await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));

    // Add to global ads index
    const allAds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
    await redis.set(ALL_ADS_KEY, JSON.stringify([...allAds, adId]));

    console.log(`✅ Created ad ${adId}`);

    return NextResponse.json({ adId, meta: metadata }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
 * GET /api/ads
 *
 * List ads for the authenticated user.
 * Admin users can pass ?all=true to see all ads.
 */
export async function GET(request: NextRequest) {
  try {
    const { email, role } = await requireAuth();
    const url = new URL(request.url);
    const showAll = url.searchParams.get("all") === "true";

    const redis = getRedisV3();
    let adIds: string[];

    if (showAll && role === "admin") {
      // Admin: show all ads (includes legacy universal-session ads)
      adIds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
      console.log(`📋 Admin loading ALL ads: ${adIds.length} total`);
    } else {
      // Regular user: show only their ads
      const userAdsKey = USER_ADS_KEY(email);
      adIds = (await redis.get<string[]>(userAdsKey)) || [];
      console.log(`📋 Loading ads for ${email}: ${adIds.length} found`);
    }

    // Load metadata for all ads in a single batch call
    const metadataMap = await getAdMetadataBatch(adIds);

    const ads = [];
    for (const adId of adIds) {
      const meta = metadataMap.get(adId);
      if (meta) {
        ads.push({ adId, meta });
      }
    }

    // Sort by last modified (newest first)
    ads.sort((a, b) => b.meta.lastModified - a.meta.lastModified);

    return NextResponse.json({ ads });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
