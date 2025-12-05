/**
 * Voice Stream API - Get/Update/Delete Specific Version
 *
 * GET /api/ads/{adId}/voices/{versionId} - Get single voice version
 * PATCH /api/ads/{adId}/voices/{versionId} - Update draft version
 * DELETE /api/ads/{adId}/voices/{versionId} - Delete version
 */

import { NextRequest, NextResponse } from "next/server";
import { getVersion, deleteVersion, AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import type { VoiceVersion } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/voices/{versionId}
 *
 * Get a specific voice version by ID
 *
 * Response:
 * {
 *   voiceTracks: VoiceTrack[],
 *   generatedUrls: string[],
 *   createdAt: number,
 *   createdBy: "llm" | "user",
 *   status: "draft" | "frozen",
 *   promptContext?: string,
 *   parentVersionId?: string
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`📖 Getting voice version ${versionId} for ad ${adId}`);

    // Load version from Redis
    const version = await getVersion(adId, "voices", versionId);

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
    console.error("❌ Error getting voice version:", error);
    return NextResponse.json(
      {
        error: "Failed to get voice version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/{adId}/voices/{versionId}
 *
 * Update a draft voice version (only drafts can be edited)
 *
 * Body: Partial<VoiceVersion>
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const updates = await request.json();

    console.log(`📝 Updating voice version ${versionId} for ad ${adId}`);

    // Load current version
    const version = await getVersion(adId, "voices", versionId);

    if (!version) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    // Only allow updating drafts
    if ((version as VoiceVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Only draft versions can be edited" },
        { status: 400 }
      );
    }

    // Merge updates with current version
    const updatedVersion: VoiceVersion = {
      ...(version as VoiceVersion),
      ...updates,
      // Preserve immutable fields
      createdAt: (version as VoiceVersion).createdAt,
      createdBy: (version as VoiceVersion).createdBy,
      parentVersionId: (version as VoiceVersion).parentVersionId,
    };

    // Save to Redis
    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "voices", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    console.log(`✅ Updated voice version ${versionId}`);

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error("❌ Error updating voice version:", error);
    return NextResponse.json(
      {
        error: "Failed to update voice version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ads/{adId}/voices/{versionId}
 *
 * Delete a voice version. If it was active in the mixer, removes from mixer.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`🗑️ Deleting voice version ${versionId} for ad ${adId}`);

    const { wasActive } = await deleteVersion(adId, "voices", versionId);

    // If we deleted the active version, rebuild mixer without it
    if (wasActive) {
      console.log(`🔄 Rebuilding mixer after deleting active voice version`);
      await rebuildMixer(adId);
    }

    return NextResponse.json({ success: true, versionId, wasActive });
  } catch (error) {
    console.error("❌ Error deleting voice version:", error);
    return NextResponse.json(
      {
        error: "Failed to delete voice version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
