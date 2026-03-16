/**
 * Adopt Ad API
 *
 * POST /api/ads/{adId}/adopt
 *
 * Transfers ownership of a legacy (unowned) ad to the current user.
 * Only works for ads owned by "universal-session" or "default-session".
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getAdMetadata, setAdMetadata } from "@/lib/redis/versions";
import { requireAuth, AuthError } from "@/lib/auth-helpers";

export const runtime = "nodejs";

const LEGACY_OWNERS = ["universal-session", "default-session"];
const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { email } = await requireAuth();
    const { id: adId } = await params;

    const meta = await getAdMetadata(adId);
    if (!meta) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    // Only allow adopting legacy/unowned ads
    if (!LEGACY_OWNERS.includes(meta.owner)) {
      return NextResponse.json(
        { error: "This ad is already owned by another user" },
        { status: 403 }
      );
    }

    // Transfer ownership
    meta.owner = email;
    meta.lastModified = Date.now();
    await setAdMetadata(adId, meta);

    // Add to new owner's index
    const redis = getRedisV3();
    const userAdsKey = USER_ADS_KEY(email);
    const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
    if (!existingAds.includes(adId)) {
      await redis.set(userAdsKey, JSON.stringify([...existingAds, adId]));
    }

    console.log(`🔄 Ad ${adId} adopted by ${email}`);

    return NextResponse.json({ success: true, adId, owner: email });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Error adopting ad:", error);
    return NextResponse.json(
      { error: "Failed to adopt ad" },
      { status: 500 }
    );
  }
}
