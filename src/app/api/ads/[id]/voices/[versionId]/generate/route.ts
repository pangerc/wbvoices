import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import type { VoiceVersion } from "@/types/versions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const body = await request.json();
    const { provider, voiceTracks, trackIndices } = body;

    // Load current version
    const version = await getVersion(adId, "voices", versionId);
    if (!version || (version as VoiceVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Can only generate audio for draft versions" },
        { status: 400 }
      );
    }

    const currentVersion = version as VoiceVersion;

    // Determine which tracks to generate
    const indicesToGenerate: number[] = trackIndices ||
      voiceTracks.map((_: unknown, idx: number) => idx);

    console.log(`🎙️ Generating voice audio for ${versionId} (${provider}):`, {
      totalTracks: voiceTracks.length,
      generatingIndices: indicesToGenerate,
      isSelective: !!trackIndices,
    });

    // Start with existing URLs (or empty array if none)
    const updatedUrls = currentVersion.generatedUrls
      ? [...currentVersion.generatedUrls]
      : new Array(voiceTracks.length).fill("");

    // TODO: Call actual audio generation service for each track
    // For now, generate placeholder URLs only for specified indices
    for (const index of indicesToGenerate) {
      if (index >= 0 && index < voiceTracks.length) {
        updatedUrls[index] = `/placeholder-voice-${versionId}-${index}-${Date.now()}.mp3`;
      }
    }

    console.log(`✅ Generated ${indicesToGenerate.length} voice tracks:`, {
      urls: indicesToGenerate.map(i => ({ index: i, url: updatedUrls[i] })),
    });

    // Update version with merged URLs
    const updatedVersion: VoiceVersion = {
      ...currentVersion,
      generatedUrls: updatedUrls,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "voices", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    return NextResponse.json({
      versionId,
      generatedUrls: updatedUrls,
      generatedIndices: indicesToGenerate,
      message: trackIndices
        ? `Generated ${indicesToGenerate.length} voice track(s)`
        : "All voice tracks generated successfully",
    });
  } catch (error) {
    console.error("❌ Failed to generate voice audio:", error);
    return NextResponse.json(
      { error: "Failed to generate voice audio" },
      { status: 500 }
    );
  }
}
