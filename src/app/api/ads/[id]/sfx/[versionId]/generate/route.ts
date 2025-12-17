import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import { internalFetch } from "@/utils/internal-fetch";
import type { SfxVersion } from "@/types/versions";
import type { SoundFxPrompt } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const body = await request.json();
    const { soundFxPrompts } = body as { soundFxPrompts: SoundFxPrompt[] };

    // Load current version
    const version = await getVersion(adId, "sfx", versionId);
    if (!version || (version as SfxVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Can only generate audio for draft versions" },
        { status: 400 }
      );
    }

    console.log(`🔊 Generating ${soundFxPrompts.length} sound effects for ${versionId}...`);

    // Generate all sound effects sequentially (ElevenLabs may have rate limits)
    const generatedUrls: string[] = [];

    for (let i = 0; i < soundFxPrompts.length; i++) {
      const prompt = soundFxPrompts[i];
      console.log(`  [${i + 1}/${soundFxPrompts.length}] Generating SFX: "${prompt.description?.slice(0, 30)}..."`);

      const sfxResponse = await internalFetch(`/api/sfx/elevenlabs-v2`, {
        method: "POST",
        body: JSON.stringify({
          text: prompt.description,
          duration: prompt.duration || 3,
          projectId: adId,
        }),
      });

      if (!sfxResponse.ok) {
        const errorData = await sfxResponse.json().catch(() => ({}));
        console.error(`❌ SFX generation failed for prompt ${i}:`, errorData);
        return NextResponse.json(
          { error: errorData.error || "SFX generation failed" },
          { status: sfxResponse.status }
        );
      }

      const sfxData = await sfxResponse.json();

      if (!sfxData.audio_url) {
        console.error(`❌ No audio_url returned for SFX prompt ${i}`);
        return NextResponse.json(
          { error: "No URL returned from SFX provider" },
          { status: 500 }
        );
      }

      generatedUrls.push(sfxData.audio_url);
    }

    console.log(`🔊 Generated ${generatedUrls.length} sound effects for ${versionId}`);

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
