/**
 * Music Stream API - Freeze Version
 *
 * POST /api/ads/{adId}/music/{versionId}/freeze - Freeze a music version and send to mixer
 */

import { NextRequest, NextResponse } from "next/server";
import { setActiveVersion, freezeVersion, getVersion } from "@/lib/redis/versions";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import { FreezeVersionResponse } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/music/{versionId}/freeze
 *
 * Freeze a music version and make it current in mixer
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const { searchParams } = new URL(request.url);
    const forceFreeze = searchParams.get("forceFreeze") === "true";

    console.log(`🎯 Freezing music version ${versionId} for ad ${adId}${forceFreeze ? " (forceFreeze)" : ""}`);

    // Verify version exists
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

    // Optionally freeze, then set as active version
    if (forceFreeze) {
      await freezeVersion(adId, "music", versionId);
    }
    await setActiveVersion(adId, "music", versionId);

    // Rebuild mixer with new active version
    const mixer = await rebuildMixer(adId);

    const response: FreezeVersionResponse = {
      active: versionId,
      mixer,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error freezing music version:", error);
    return NextResponse.json(
      {
        error: "Failed to freeze music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
