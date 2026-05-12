/**
 * Parity check: new TimelineResolver ↔ legacy LegacyTimelineCalculator.
 *
 * On the common "sequential voices with natural overlap" path, both systems
 * should produce equivalent voice positions. Music and SFX have deliberately
 * different semantics in the new model (one-track automation vs multi-clip,
 * push-layout dependency sort vs fixed-phase ordering), so this suite scopes
 * parity to voice sequencing only — enough to build confidence that a stage-6
 * resolver swap won't regress existing ads' voice timing.
 */

import type { MixerTrack } from "@/store/mixerStore";
import type { AnchorEntry } from "@/types/versions";
import { describe, expect, it } from "vitest";
import { LegacyTimelineCalculator } from "../legacyTimelineCalculator";
import {
  resolveTimeline,
  type ResolverInput,
  type SlotState,
} from "../timelineResolver";

const NATURAL_OVERLAP = 0.15; // matches LegacyTimelineCalculator's NATURAL_VOICE_OVERLAP

function legacyVoiceTrack(
  id: string,
  duration: number,
  playAfter?: string,
): MixerTrack {
  return {
    id,
    url: `https://fake.example.com/${id}.mp3`,
    label: id,
    type: "voice",
    duration,
    playAfter,
  };
}

function legacyPositions(tracks: MixerTrack[]) {
  const { calculatedTracks } = LegacyTimelineCalculator.calculateTimings(
    tracks,
    {},
  );
  return Object.fromEntries(
    calculatedTracks.map((t) => [
      t.id,
      { start: t.actualStartTime, end: t.actualStartTime + t.actualDuration },
    ]),
  );
}

function resolverPositions(input: ResolverInput) {
  const r = resolveTimeline(input);
  return Object.fromEntries(
    r.tracks.map((t) => [
      t.slotId,
      { start: t.startTime, end: t.startTime + t.duration },
    ]),
  );
}

function llmAnchor(entry: Omit<AnchorEntry, "origin">): AnchorEntry {
  return { ...entry, origin: "llm-seed" };
}

describe("resolver parity with LegacyTimelineCalculator — voice sequencing", () => {
  it("single voice: identical position", () => {
    const legacy = legacyPositions([legacyVoiceTrack("v1", 4)]);
    const resolver = resolverPositions({
      slots: [{ slotId: "v1", type: "voice", sourceDuration: 4 }],
      anchors: { v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }) },
    });
    expect(resolver.v1.start).toBeCloseTo(legacy.v1.start);
    expect(resolver.v1.end).toBeCloseTo(legacy.v1.end);
  });

  it("three sequential voices with natural overlap (default): parity within 1ms", () => {
    // Legacy: v1 at 0, v2 at v1.end - 0.15, v3 at v2.end - 0.15
    const legacy = legacyPositions([
      legacyVoiceTrack("v1", 4),
      legacyVoiceTrack("v2", 3),
      legacyVoiceTrack("v3", 3.5),
    ]);
    // Resolver: explicit relativeTo with -NATURAL_OVERLAP encodes the same intent.
    const slots: SlotState[] = [
      { slotId: "v1", type: "voice", sourceDuration: 4 },
      { slotId: "v2", type: "voice", sourceDuration: 3 },
      { slotId: "v3", type: "voice", sourceDuration: 3.5 },
    ];
    const resolver = resolverPositions({
      slots,
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: {
            kind: "relativeTo",
            slotId: "v1",
            edge: "end",
            offset: -NATURAL_OVERLAP,
          },
        }),
        v3: llmAnchor({
          anchor: {
            kind: "relativeTo",
            slotId: "v2",
            edge: "end",
            offset: -NATURAL_OVERLAP,
          },
        }),
      },
    });

    expect(resolver.v1.start).toBeCloseTo(legacy.v1.start, 3);
    expect(resolver.v1.end).toBeCloseTo(legacy.v1.end, 3);
    expect(resolver.v2.start).toBeCloseTo(legacy.v2.start, 3);
    expect(resolver.v2.end).toBeCloseTo(legacy.v2.end, 3);
    expect(resolver.v3.start).toBeCloseTo(legacy.v3.start, 3);
    expect(resolver.v3.end).toBeCloseTo(legacy.v3.end, 3);
  });

  it("two voices with explicit playAfter + 0 overlap: parity", () => {
    const legacy = legacyPositions([
      { ...legacyVoiceTrack("v1", 4), overlap: 0 },
      { ...legacyVoiceTrack("v2", 3, "v1"), overlap: 0 },
    ]);
    const resolver = resolverPositions({
      slots: [
        { slotId: "v1", type: "voice", sourceDuration: 4 },
        { slotId: "v2", type: "voice", sourceDuration: 3 },
      ],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: {
            kind: "relativeTo",
            slotId: "v1",
            edge: "end",
            offset: 0,
          },
        }),
      },
    });
    expect(resolver.v2.start).toBeCloseTo(legacy.v2.start, 3);
  });
});
