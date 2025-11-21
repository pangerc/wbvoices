import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import type { SfxVersion } from "@/types/versions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const body = await request.json();
    const { soundFxPrompts } = body;

    // Load current version
    const version = await getVersion(adId, "sfx", versionId);
    if (!version || (version as SfxVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Can only generate audio for draft versions" },
        { status: 400 }
      );
    }

    // TODO: Call actual sound effects generation service
    // For now, return placeholder URLs
    const generatedUrls = soundFxPrompts.map(
      (_: unknown, index: number) => `/placeholder-sfx-${index}.mp3`
    );

    console.log(`🔊 Generated sound effects for ${versionId}:`, {
      effectCount: soundFxPrompts.length,
      urls: generatedUrls,
    });

    // Update version with generated URLs
    const updatedVersion: SfxVersion = {
      ...(version as SfxVersion),
      generatedUrls,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "sfx", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    return NextResponse.json({
      versionId,
      generatedUrls,
      message: "Sound effects generated successfully",
    });
  } catch (error) {
    console.error("❌ Failed to generate sound effects:", error);
    return NextResponse.json(
      { error: "Failed to generate sound effects" },
      { status: 500 }
    );
  }
}
