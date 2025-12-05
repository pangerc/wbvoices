/**
 * Music Stream API - Get/Update/Delete Specific Version
 *
 * GET /api/ads/{adId}/music/{versionId} - Get single music version
 * PATCH /api/ads/{adId}/music/{versionId} - Update draft version
 * DELETE /api/ads/{adId}/music/{versionId} - Delete version
 */

import { NextRequest, NextResponse } from "next/server";
import { getVersion, deleteVersion, AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import type { MusicVersion } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/music/{versionId}
 *
 * Get a specific music version by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`📖 Getting music version ${versionId} for ad ${adId}`);

    const version = await getVersion(adId, "music", versionId);

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
    console.error("❌ Error getting music version:", error);
    return NextResponse.json(
      {
        error: "Failed to get music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/{adId}/music/{versionId}
 *
 * Update a draft music version (only drafts can be edited)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const updates = await request.json();

    console.log(`📝 Updating music version ${versionId} for ad ${adId}`);

    const version = await getVersion(adId, "music", versionId);

    if (!version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    if ((version as MusicVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Only draft versions can be edited" },
        { status: 400 }
      );
    }

    const updatedVersion: MusicVersion = {
      ...(version as MusicVersion),
      ...updates,
      createdAt: (version as MusicVersion).createdAt,
      createdBy: (version as MusicVersion).createdBy,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "music", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    console.log(`✅ Updated music version ${versionId}`);

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error("❌ Error updating music version:", error);
    return NextResponse.json(
      {
        error: "Failed to update music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ads/{adId}/music/{versionId}
 *
 * Delete a music version. If it was active in the mixer, removes from mixer.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`🗑️ Deleting music version ${versionId} for ad ${adId}`);

    const { wasActive } = await deleteVersion(adId, "music", versionId);

    // If we deleted the active version, rebuild mixer without it
    if (wasActive) {
      console.log(`🔄 Rebuilding mixer after deleting active music version`);
      await rebuildMixer(adId);
    }

    return NextResponse.json({ success: true, versionId, wasActive });
  } catch (error) {
    console.error("❌ Error deleting music version:", error);
    return NextResponse.json(
      {
        error: "Failed to delete music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
