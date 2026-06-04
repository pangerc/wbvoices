/**
 * POST /api/ads/{id}/mixer/{versionId}/activate
 *
 * Switches the active mixer version to `versionId`. If the previously-
 * active mixer version was a draft, it's auto-frozen first so the user's
 * work is preserved (lossless take switching). Returns the updated
 * MixerState.
 *
 * Stage 9's variant A/B preview will layer on top of this — the core
 * "switch the active pointer" mechanic is what that UX depends on.
 */

import { getMixerState } from "@/lib/mixer/rebuilder";
import { withAdLock } from "@/lib/redis/adLock";
import {
  getActiveVersion,
  getVersion,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import type { MixerVersion } from "@/types/versions";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id: adId, versionId } = await params;

    await withAdLock(
      adId,
      async () => {
        // Verify the target exists before touching anything.
        const target = (await getVersion(
          adId,
          "mixer",
          versionId,
        )) as MixerVersion | null;
        if (!target) {
          throw new Error(`mixer version ${versionId} not found`);
        }

        // Auto-freeze any outgoing draft so it stays recoverable in the
        // version list. Matches the "one draft per ad" invariant — we
        // don't want two drafts coexisting even transiently.
        const prevId = await getActiveVersion(adId, "mixer");
        if (prevId && prevId !== versionId) {
          const prev = (await getVersion(
            adId,
            "mixer",
            prevId,
          )) as MixerVersion | null;
          if (prev && prev.status === "draft") {
            await updateVersion(adId, "mixer", prevId, { status: "frozen" });
            console.log(
              `[mixer-activate] auto-froze outgoing draft ${prevId} before switching to ${versionId}`,
            );
          }
        }

        await setActiveVersion(adId, "mixer", versionId);
      },
      { ttlSec: 10 },
    );

    const updated = await getMixerState(adId);
    if (!updated) {
      return NextResponse.json(
        { error: "Mixer state unavailable after activate" },
        { status: 500 },
      );
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Error activating mixer version:", error);
    return NextResponse.json(
      {
        error: "Failed to activate mixer version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
