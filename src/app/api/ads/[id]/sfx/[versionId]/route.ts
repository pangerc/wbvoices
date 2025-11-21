/**
 * Sound Effects Stream API - Get/Update Specific Version
 *
 * GET /api/ads/{adId}/sfx/{versionId} - Get single SFX version
 * PATCH /api/ads/{adId}/sfx/{versionId} - Update draft version
 */

import { NextRequest, NextResponse } from "next/server";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import type { SfxVersion } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/sfx/{versionId}
 *
 * Get a specific SFX version by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`📖 Getting SFX version ${versionId} for ad ${adId}`);

    const version = await getVersion(adId, "sfx", versionId);

    if (!version) {
      return NextResponse.json(
        {
          error: "Version not found",
          adId,
          versionId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(version);
  } catch (error) {
    console.error("❌ Error getting SFX version:", error);
    return NextResponse.json(
      {
        error: "Failed to get SFX version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/{adId}/sfx/{versionId}
 *
 * Update a draft SFX version (only drafts can be edited)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const updates = await request.json();

    console.log(`📝 Updating SFX version ${versionId} for ad ${adId}`);

    const version = await getVersion(adId, "sfx", versionId);

    if (!version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    if ((version as SfxVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Only draft versions can be edited" },
        { status: 400 }
      );
    }

    const updatedVersion: SfxVersion = {
      ...(version as SfxVersion),
      ...updates,
      createdAt: (version as SfxVersion).createdAt,
      createdBy: (version as SfxVersion).createdBy,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "sfx", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    console.log(`✅ Updated SFX version ${versionId}`);

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error("❌ Error updating SFX version:", error);
    return NextResponse.json(
      {
        error: "Failed to update SFX version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
