/**
 * Music Stream API - Activate Version
 *
 * POST /api/ads/{adId}/music/{versionId}/activate - Activate a music version
 */

import { NextRequest, NextResponse } from "next/server";
import { setActiveVersion, getVersion } from "@/lib/redis/versions";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import { ActivateVersionResponse } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/music/{versionId}/activate
 *
 * Activate a music version (makes it current in mixer)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`🎯 Activating music version ${versionId} for ad ${adId}`);

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

    // Set as active version
    await setActiveVersion(adId, "music", versionId);

    // Rebuild mixer with new active version
    const mixer = await rebuildMixer(adId);

    const response: ActivateVersionResponse = {
      active: versionId,
      mixer,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error activating music version:", error);
    return NextResponse.json(
      {
        error: "Failed to activate music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
