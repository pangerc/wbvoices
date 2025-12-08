/**
 * Sound Effects Stream API - Freeze Version
 *
 * POST /api/ads/{adId}/sfx/{versionId}/freeze - Freeze a SFX version and send to mixer
 */

import { NextRequest, NextResponse } from "next/server";
import { setActiveVersion, getVersion } from "@/lib/redis/versions";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import { FreezeVersionResponse } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/sfx/{versionId}/freeze
 *
 * Freeze a sound effects version and make it current in mixer
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const { searchParams } = new URL(request.url);
    const forceFreeze = searchParams.get("forceFreeze") === "true";

    console.log(`🎯 Freezing SFX version ${versionId} for ad ${adId}${forceFreeze ? " (forceFreeze)" : ""}`);

    // Verify version exists
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

    // Freeze and set as active version
    await setActiveVersion(adId, "sfx", versionId, { forceFreeze });

    // Rebuild mixer with new active version
    const mixer = await rebuildMixer(adId);

    const response: FreezeVersionResponse = {
      active: versionId,
      mixer,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error freezing SFX version:", error);
    return NextResponse.json(
      {
        error: "Failed to freeze SFX version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
