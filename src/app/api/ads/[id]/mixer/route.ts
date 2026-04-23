/**
 * Mixer API
 *
 * GET   /api/ads/{adId}/mixer - Get current mixer state (derived from active mixer version).
 * PATCH /api/ads/{adId}/mixer - Persist MixerPanel render output (volumes + mixedAudioUrl)
 *                               onto the active mixer version, forking a frozen active
 *                               into a draft if needed.
 *
 * Both paths go through the mixer version stream post-stage-6. The legacy
 * `ad:{adId}:mixer` single-key blob is retired and must not be written here.
 */

import { NextRequest, NextResponse } from "next/server";
import { applyMixerPatch, getMixerState, type MixerPatch } from "@/lib/mixer/rebuilder";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Getting mixer state for ad ${adId}`);

    const mixerState = await getMixerState(adId);

    if (!mixerState) {
      console.log(`⚠️ No mixer state for ad ${adId}, returning empty`);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = (await request.json()) as Partial<MixerPatch> & {
      // MixerPanel also sends tracks/totalDuration/lastCalculated snapshots
      // today. Those fields are ignored — derivable from the mixer version.
      [key: string]: unknown;
    };

    const patch: MixerPatch = {
      volumes: body.volumes as MixerPatch["volumes"],
      mixedAudioUrl:
        typeof body.mixedAudioUrl === "string" ? body.mixedAudioUrl : undefined,
      anchorUpdates: body.anchorUpdates as MixerPatch["anchorUpdates"],
      trimUpdates: body.trimUpdates as MixerPatch["trimUpdates"],
    };

    console.log(`✏️ Patching mixer state for ad ${adId}`, {
      hasVolumeUpdates: !!patch.volumes && Object.keys(patch.volumes).length > 0,
      hasMixedAudioUrl: !!patch.mixedAudioUrl,
      anchorUpdateCount: patch.anchorUpdates
        ? Object.keys(patch.anchorUpdates).length
        : 0,
      trimUpdateCount: patch.trimUpdates
        ? Object.keys(patch.trimUpdates).length
        : 0,
    });

    const updated = await applyMixerPatch(adId, patch);
    if (!updated) {
      return NextResponse.json(
        {
          error: "Cannot patch mixer state for ad without any content streams",
        },
        { status: 404 }
      );
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Error patching mixer state:", error);
    return NextResponse.json(
      {
        error: "Failed to patch mixer state",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
