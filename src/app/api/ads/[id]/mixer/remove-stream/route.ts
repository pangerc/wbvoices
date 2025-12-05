/**
 * Mixer API - Remove Stream
 *
 * POST /api/ads/{adId}/mixer/remove-stream - Remove a stream from the mixer
 */

import { NextRequest, NextResponse } from "next/server";
import { clearActiveVersion } from "@/lib/redis/versions";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import type { StreamType } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/mixer/remove-stream
 *
 * Remove a stream (music or sfx) from the mixer by clearing its active version pointer.
 * Voice tracks cannot be removed this way - they must be edited in the voice panel.
 *
 * Request body:
 * { streamType: "music" | "sfx" }
 *
 * Response:
 * Updated MixerState after rebuild
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await request.json();
    const { streamType } = body as { streamType: StreamType };

    // Validate stream type - only allow music and sfx removal
    if (streamType !== "music" && streamType !== "sfx") {
      return NextResponse.json(
        { error: "Only music and sfx streams can be removed" },
        { status: 400 }
      );
    }

    console.log(`🗑️ Removing ${streamType} stream from mixer for ad ${adId}`);

    // Clear the active version pointer
    await clearActiveVersion(adId, streamType);

    // Rebuild mixer without the removed stream
    const mixerState = await rebuildMixer(adId);

    console.log(`✅ Removed ${streamType} and rebuilt mixer for ad ${adId}`);

    return NextResponse.json(mixerState);
  } catch (error) {
    console.error("❌ Error removing stream from mixer:", error);
    return NextResponse.json(
      {
        error: "Failed to remove stream from mixer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
