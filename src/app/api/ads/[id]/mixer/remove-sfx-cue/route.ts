/**
 * Mixer API - Remove SFX Cue
 *
 * POST /api/ads/{adId}/mixer/remove-sfx-cue - Remove one sound effect from the mixer
 */

import { rebuildMixer } from "@/lib/mixer/rebuilder";
import { withAdLock } from "@/lib/redis/adLock";
import {
  clearActiveVersion,
  createVersion,
  getActiveVersion,
  getVersion,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import type { SfxVersion, SlotId, VersionId } from "@/types/versions";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/mixer/remove-sfx-cue
 *
 * Remove one cue from the SFX version the mixer pins, together with its
 * index-aligned audio URL and loudness, then rebuild the mixer.
 *
 * - A draft is edited in place, so the SFX panel shows the same cues.
 * - A frozen version is never mutated: a new frozen version without the cue
 *   becomes the stream's active version.
 * - Removing the only cue unpins the SFX stream, like `remove-stream`.
 *
 * Request body:
 * { slotId: SlotId }
 *
 * Response:
 * Updated MixerState after rebuild
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const body = await request.json();
    const { slotId } = body as { slotId?: SlotId };

    if (!slotId) {
      return NextResponse.json(
        { error: "slotId is required" },
        { status: 400 },
      );
    }

    console.log(`🗑️ Removing SFX cue ${slotId} from mixer for ad ${adId}`);

    // The content write is locked on its own: `rebuildMixer` takes the ad
    // lock itself, so it runs after the lock is released.
    const removed = await withAdLock(adId, () => removeCue(adId, slotId), {
      ttlSec: 15,
      timeoutMs: 8_000,
    });

    if (!removed) {
      return NextResponse.json(
        { error: "SFX cue not found in the mixer" },
        { status: 404 },
      );
    }

    const mixerState = await rebuildMixer(adId);

    console.log(
      `✅ Removed SFX cue ${slotId} and rebuilt mixer for ad ${adId}`,
    );

    return NextResponse.json(mixerState);
  } catch (error) {
    console.error("❌ Error removing SFX cue from mixer:", error);
    return NextResponse.json(
      {
        error: "Failed to remove SFX cue from mixer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * Drop the cue from the SFX version the active mixer pins and make the result
 * the stream's active version. Resolves false when no pinned cue has the slot.
 */
async function removeCue(adId: string, slotId: SlotId): Promise<boolean> {
  const mixerId = await getActiveVersion(adId, "mixer");
  const mixer = mixerId ? await getVersion(adId, "mixer", mixerId) : null;
  const sfxId = mixer?.pins.sfx;
  if (!sfxId) return false;

  const sfx = await getVersion(adId, "sfx", sfxId);
  const index = sfx?.soundFxPrompts.findIndex((p) => p.slotId === slotId) ?? -1;
  if (!sfx || index < 0) return false;

  if (sfx.soundFxPrompts.length === 1) {
    await clearActiveVersion(adId, "sfx");
    return true;
  }

  const without = <T>(items: T[]) => items.filter((_, i) => i !== index);
  const updates: Pick<
    SfxVersion,
    "soundFxPrompts" | "generatedUrls" | "integratedLufs"
  > = {
    soundFxPrompts: without(sfx.soundFxPrompts),
    generatedUrls: without(sfx.generatedUrls ?? []),
    integratedLufs: sfx.integratedLufs && without(sfx.integratedLufs),
  };

  let activeId: VersionId = sfxId;
  if (sfx.status === "draft") {
    await updateVersion(adId, "sfx", sfxId, updates);
  } else {
    activeId = await createVersion(adId, "sfx", {
      ...sfx,
      ...updates,
      status: "frozen",
      createdAt: Date.now(),
      createdBy: "user",
      parentVersionId: sfxId,
      requestText: undefined,
    });
  }

  await setActiveVersion(adId, "sfx", activeId);
  return true;
}
