/**
 * Anchor translation — bridges the authoring-time representations (LLM
 * ordinal-form anchors, SFX placements, legacy playAfter/overlap) to the
 * resolver's slot-id-form {@link Anchor}.
 *
 * Two call sites:
 *   1. Write side: create_voice_draft translates an LLM `anchor` with
 *      `translateAnchorInput` (ordinal refs → slot ids) and stores it on the
 *      track; create_sfx_draft stores the placement the anchor stands for
 *      (`placementFromAnchorInput`), never the anchor.
 *   2. Read side: mixer-reconcile (`seedAnchorForSlot`) derives the
 *      `llm-seed` anchor graph from the pinned content with
 *      `anchorFromVoiceTrack` / `seedForSoundFxPrompt` /
 *      `anchorFromMusicVersion` — at bootstrap and on every draft read.
 *
 * SFX placements seed the placement contract (see `seedForSoundFxPrompt`):
 * cues at one spot play one after another, "at end" waits for every voice
 * and the cues queued on a voice's end, and no cue ever moves a voice.
 */

import {
  ALL_VOICES,
  TIMELINE_ORIGIN,
  isReservedRef,
} from "@/services/timelineResolver";
import type {
  SoundFxPlacementIntent,
  SoundFxPrompt,
  VoiceTrack,
} from "@/types";
import type { Anchor, AnchorLayout, MusicVersion } from "@/types/versions";

/** A seed anchor, and the layout it is placed with (overlay when unset). */
export interface SeedAnchor {
  anchor: Anchor;
  layout?: AnchorLayout;
}

/**
 * The timeline origin's end, plus `t`: where the first voice starts. Cues
 * "at beginning" queue on the same edge; the voice doesn't wait for them.
 */
function fromOrigin(t = 0): Anchor {
  return {
    kind: "relativeTo",
    slotId: TIMELINE_ORIGIN,
    edge: "end",
    ...(t ? { offset: t } : {}),
  };
}

/**
 * Queued on `slotId`'s end, after the cues queued there before it. The clip
 * that follows that edge keeps its place.
 */
function stackedOnEndOf(slotId: string): SeedAnchor {
  return {
    anchor: { kind: "relativeTo", slotId, edge: "end" },
    layout: "push",
  };
}

/**
 * LLM-facing anchor shape (ordinal references).
 * Server translates `trackRef` → slotId via the current version's slot table.
 */
export type AnchorInput =
  | { kind: "absolute"; t: number }
  | {
      kind: "relativeTo";
      trackRef: string;
      edge: "start" | "end";
      offset?: number;
    }
  | {
      kind: "simultaneousWith";
      trackRef: string;
      alignment: "startAtStart" | "endAtEnd" | "centerAtCenter";
      offset?: number;
    }
  | { kind: "atFraction"; trackRef: string; fraction: number };

/** Ordinal → slot id lookup table. Any slot may be undefined if unknown. */
export interface OrdinalRefs {
  voices?: ReadonlyArray<string | undefined>;
  sfx?: ReadonlyArray<string | undefined>;
  music?: string;
}

/**
 * Parse a trackRef like "voice-0", "sfx-2", "music" into its parts.
 * Returns null for unrecognized formats.
 */
export function parseTrackRef(
  ref: string,
): { stream: "voices" | "sfx" | "music"; index: number } | null {
  if (ref === "music") return { stream: "music", index: 0 };
  const m = /^(voice|sfx)-(\d+)$/.exec(ref);
  if (!m) return null;
  const stream = m[1] === "voice" ? "voices" : "sfx";
  const index = Number(m[2]);
  if (!Number.isFinite(index) || index < 0) return null;
  return { stream, index };
}

/** Resolve an ordinal trackRef to its slot id. Returns null if unresolvable. */
export function resolveTrackRef(ref: string, refs: OrdinalRefs): string | null {
  const parsed = parseTrackRef(ref);
  if (!parsed) return null;
  if (parsed.stream === "music") return refs.music ?? null;
  const arr = parsed.stream === "voices" ? refs.voices : refs.sfx;
  return arr?.[parsed.index] ?? null;
}

/**
 * Translate an ordinal-form AnchorInput to a slot-id-form Anchor.
 * Returns null when the ordinal reference can't be resolved — callers
 * should fall back to their own default positioning.
 */
export function translateAnchorInput(
  input: AnchorInput,
  refs: OrdinalRefs,
): Anchor | null {
  if (input.kind === "absolute") {
    return { kind: "absolute", t: input.t };
  }
  const slotId = resolveTrackRef(input.trackRef, refs);
  if (!slotId) return null;

  switch (input.kind) {
    case "relativeTo":
      return {
        kind: "relativeTo",
        slotId,
        edge: input.edge,
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      };
    case "simultaneousWith":
      return {
        kind: "simultaneousWith",
        slotId,
        alignment: input.alignment,
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      };
    case "atFraction":
      return { kind: "atFraction", slotId, fraction: input.fraction };
  }
}

/**
 * The SFX listbox placement an LLM's ordinal-form anchor stands for, or null
 * when it stands for none of them. Placement is what the SFX editor shows and
 * changes, so `create_sfx_draft` stores this instead of the anchor:
 *
 *   relativeTo voice-k end                  → afterVoice k
 *   simultaneousWith voice-0 startAtStart   → withFirstVoice
 *   relativeTo voice-0 start                → withFirstVoice
 *   absolute 0                              → beforeVoices
 *
 * Offsets have no listbox equivalent and are dropped: the placement keeps
 * the intent.
 */
export function placementFromAnchorInput(
  input: AnchorInput,
): SoundFxPlacementIntent | null {
  if (input.kind === "absolute") {
    return input.t === 0 ? { type: "beforeVoices" } : null;
  }

  const ref = parseTrackRef(input.trackRef);
  if (ref?.stream !== "voices") return null;

  if (input.kind === "relativeTo" && input.edge === "end") {
    return { type: "afterVoice", index: ref.index };
  }

  const startsWithFirstVoice =
    ref.index === 0 &&
    ((input.kind === "simultaneousWith" &&
      input.alignment === "startAtStart") ||
      (input.kind === "relativeTo" && input.edge === "start"));

  return startsWithFirstVoice ? { type: "withFirstVoice" } : null;
}

/**
 * Derive an Anchor for a voice track.
 *
 * Priority:
 *   1. track.anchor (slot-id form), while it is a fixed time or references
 *      a voice of this version (or a reserved ref); a fixed time t becomes
 *      relativeTo @origin end + t. A voice never follows an SFX or the
 *      music, and a reference to a line that is gone would put the voice at
 *      0 s; both fall through to 2.
 *   2. Legacy fields: playAfter "start" → @origin end; "track-N" (only an
 *      earlier line, N < ordinalIndex) → its end minus overlap, or its
 *      start when isConcurrent.
 *   3. Default: relativeTo(previous voice, end, -overlap); the first line
 *      relativeTo(@origin, end), whatever its stale playAfter says.
 */
export function anchorFromVoiceTrack(
  track: VoiceTrack,
  voiceSlotIds: ReadonlyArray<string | undefined>,
  ordinalIndex: number,
): Anchor | undefined {
  // A voice placed at a fixed time counts from the timeline origin, like any
  // first voice.
  if (track.anchor && anchorIsPinned(track.anchor, voiceSlotIds)) {
    return track.anchor.kind === "absolute"
      ? fromOrigin(track.anchor.t)
      : track.anchor;
  }

  const { playAfter, overlap, isConcurrent } = track;

  // First track defaults
  if (ordinalIndex === 0 && (!playAfter || playAfter === "start")) {
    return fromOrigin();
  }

  // Explicit "start"
  if (playAfter === "start") return fromOrigin();

  // playAfter: "track-N". Only an earlier line counts: a deletion that didn't
  // renumber the refs (voice data saved before the editor did so, or another
  // writer) can leave "track-N" naming the line itself or one after it — a
  // cycle the resolver would drop at 0s. Those fall back to the previous line.
  if (playAfter) {
    const parsed = /^track-(\d+)$/.exec(playAfter);
    if (parsed && Number(parsed[1]) < ordinalIndex) {
      const refIndex = Number(parsed[1]);
      const refSlotId = voiceSlotIds[refIndex];
      if (refSlotId) {
        if (isConcurrent) {
          return {
            kind: "simultaneousWith",
            slotId: refSlotId,
            alignment: "startAtStart",
          };
        }
        return {
          kind: "relativeTo",
          slotId: refSlotId,
          edge: "end",
          ...(overlap ? { offset: -overlap } : {}),
        };
      }
    }
  }

  // Default: anchor to previous voice's end
  const prevSlotId = voiceSlotIds[ordinalIndex - 1];
  if (prevSlotId) {
    return {
      kind: "relativeTo",
      slotId: prevSlotId,
      edge: "end",
      ...(overlap ? { offset: -overlap } : {}),
    };
  }

  // The first line, whatever its stale playAfter says.
  if (ordinalIndex === 0) return fromOrigin();

  return undefined;
}

/**
 * Whether an anchor's reference is still among the pinned voice and SFX
 * clips (or a reserved ref). An SFX anchor on the music bed, or on a voice a
 * later version dropped (a blank version, a deleted line), doesn't count, so
 * the cue's placement takes over instead of the cue following the music or
 * the resolver putting it at 0s.
 */
function anchorIsPinned(
  anchor: Anchor,
  ...slotIdLists: ReadonlyArray<ReadonlyArray<string | undefined>>
): boolean {
  if (anchor.kind === "absolute" || isReservedRef(anchor.slotId)) return true;
  return slotIdLists.some((ids) => ids.includes(anchor.slotId));
}

/**
 * The slot of the closest cue before `ordinalIndex` that is also "with first
 * voice", if any. Cues sharing that spot play one after another.
 */
function previousWithFirstVoiceSlot(
  prompts: ReadonlyArray<SoundFxPrompt>,
  ordinalIndex: number,
  voiceSlotIds: ReadonlyArray<string | undefined>,
  sfxSlotIds: ReadonlyArray<string | undefined>,
): string | undefined {
  for (let i = ordinalIndex - 1; i >= 0; i--) {
    const prompt = prompts[i];
    if (
      prompt.placement?.type === "withFirstVoice" &&
      !(
        prompt.anchor && anchorIsPinned(prompt.anchor, voiceSlotIds, sfxSlotIds)
      )
    ) {
      return prompt.slotId;
    }
  }
  return undefined;
}

/**
 * Derive the seed for a sound-effect prompt: where it plays and how it
 * treats what comes after it.
 *
 * Priority:
 *   1. prompt.anchor (already slot-id form), while the clip it references is
 *      still pinned — placed as is, overlay.
 *   2. The placement, as the contract the editor shows. Cues at one spot play
 *      one after another, and none of them moves a voice:
 *      - at beginning:    queued on the timeline origin (push); the first
 *                         voice still starts at 0;
 *      - with first voice: with voice 1's start, overlay; a later cue at the
 *                         same spot follows the one before it;
 *      - after voice k:   queued on voice k's end (push); voice k+1 keeps its
 *                         place. A voice the script no longer has plays at
 *                         end;
 *      - at end:          queued on the end of every voice and of the cues
 *                         queued on a voice's end (push).
 *   3. Legacy prompt.playAfter string, overlay; one that no longer resolves
 *      plays at end.
 *   4. undefined (fallback to system default)
 *
 * `prompts` is the version's cue list, which `ordinalIndex` indexes; it lets
 * cues sharing "with first voice" chain.
 */
export function seedForSoundFxPrompt(
  prompt: SoundFxPrompt,
  voiceSlotIds: ReadonlyArray<string | undefined>,
  sfxSlotIds: ReadonlyArray<string | undefined>,
  ordinalIndex: number,
  prompts: ReadonlyArray<SoundFxPrompt> = [],
): SeedAnchor | undefined {
  if (
    prompt.anchor &&
    anchorIsPinned(prompt.anchor, voiceSlotIds, sfxSlotIds)
  ) {
    return { anchor: prompt.anchor };
  }

  const placement = prompt.placement;
  if (placement) {
    switch (placement.type) {
      case "beforeVoices":
      case "start":
        return stackedOnEndOf(TIMELINE_ORIGIN);
      case "withFirstVoice": {
        const previous = previousWithFirstVoiceSlot(
          prompts,
          ordinalIndex,
          voiceSlotIds,
          sfxSlotIds,
        );
        if (previous) {
          return {
            anchor: { kind: "relativeTo", slotId: previous, edge: "end" },
          };
        }

        const first = voiceSlotIds[0];
        return first
          ? {
              anchor: {
                kind: "simultaneousWith",
                slotId: first,
                alignment: "startAtStart",
              },
            }
          : undefined;
      }
      case "afterVoice": {
        // A voice the script no longer has (or one without a slot id yet)
        // plays at end, never at 0 s.
        return stackedOnEndOf(voiceSlotIds[placement.index] ?? ALL_VOICES);
      }
      case "end":
        return stackedOnEndOf(ALL_VOICES);
      case "legacy": {
        const anchor = legacyPlayAfterAnchor(placement.playAfter, voiceSlotIds);
        // A legacy reference that no longer resolves plays at end.
        return anchor ? { anchor } : stackedOnEndOf(ALL_VOICES);
      }
    }
  }

  return undefined;
}

/**
 * A legacy SFX `playAfter` string: "track-N" → voice N's end (overlay),
 * "start" → absolute 0. Undefined when it doesn't resolve.
 */
function legacyPlayAfterAnchor(
  playAfter: string,
  voiceSlotIds: ReadonlyArray<string | undefined>,
): Anchor | undefined {
  const m = /^track-(\d+)$/.exec(playAfter);
  if (m) {
    const ref = voiceSlotIds[Number(m[1])];
    if (ref) return { kind: "relativeTo", slotId: ref, edge: "end" };
  }
  if (playAfter === "start") return { kind: "absolute", t: 0 };

  return undefined;
}

/**
 * Derive an Anchor for a music version. Music has exactly one slot; the anchor
 * positions that slot on the timeline. Default: `absolute(0)` — music starts
 * at timeline start, enveloping the ad.
 */
export function anchorFromMusicVersion(version: MusicVersion): Anchor {
  return version.anchor ?? { kind: "absolute", t: 0 };
}

// ============ Exhaustiveness helper ============

// Fail-fast assertion that the SoundFxPlacementIntent union is covered above.
// Keep in sync with @/types SoundFxPlacementIntent.
type _PlacementVariants = SoundFxPlacementIntent["type"];
type _CoveredVariants =
  | "beforeVoices"
  | "withFirstVoice"
  | "afterVoice"
  | "end"
  | "start"
  | "legacy";
type _Missing = Exclude<_PlacementVariants, _CoveredVariants>;
// If a new variant lands in SoundFxPlacementIntent and is not added to the switch
// above, `_Missing` becomes non-never and this line errors at typecheck time.
const _variantCoverage: _Missing extends never ? true : false = true;
void _variantCoverage;
