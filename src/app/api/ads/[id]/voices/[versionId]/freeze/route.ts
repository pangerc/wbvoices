/**
 * Voice Stream API - Freeze Version
 *
 * POST /api/ads/{adId}/voices/{versionId}/freeze - Freeze a voice version and send to mixer
 */

import { NextRequest, NextResponse } from "next/server";
import { setActiveVersion, getVersion } from "@/lib/redis/versions";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import { FreezeVersionResponse, VoiceVersion } from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/voices/{versionId}/freeze
 *
 * Freeze a voice version and make it current in mixer
 * This triggers an automatic mixer rebuild
 *
 * Response:
 * {
 *   active: "v3",
 *   mixer: {
 *     tracks: [...],
 *     totalDuration: 30,
 *     activeVersions: { voices: "v3", music: "v2", sfx: "v1" }
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;

    console.log(`🎯 Freezing voice version ${versionId} for ad ${adId}`);

    // Verify version exists
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

    // Validate: Check if all voice tracks have generated audio
    // Check embedded generatedUrl (new format) or legacy generatedUrls[] (migration)
    const voiceVersion = version as VoiceVersion;
    const hasAllAudio = voiceVersion.voiceTracks.every((track, index) => {
      return !!track.generatedUrl || !!voiceVersion.generatedUrls?.[index];
    });

    if (!hasAllAudio) {
      const missingCount = voiceVersion.voiceTracks.filter((track, index) => {
        return !track.generatedUrl && !voiceVersion.generatedUrls?.[index];
      }).length;

      return NextResponse.json(
        {
          error: "Cannot freeze draft with incomplete audio",
          details: `${missingCount} track(s) missing audio. Generate audio for all tracks first.`,
        },
        { status: 400 }
      );
    }

    // Freeze and set as active version (updates Redis pointer + version status)
    await setActiveVersion(adId, "voices", versionId);

    // Rebuild mixer with new active version
    const mixer = await rebuildMixer(adId);

    const response: FreezeVersionResponse = {
      active: versionId,
      mixer,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error freezing voice version:", error);
    return NextResponse.json(
      {
        error: "Failed to freeze voice version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
