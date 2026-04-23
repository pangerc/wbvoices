/**
 * Anchor translation — bridges the authoring-time representations (LLM
 * ordinal-form, legacy playAfter/overlap/placement) to the resolver's
 * slot-id-form {@link Anchor}.
 *
 * Two call sites:
 *   1. Write side (stage 4): when the LLM passes an `anchor` on a
 *      create_*_draft tool call, `translateAnchorInput` converts ordinal
 *      refs ("voice-0", "sfx-2", "music") to slot ids and we persist the
 *      slot-id-form anchor directly on the track.
 *   2. Read side (stage 6 lazy bootstrap): when materializing `mixer:v1`
 *      from an existing ad whose stream versions predate stage 4 (only
 *      have legacy fields), `anchorFromVoiceTrack` / `anchorFromSoundFxPrompt`
 *      / `anchorFromMusicVersion` produce the equivalent Anchor so the
 *      mixer version's anchor graph carries `llm-seed` provenance.
 *
 * Legacy translation is best-effort. It preserves voice sequencing (parity-
 * tested in stage 3), but intentionally does NOT apply `layout: push` to
 * legacy sfx "afterVoice" — push is opted into by new LLM emissions or
 * user drag (stage 8). Legacy ads continue to exhibit their pre-redesign
 * sfx-overlay behavior unless re-authored.
 */

import type { VoiceTrack, SoundFxPrompt, SoundFxPlacementIntent } from "@/types";
import type { Anchor, MusicVersion } from "@/types/versions";

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
  ref: string
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
  refs: OrdinalRefs
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
 * Derive an Anchor for a voice track.
 *
 * Priority:
 *   1. track.anchor (already slot-id form, from stage 4 LLM seeds)
 *   2. Legacy fields (playAfter, overlap, isConcurrent) translated against
 *      the voice version's slot ids.
 *   3. Default: absolute(0) for ordinal 0, relativeTo(prev, end, 0) otherwise.
 */
export function anchorFromVoiceTrack(
  track: VoiceTrack,
  voiceSlotIds: ReadonlyArray<string | undefined>,
  ordinalIndex: number
): Anchor | undefined {
  if (track.anchor) return track.anchor;

  const { playAfter, overlap, isConcurrent } = track;

  // First track defaults
  if (ordinalIndex === 0 && (!playAfter || playAfter === "start")) {
    return { kind: "absolute", t: 0 };
  }

  // Explicit "start"
  if (playAfter === "start") return { kind: "absolute", t: 0 };

  // playAfter: "track-N"
  if (playAfter) {
    const parsed = /^track-(\d+)$/.exec(playAfter);
    if (parsed) {
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

  return undefined;
}

/**
 * Derive an Anchor for a sound-effect prompt.
 *
 * Priority:
 *   1. prompt.anchor (already slot-id form)
 *   2. SoundFxPlacementIntent translated against voice slot ids
 *   3. Legacy prompt.playAfter string
 *   4. undefined (fallback to system default)
 */
export function anchorFromSoundFxPrompt(
  prompt: SoundFxPrompt,
  voiceSlotIds: ReadonlyArray<string | undefined>,
  _sfxSlotIds: ReadonlyArray<string | undefined>,
  _ordinalIndex: number
): Anchor | undefined {
  if (prompt.anchor) return prompt.anchor;

  const placement = prompt.placement;
  if (placement) {
    switch (placement.type) {
      case "beforeVoices":
      case "start":
        return { kind: "absolute", t: 0 };
      case "withFirstVoice": {
        const first = voiceSlotIds[0];
        return first
          ? {
              kind: "simultaneousWith",
              slotId: first,
              alignment: "startAtStart",
            }
          : undefined;
      }
      case "afterVoice": {
        const ref = voiceSlotIds[placement.index];
        return ref
          ? { kind: "relativeTo", slotId: ref, edge: "end" }
          : undefined;
      }
      case "end": {
        const last = voiceSlotIds[voiceSlotIds.length - 1];
        return last
          ? { kind: "relativeTo", slotId: last, edge: "end" }
          : undefined;
      }
      case "legacy": {
        // Legacy string playAfter — translate identically to the track-N voice path
        const m = /^track-(\d+)$/.exec(placement.playAfter);
        if (m) {
          const ref = voiceSlotIds[Number(m[1])];
          if (ref)
            return { kind: "relativeTo", slotId: ref, edge: "end" };
        }
        if (placement.playAfter === "start") {
          return { kind: "absolute", t: 0 };
        }
        return undefined;
      }
    }
  }

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
