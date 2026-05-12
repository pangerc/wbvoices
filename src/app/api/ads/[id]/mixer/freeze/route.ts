/**
 * POST /api/ads/{id}/mixer/freeze
 *
 * Freezes the active mixer draft into an immutable take. No-op if the
 * active mixer version is already frozen. Returns the updated MixerState.
 *
 * An optional `label` can be provided in the body to tag the take
 * (e.g. "Mandarin", "Before client call"). Useful for the stage-9
 * variant UX; for stage-8d a plain timestamp suffices if omitted.
 */

import { getMixerState } from "@/lib/mixer/rebuilder";
import { withAdLock } from "@/lib/redis/adLock";
import {
  getActiveVersion,
  getVersion,
  updateVersion,
} from "@/lib/redis/versions";
import type { MixerVersion } from "@/types/versions";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const body = (await request.json().catch(() => ({}))) as { label?: string };

    await withAdLock(
      adId,
      async () => {
        const activeId = await getActiveVersion(adId, "mixer");
        if (!activeId) return;
        const active = (await getVersion(
          adId,
          "mixer",
          activeId,
        )) as MixerVersion | null;
        if (!active || active.status !== "draft") return;
        const updates: Partial<MixerVersion> = { status: "frozen" };
        if (typeof body.label === "string" && body.label.trim().length > 0) {
          updates.label = body.label.trim();
        }
        await updateVersion(adId, "mixer", activeId, updates);
        console.log(
          `[mixer-freeze] adId=${adId} versionId=${activeId} label=${body.label ?? "—"}`,
        );
      },
      { ttlSec: 10 },
    );

    const updated = await getMixerState(adId);
    return NextResponse.json(
      updated ?? {
        tracks: [],
        volumes: {},
        calculatedTracks: [],
        totalDuration: 0,
        lastCalculated: Date.now(),
        activeVersions: { voices: null, music: null, sfx: null },
      },
    );
  } catch (error) {
    console.error("❌ Error freezing mixer version:", error);
    return NextResponse.json(
      {
        error: "Failed to freeze mixer version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
