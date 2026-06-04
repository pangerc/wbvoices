/**
 * POST /api/ads/{id}/mixer/new-take
 *
 * Single atomic action that matches the "start a new take" mental model:
 *   1. If the active mixer version is a draft, freeze it in place so it
 *      stays recoverable in the take list.
 *   2. Fork the (now-frozen) active into a new draft carrying forward
 *      anchors, overrides, and pins verbatim.
 *   3. Activate the new draft.
 *
 * Compared to the separate freeze + activate endpoints, this collapses
 * the ambiguity around "did my edit create a version?" — drafts now
 * always update in place, and explicit "new take" is the only way to
 * mint a new frozen version. Matches the google-docs "Make a copy" /
 * DAW "Duplicate scene" pattern.
 */

import { getMixerState } from "@/lib/mixer/rebuilder";
import { withAdLock } from "@/lib/redis/adLock";
import {
  createVersion,
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const body = (await request.json().catch(() => ({}))) as { label?: string };

    await withAdLock(
      adId,
      async () => {
        const activeId = await getActiveVersion(adId, "mixer");
        if (!activeId) {
          throw new Error(
            "no active mixer version — generate content first or bootstrap via a mixer read",
          );
        }
        const active = (await getVersion(
          adId,
          "mixer",
          activeId,
        )) as MixerVersion | null;
        if (!active) {
          throw new Error(`active mixer version ${activeId} not found`);
        }

        // Step 1: freeze outgoing draft (if any). Optional label lands on
        // the FROZEN take — that's the one the user might want to find
        // again later.
        if (active.status === "draft") {
          const frozenUpdates: Partial<MixerVersion> = { status: "frozen" };
          if (typeof body.label === "string" && body.label.trim().length > 0) {
            frozenUpdates.label = body.label.trim();
          }
          await updateVersion(adId, "mixer", activeId, frozenUpdates);
        }

        // Step 2: fork. Reload so we carry forward any updates just made
        // (including the status flip) — paranoia, but cheap.
        const source = (await getVersion(
          adId,
          "mixer",
          activeId,
        )) as MixerVersion | null;
        if (!source) {
          throw new Error(`source mixer version ${activeId} vanished mid-fork`);
        }
        const draft: MixerVersion = {
          anchors: source.anchors,
          pins: source.pins,
          overrides: source.overrides,
          createdAt: Date.now(),
          createdBy: "fork",
          status: "draft",
          parentVersionId: activeId,
          label: source.label,
          mixedAudioUrl: source.mixedAudioUrl,
        };
        const newDraftId = await createVersion(adId, "mixer", draft);

        // Step 3: activate the new draft.
        await setActiveVersion(adId, "mixer", newDraftId);

        console.log(
          `[mixer-new-take] adId=${adId} frozePrev=${active.status === "draft"} newDraft=${newDraftId} parent=${activeId}`,
        );
      },
      { ttlSec: 10 },
    );

    const updated = await getMixerState(adId);
    if (!updated) {
      return NextResponse.json(
        { error: "mixer state unavailable after new-take" },
        { status: 500 },
      );
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Error starting new mixer take:", error);
    return NextResponse.json(
      {
        error: "Failed to start new take",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
