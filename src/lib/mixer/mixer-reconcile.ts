/**
 * Pure mixer-version reconciliation.
 *
 * Everything here takes plain data and returns plain data — no Redis, no
 * locks. `rebuilder.ts` and `bootstrap.ts` are the I/O shells that load the
 * inputs, call into this module, and persist the result.
 */

import {
  anchorFromMusicVersion,
  anchorFromVoiceTrack,
  seedForSoundFxPrompt,
  type SeedAnchor,
} from "@/lib/tools/anchorTranslation";
import { isReservedRef } from "@/services/timelineResolver";
import type {
  Anchor,
  AnchorEntry,
  ClipOverrides,
  MixerPins,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  SlotId,
  VersionId,
  VoiceVersion,
} from "@/types/versions";

/** The content versions a mixer version's pins resolve to. */
export interface PinnedVersions {
  voice: VoiceVersion | null;
  music: MusicVersion | null;
  sfx: SfxVersion | null;
}

/** Patch body accepted by PATCH /mixer. */
export interface MixerPatch {
  /** Track-id-keyed volumes as the MixerPanel UI sends them. */
  volumes?: Record<string, number>;
  /** URL of the most recent rendered mix uploaded to blob storage. */
  mixedAudioUrl?: string;
  /**
   * Slot-id-keyed anchor updates. Merges non-destructively — anchors not
   * referenced here are preserved.
   *
   * - Non-null value: overwrite with `origin: "user-edit"`. Stage-6
   *   precedence (user-edit wins on stream regen) kicks in automatically.
   *   An existing `layout` is kept only when the new anchor is `relativeTo`
   *   (push only composes with an edge anchor); otherwise it is dropped.
   * - `null` value: reset. Server re-derives from the stream-level seed
   *   (SFX `placement`, voice `playAfter` / anchor, etc.) and writes it with
   *   `origin: "llm-seed"` and the seed's own layout. Used by the SFX panel's
   *   "Reset placement" action when the user wants to revert a mixer drag.
   */
  anchorUpdates?: Record<SlotId, Anchor | null>;
  /**
   * Slot-id-keyed trim updates. Writes onto `overrides[slotId].trim`.
   * Null clears the trim (clip plays full source). Values must satisfy
   * `0 <= start < end <= sourceDuration`; the server doesn't know the
   * source duration at write time, so the client is responsible for
   * clamping before sending.
   */
  trimUpdates?: Record<SlotId, { start: number; end: number } | null>;
}

// ============ Track id ↔ slot id ============

/**
 * Resolve the stable slot id for a rendered track. Track ids encode the stream
 * version + ordinal (`voice-v3-0`, `sfx-v1-1`, `music-v2`); the slot id lives
 * on the matching content version's clip. This adapter is the bridge between
 * the two namespaces and is shared by PATCH /mixer and state derivation.
 */
export function slotIdForTrack(
  track: { id: string; type: "voice" | "music" | "soundfx" },
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null,
): string | null {
  if (track.type === "voice") {
    const m = /^voice-[^-]+-(\d+)$/.exec(track.id);
    if (!m || !voiceVersion) return null;
    return voiceVersion.voiceTracks[Number(m[1])]?.slotId ?? null;
  }
  if (track.type === "music") {
    return musicVersion?.slotId ?? null;
  }
  if (track.type === "soundfx") {
    const m = /^sfx-[^-]+-(\d+)$/.exec(track.id);
    if (!m || !sfxVersion) return null;
    return sfxVersion.soundFxPrompts[Number(m[1])]?.slotId ?? null;
  }
  return null;
}

/**
 * Recover the track type from its id so `slotIdForTrack` can resolve the
 * slot without the caller supplying it. Track ids are stable by construction
 * (`voice-{versionId}-{n}`, `sfx-{versionId}-{n}`, `music-{versionId}`).
 */
export function inferTrackShape(trackId: string): {
  id: string;
  type: "voice" | "music" | "soundfx";
} {
  if (trackId.startsWith("voice-")) return { id: trackId, type: "voice" };
  if (trackId.startsWith("music-")) return { id: trackId, type: "music" };
  if (trackId.startsWith("sfx-")) return { id: trackId, type: "soundfx" };
  return { id: trackId, type: "voice" };
}

// ============ Anchor seeding ============

/**
 * Derive the stream-level seed for one slot of the pinned content — the
 * anchor the placement vocabulary (or the LLM) authored, and its layout.
 * Null when the slot isn't part of the pinned versions or carries no seed.
 */
export function seedAnchorForSlot(
  slotId: SlotId,
  pinned: PinnedVersions,
): SeedAnchor | null {
  const voiceSlotIds = pinned.voice?.voiceTracks.map((t) => t.slotId) ?? [];

  if (pinned.voice) {
    const vIndex = voiceSlotIds.indexOf(slotId);
    if (vIndex >= 0) {
      const anchor = anchorFromVoiceTrack(
        pinned.voice.voiceTracks[vIndex],
        voiceSlotIds,
        vIndex,
      );
      return anchor ? { anchor } : null;
    }
  }
  if (pinned.music && pinned.music.slotId === slotId) {
    return { anchor: anchorFromMusicVersion(pinned.music) };
  }
  if (pinned.sfx) {
    const prompts = pinned.sfx.soundFxPrompts;
    const sfxSlotIds = prompts.map((p) => p.slotId);
    const sIndex = sfxSlotIds.indexOf(slotId);
    if (sIndex >= 0) {
      return (
        seedForSoundFxPrompt(
          prompts[sIndex],
          voiceSlotIds,
          sfxSlotIds,
          sIndex,
          prompts,
        ) ?? null
      );
    }
  }
  return null;
}

/** The `llm-seed` anchor entry for a seed, with the seed's own layout. */
function seedEntry(seed: SeedAnchor): AnchorEntry {
  return {
    anchor: seed.anchor,
    origin: "llm-seed",
    ...(seed.layout ? { layout: seed.layout } : {}),
  };
}

/** Every slot id the pinned content declares, in voice → sfx → music order. */
export function pinnedSlotIds(pinned: PinnedVersions): SlotId[] {
  const ids: SlotId[] = [];
  for (const t of pinned.voice?.voiceTracks ?? []) {
    if (t.slotId) ids.push(t.slotId);
  }
  for (const p of pinned.sfx?.soundFxPrompts ?? []) {
    if (p.slotId) ids.push(p.slotId);
  }
  if (pinned.music?.slotId) ids.push(pinned.music.slotId);
  return ids;
}

/**
 * Build the full `llm-seed` anchor graph for the pinned content. Slots
 * without a seed are left out; the resolver places those at its default.
 */
export function buildSeedAnchors(
  pinned: PinnedVersions,
): Record<SlotId, AnchorEntry> {
  const anchors: Record<SlotId, AnchorEntry> = {};
  for (const slotId of pinnedSlotIds(pinned)) {
    const seed = seedAnchorForSlot(slotId, pinned);
    if (seed) anchors[slotId] = seedEntry(seed);
  }
  return anchors;
}

/** Mint a stable slot id for a new voice track / sfx prompt / music bed. */
export function mintSlotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function refSlot(anchor: Anchor): SlotId | undefined {
  return anchor.kind === "absolute" ? undefined : anchor.slotId;
}

/**
 * Bring the anchor graph in line with newly pinned content:
 *
 * - A `user-edit` anchor survives as long as the slot it references is still
 *   pinned (or is a reserved reference) — the user's drag outlives stream
 *   regeneration, and keeps its layout.
 * - Everything else is re-seeded from the stream (`llm-seed`), with the
 *   seed's layout, so new slots get placed and changed placements actually
 *   move the clip. A slot without a seed is left to the resolver.
 * - Anchors for slots no longer pinned are dropped.
 */
export function reconcileAnchors(
  anchors: MixerVersion["anchors"],
  pinned: PinnedVersions,
): MixerVersion["anchors"] {
  const slots = new Set(pinnedSlotIds(pinned));
  const next: MixerVersion["anchors"] = {};
  for (const slotId of slots) {
    const existing = anchors[slotId];
    if (existing?.origin === "user-edit") {
      const ref = refSlot(existing.anchor);
      if (!ref || isReservedRef(ref) || (ref !== slotId && slots.has(ref))) {
        next[slotId] = existing;
        continue;
      }
      console.warn(
        `[mixer-reconcile] user-edit anchor on ${slotId} references missing slot ${ref}; re-seeding`,
      );
    }
    const seed = seedAnchorForSlot(slotId, pinned);
    if (seed) next[slotId] = seedEntry(seed);
  }
  return next;
}

function anchorsEqual(
  a: MixerVersion["anchors"],
  b: MixerVersion["anchors"],
): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

// ============ Draft / pin sync ============

/** What `ensureMixerDraftWithCurrentPins` must persist. */
export type DraftSyncPlan =
  | { kind: "noop" }
  | {
      kind: "update-draft";
      pins: MixerPins;
      anchors: MixerVersion["anchors"];
    }
  | { kind: "fork"; draft: MixerVersion };

export function pinsEqual(a: MixerPins, b: MixerPins): boolean {
  return a.voices === b.voices && a.music === b.music && a.sfx === b.sfx;
}

/**
 * Decide how the active mixer version must change so that a draft exists
 * pinning the current stream actives, with its anchor graph reconciled
 * against that content. A frozen active is forked into a new draft carrying
 * forward its anchor graph + overrides.
 */
export function planDraftSync(
  active: MixerVersion,
  activeId: VersionId,
  streamActives: MixerPins,
  pinned: PinnedVersions,
  now: number,
): DraftSyncPlan {
  const anchors = reconcileAnchors(active.anchors, pinned);
  if (active.status === "frozen") {
    return {
      kind: "fork",
      draft: {
        anchors,
        pins: streamActives,
        overrides: active.overrides,
        createdAt: now,
        createdBy: "fork",
        status: "draft",
        parentVersionId: activeId,
        label: active.label,
      },
    };
  }
  if (
    !pinsEqual(active.pins, streamActives) ||
    !anchorsEqual(active.anchors, anchors)
  ) {
    return { kind: "update-draft", pins: streamActives, anchors };
  }
  return { kind: "noop" };
}

// ============ PATCH /mixer ============

/**
 * Compute the mixer-version update a PATCH produces against the active
 * draft and its pinned content.
 */
export function computePatchedVersion(
  active: MixerVersion,
  pinned: PinnedVersions,
  patch: MixerPatch,
): Partial<MixerVersion> {
  const nextOverrides: Record<SlotId, ClipOverrides> = {
    ...(active.overrides ?? {}),
  };
  if (patch.volumes) {
    for (const [trackId, volume] of Object.entries(patch.volumes)) {
      if (typeof volume !== "number") continue;
      const slotId = slotIdForTrack(
        inferTrackShape(trackId),
        pinned.voice,
        pinned.music,
        pinned.sfx,
      );
      if (!slotId) continue;
      nextOverrides[slotId] = { ...(nextOverrides[slotId] ?? {}), volume };
    }
  }
  if (patch.trimUpdates) {
    for (const [slotId, trim] of Object.entries(patch.trimUpdates)) {
      if (trim === null) {
        // Clear trim; leave other overrides on the slot untouched.
        if (nextOverrides[slotId]) {
          const { trim: _trim, ...rest } = nextOverrides[slotId];
          if (Object.keys(rest).length > 0) {
            nextOverrides[slotId] = rest;
          } else {
            delete nextOverrides[slotId];
          }
        }
        continue;
      }
      if (
        !trim ||
        typeof trim.start !== "number" ||
        typeof trim.end !== "number" ||
        trim.start < 0 ||
        trim.end <= trim.start
      ) {
        continue;
      }
      nextOverrides[slotId] = { ...(nextOverrides[slotId] ?? {}), trim };
    }
  }

  const updates: Partial<MixerVersion> = { overrides: nextOverrides };
  if (typeof patch.mixedAudioUrl === "string") {
    updates.mixedAudioUrl = patch.mixedAudioUrl;
  }
  if (patch.anchorUpdates) {
    const nextAnchors: MixerVersion["anchors"] = { ...active.anchors };
    for (const [slotId, anchor] of Object.entries(patch.anchorUpdates)) {
      if (anchor === null) {
        // Reset: re-derive from the pinned stream seed, layout included.
        const seed = seedAnchorForSlot(slotId, pinned);
        if (seed) {
          nextAnchors[slotId] = seedEntry(seed);
        } else {
          // No recoverable stream seed — remove the override entirely; the
          // resolver will fall back to its system-default behavior.
          delete nextAnchors[slotId];
        }
        continue;
      }
      if (!anchor) continue;
      // Push only composes with an edge anchor: a cue dragged off its edge
      // to a free position leaves the queue at that edge.
      const existingLayout =
        anchor.kind === "relativeTo" ? nextAnchors[slotId]?.layout : undefined;
      nextAnchors[slotId] = {
        anchor,
        origin: "user-edit",
        ...(existingLayout ? { layout: existingLayout } : {}),
      };
    }
    updates.anchors = nextAnchors;
  }
  return updates;
}
