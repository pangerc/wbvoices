/**
 * Admin: Reassign Ads
 *
 * POST /api/admin/reassign-ads
 *
 * Bulk-reassign ads from legacy owners to a target user.
 * Middleware already enforces admin-only access on /api/admin/*.
 *
 * Body: { targetEmail: string, language?: string, owner?: string }
 * - targetEmail: the user to assign ads to
 * - language: filter by brief.selectedLanguage (e.g. "pl")
 * - owner: filter by current owner (defaults to "universal-session")
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getAdMetadataBatch, setAdMetadata } from "@/lib/redis/versions";
import type { AdMetadata } from "@/types/versions";

export const runtime = "nodejs";

const ALL_ADS_KEY = "ads:all";
const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;
const LEGACY_OWNERS = ["universal-session", "default-session"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetEmail, language, owner, adIds } = body as {
      targetEmail: string;
      language?: string;
      owner?: string;
      adIds?: string[];
    };

    if (!targetEmail) {
      return NextResponse.json({ error: "targetEmail is required" }, { status: 400 });
    }

    const redis = getRedisV3();
    const reassigned: string[] = [];

    if (adIds && adIds.length > 0) {
      // Direct mode: reassign specific ads by ID
      const metadataMap = await getAdMetadataBatch(adIds);
      for (const [adId, meta] of metadataMap.entries()) {
        const updated: AdMetadata = { ...meta, owner: targetEmail, lastModified: Date.now() };
        await setAdMetadata(adId, updated);
        reassigned.push(adId);
      }
    } else {
      // Filter mode: scan all ads and filter by language/owner
      const allAdIds = (await redis.get<string[]>(ALL_ADS_KEY)) || [];
      console.log(`📋 Scanning ${allAdIds.length} ads for reassignment...`);
      const metadataMap = await getAdMetadataBatch(allAdIds);
      const filterOwner = owner || null;

      for (const [adId, meta] of metadataMap.entries()) {
        const ownerMatch = filterOwner
          ? meta.owner === filterOwner
          : LEGACY_OWNERS.includes(meta.owner);
        if (!ownerMatch) continue;
        if (language && meta.brief?.selectedLanguage !== language) continue;

        const updated: AdMetadata = { ...meta, owner: targetEmail, lastModified: Date.now() };
        await setAdMetadata(adId, updated);
        reassigned.push(adId);
      }
    }

    // Add all reassigned ads to target user's index
    if (reassigned.length > 0) {
      const userAdsKey = USER_ADS_KEY(targetEmail);
      const existingAds = (await redis.get<string[]>(userAdsKey)) || [];
      const merged = [...new Set([...existingAds, ...reassigned])];
      await redis.set(userAdsKey, JSON.stringify(merged));
    }

    console.log(`✅ Reassigned ${reassigned.length} ads to ${targetEmail}`);

    return NextResponse.json({
      reassigned: reassigned.length,
      adIds: reassigned,
      targetEmail,
      filters: { language: language || "any", owner: owner || "legacy", adIds: adIds || null },
    });
  } catch (error) {
    console.error("❌ Reassign failed:", error);
    return NextResponse.json(
      { error: "Failed to reassign ads", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
