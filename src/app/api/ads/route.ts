/**
 * Ad Creation API
 *
 * POST /api/ads - Create new advertisement
 * GET  /api/ads - List user's ads (or all ads for admin with ?all=true)
 */

import { NextJSONResponseFromIterator } from "@/core/next-responses";
import { AdMetadataQuery, Ads } from "@/database/ads";
import { Pagination } from "@/database/base";
import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { getRedisV3 } from "@/lib/redis-v3";
import { setAdMetadata } from "@/lib/redis/versions";
import { Language } from "@/types";
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

// User ads index key pattern
const USER_ADS_KEY = (ownerEmail: string) => `ads:by_user:${ownerEmail}`;

// All ads index (for admin listing)
const ALL_ADS_KEY = "ads:all";

/**
 * Takes a URL search parameters maps and extracts needed details
 * like `name`, `client`, `market`, `language` and returns it for filtering.
 *
 * If no `skip` or `take` is given it returns `showAll: true`.
 * Otherwise it defaults `skip` to `0` and `take` to `4`.
 *
 * @param searchParams that contain the search
 * @returns
 */
const getSearch = (
  searchParams: URLSearchParams,
): { query: AdMetadataQuery; pagination?: Pagination } => {
  // FIXME: Get search via some sort of input validation
  const name = searchParams.get("name") ?? undefined;
  const client = searchParams.get("client") ?? undefined;
  const market = searchParams.get("market") ?? undefined;
  const language = (searchParams.get("language") ?? undefined) as
    | Language
    | undefined;
  const skip = searchParams.get("skip");
  const take = searchParams.get("take");

  const pagination =
    typeof skip === "string"
      ? {
          skip: Number(skip),
          take: Number(take ?? 8),
        }
      : undefined;

  return {
    query: {
      name,
      client,
      market,
      language,
    },
    pagination,
  };
};

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
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to create ad:", error);
    return NextResponse.json(
      {
        error: "Failed to create ad",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/ads
 *
 * List ads for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const { email, role } = await requireAuth();
    const { query, pagination } = getSearch(new URL(request.url).searchParams);

    return new NextJSONResponseFromIterator(
      Ads.getInstance().getAdsMetadataByEmail({
        email: role === "admin" ? undefined : email,
        query,
        opts: {
          signal: request.signal,
          ...pagination,
        },
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to load ads:", error);
    return NextResponse.json(
      {
        error: "Failed to load ads",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
