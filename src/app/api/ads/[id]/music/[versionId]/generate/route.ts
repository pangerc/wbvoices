import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import type { MusicVersion } from "@/types/versions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const body = await request.json();
    const { prompt, provider, duration } = body;

    // Load current version
    const version = await getVersion(adId, "music", versionId);
    if (!version || (version as MusicVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Can only generate audio for draft versions" },
        { status: 400 }
      );
    }

    // TODO: Call actual music generation service
    // For now, return placeholder URL
    const generatedUrl = `/placeholder-music-${provider}-${duration}s.mp3`;

    console.log(`🎵 Generated music for ${versionId} (${provider}):`, {
      prompt,
      duration,
      url: generatedUrl,
    });

    // Update version with generated URL
    const updatedVersion: MusicVersion = {
      ...(version as MusicVersion),
      generatedUrl,
      duration,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "music", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    return NextResponse.json({
      versionId,
      generatedUrl,
      duration,
      message: "Music generated successfully",
    });
  } catch (error) {
    console.error("❌ Failed to generate music:", error);
    return NextResponse.json(
      { error: "Failed to generate music" },
      { status: 500 }
    );
  }
}
