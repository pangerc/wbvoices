import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getVersion, AD_KEYS } from "@/lib/redis/versions";
import { internalFetch, getBaseUrl } from "@/utils/internal-fetch";
import type { MusicVersion } from "@/types/versions";
import type { MusicProvider } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: adId, versionId } = await params;
    const body = await request.json();
    const { prompt, provider, duration } = body as {
      prompt: string;
      provider: MusicProvider;
      duration: number;
    };

    // Load current version
    const version = await getVersion(adId, "music", versionId);
    if (!version || (version as MusicVersion).status !== "draft") {
      return NextResponse.json(
        { error: "Can only generate audio for draft versions" },
        { status: 400 }
      );
    }

    console.log(`🎵 Generating music for ${versionId} (${provider}):`, {
      prompt,
      duration,
    });

    // Adjust duration for Loudly (requires 15-second increments)
    // Use ceil to ensure we meet or exceed requested duration
    const adjustedDuration =
      provider === "loudly" ? Math.ceil(duration / 15) * 15 : duration;

    const baseUrl = getBaseUrl();

    // Call the existing music generation endpoint
    const musicResponse = await internalFetch(`/api/music/${provider}`, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        duration: adjustedDuration,
        projectId: adId,
      }),
    });

    if (!musicResponse.ok) {
      const errorData = await musicResponse.json().catch(() => ({}));
      console.error(`❌ Music provider ${provider} failed:`, errorData);
      return NextResponse.json(
        { error: errorData.error || `Music generation failed: ${provider}` },
        { status: musicResponse.status }
      );
    }

    let musicData = await musicResponse.json();
    let generatedUrl = musicData.url;

    // Handle Mubert polling if track is still processing
    if (provider === "mubert" && musicData.status === "processing" && musicData.id) {
      console.log(`⏳ Mubert track processing, polling for completion...`);
      const maxAttempts = 60; // 5 minutes max
      const interval = 5000; // 5 seconds

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, interval));
        console.log(`  Polling attempt ${attempt + 1}/${maxAttempts}...`);

        const statusRes = await internalFetch(
          `/api/music/mubert/status?id=${musicData.id}&customer_id=${musicData.customer_id}&access_token=${musicData.access_token}`
        );

        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();
        const generation = statusData.data?.generations?.[0];

        if (generation?.status === "done" && generation.url) {
          console.log(`✅ Mubert track ready, uploading to blob storage...`);
          // Re-fetch through provider to get blob URL
          const finalRes = await internalFetch(`/api/music/mubert`, {
            method: "POST",
            body: JSON.stringify({
              prompt,
              duration: adjustedDuration,
              projectId: adId,
              _internal_ready_url: generation.url,
              _internal_track_id: musicData.id,
            }),
          });

          if (finalRes.ok) {
            const finalData = await finalRes.json();
            generatedUrl = finalData.url;
          } else {
            // Fallback to direct URL if blob upload fails
            generatedUrl = generation.url;
          }
          break;
        }
      }
    }

    if (!generatedUrl) {
      return NextResponse.json(
        { error: "No URL returned from music provider" },
        { status: 500 }
      );
    }

    console.log(`🎵 Music generated for ${versionId}:`, {
      provider,
      duration: adjustedDuration,
      url: generatedUrl,
    });

    // Update version with generated URL
    const updatedVersion: MusicVersion = {
      ...(version as MusicVersion),
      generatedUrl,
      duration: adjustedDuration,
      musicPrompt: prompt,
    };

    const redis = getRedisV3();
    const versionKey = AD_KEYS.version(adId, "music", versionId);
    await redis.set(versionKey, JSON.stringify(updatedVersion));

    return NextResponse.json({
      versionId,
      generatedUrl,
      duration: adjustedDuration,
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
