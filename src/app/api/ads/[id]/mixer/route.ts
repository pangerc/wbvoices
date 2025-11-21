/**
 * Mixer API - Get Current State
 *
 * GET /api/ads/{adId}/mixer - Get current mixer state
 */

import { NextRequest, NextResponse } from "next/server";
import { getMixerState } from "@/lib/mixer/rebuilder";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/mixer
 *
 * Get current mixer state (union of active versions)
 *
 * Response:
 * {
 *   tracks: MixerTrack[],
 *   volumes: {},
 *   calculatedTracks: CalculatedTrack[],
 *   totalDuration: number,
 *   lastCalculated: number,
 *   activeVersions: { voices, music, sfx }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Getting mixer state for ad ${adId}`);

    // Load mixer state from Redis
    const mixerState = await getMixerState(adId);

    if (!mixerState) {
      // No mixer state yet - return empty state
      console.log(`⚠️ No mixer state found for ad ${adId}, returning empty`);
      return NextResponse.json({
        tracks: [],
        volumes: {},
        calculatedTracks: [],
        totalDuration: 0,
        lastCalculated: Date.now(),
        activeVersions: {
          voices: null,
          music: null,
          sfx: null,
        },
      });
    }

    return NextResponse.json(mixerState);
  } catch (error) {
    console.error("❌ Error getting mixer state:", error);
    return NextResponse.json(
      {
        error: "Failed to get mixer state",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
