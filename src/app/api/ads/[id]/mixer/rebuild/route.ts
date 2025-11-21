/**
 * Mixer API - Force Rebuild
 *
 * POST /api/ads/{adId}/mixer/rebuild - Force mixer rebuild
 */

import { NextRequest, NextResponse } from "next/server";
import { rebuildMixer } from "@/lib/mixer/rebuilder";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/mixer/rebuild
 *
 * Force a mixer rebuild from active versions
 * Useful for manual refresh or after external changes
 *
 * Response:
 * {
 *   tracks: MixerTrack[],
 *   calculatedTracks: CalculatedTrack[],
 *   totalDuration: number,
 *   activeVersions: { voices, music, sfx }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`🔨 Force rebuilding mixer for ad ${adId}`);

    // Rebuild mixer from active versions
    const mixerState = await rebuildMixer(adId);

    return NextResponse.json(mixerState);
  } catch (error) {
    console.error("❌ Error rebuilding mixer:", error);
    return NextResponse.json(
      {
        error: "Failed to rebuild mixer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
