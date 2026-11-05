/**
 * Where clips land, end to end and without I/O: stream versions → seed /
 * reconciled anchors → `deriveTimeline`. Mirrors the placement checks of
 * `e2e/new-project-from-brief.spec.ts` step 7, over the same
 * voices × SFX × placement matrix.
 */

import { deriveTimeline } from "@/lib/mixer/derive-timeline";
import {
  buildSeedAnchors,
  planDraftSync,
  type PinnedVersions,
} from "@/lib/mixer/mixer-reconcile";
import { mockMusicVersionFrozen } from "@/test/fixtures/versions";
import type { SoundFxPlacementIntent } from "@/types";
import type {
  MixerPins,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  VoiceVersion,
} from "@/types/versions";
import { describe, expect, it } from "vitest";

const PINS: MixerPins = { voices: "v1", music: "v1", sfx: "v1" };

/** Voice clips with distinct lengths, so every "after voice k" differs. */
const VOICE_DURATIONS = [2.5, 3.25, 1.75];

function voiceVersion(count: number): VoiceVersion {
  return {
    voiceTracks: VOICE_DURATIONS.slice(0, count).map((d, i) => ({
      slotId: `voice-${i}`,
      voice: null,
      text: `Line ${i + 1}.`,
      playAfter: i === 0 ? "start" : "previous",
      overlap: 0,
      generatedUrl: `https://blob/voice-${i}.mp3`,
      generatedDuration: d,
    })),
    generatedUrls: [],
    createdAt: 0,
    createdBy: "llm",
    status: "frozen",
  } as VoiceVersion;
}

function sfxVersion(placements: SoundFxPlacementIntent[]): SfxVersion {
  return {
    soundFxPrompts: placements.map((placement, i) => ({
      slotId: `sfx-${i}`,
      description: `Sound ${i + 1}`,
      duration: 1.5,
      placement,
      overlap: 0,
    })),
    generatedUrls: placements.map((_, i) => `https://blob/sfx-${i}.mp3`),
    createdAt: 0,
    createdBy: "llm",
    status: "frozen",
  };
}

const music: MusicVersion = {
  ...mockMusicVersionFrozen,
  slotId: "music",
  duration: 30,
};

function pinnedFor(voices: number, placements: SoundFxPlacementIntent[]) {
  return {
    voice: voiceVersion(voices),
    music,
    sfx: sfxVersion(placements),
  } satisfies PinnedVersions;
}

/** A mixer version seeded from `pinned`, the way bootstrap mints one. */
function seededMixer(pinned: PinnedVersions): MixerVersion {
  return {
    anchors: buildSeedAnchors(pinned),
    pins: PINS,
    createdAt: 0,
    createdBy: "llm",
    status: "draft",
  };
}

/** Start/end per clip type, in stream order. */
function timings(pinned: PinnedVersions, mixerVersion: MixerVersion) {
  const { calculatedTracks } = deriveTimeline({
    pins: PINS,
    pinned,
    mixerVersion,
  });
  const of = (type: string) =>
    calculatedTracks
      .filter((t) => t.type === type)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({ start: t.startTime, end: t.startTime + t.duration }));
  return { voice: of("voice"), sfx: of("soundfx"), music: of("music") };
}

type Placement = {
  name: string;
  intent: SoundFxPlacementIntent;
  startOf: (voices: Array<{ start: number; end: number }>) => number;
};

/** Same table as the E2E's `placementsFor`. */
function placementsFor(voices: number): Placement[] {
  return [
    { name: "beginning", intent: { type: "beforeVoices" }, startOf: () => 0 },
    {
      name: "with first voice",
      intent: { type: "withFirstVoice" },
      startOf: (v) => v[0].start,
    },
    {
      name: "end",
      intent: { type: "end" },
      startOf: (v) => Math.max(...v.map((x) => x.end)),
    },
    ...Array.from({ length: voices }, (_, k) => ({
      name: `after voice ${k + 1}`,
      intent: { type: "afterVoice", index: k } as SoundFxPlacementIntent,
      startOf: (v: Array<{ start: number; end: number }>) => v[k].end,
    })),
  ];
}

describe("deriveTimeline", () => {
  describe("voices play back to back", () => {
    it.each([1, 2, 3])("%i voice(s)", (voices) => {
      const pinned = pinnedFor(voices, []);
      const { voice } = timings(pinned, seededMixer(pinned));

      let cursor = 0;
      for (const [i, clip] of voice.entries()) {
        expect(clip.start).toBeCloseTo(cursor, 3);
        expect(clip.end - clip.start).toBeCloseTo(VOICE_DURATIONS[i], 3);
        cursor = clip.end;
      }
    });
  });

  it("music starts at 0", () => {
    const pinned = pinnedFor(2, [{ type: "end" }]);
    const { music: bed } = timings(pinned, seededMixer(pinned));
    expect(bed).toHaveLength(1);
    expect(bed[0].start).toBe(0);
  });

  // voices × SFX × placement — every cue of the version shares one placement.
  for (const voices of [1, 2, 3]) {
    for (const sfx of [1, 2, 3]) {
      describe(`${voices} voice(s) · ${sfx} SFX`, () => {
        it.each(placementsFor(voices).map((p) => [p.name, p] as const))(
          "%s",
          (_, placement) => {
            const pinned = pinnedFor(voices, Array(sfx).fill(placement.intent));
            const t = timings(pinned, seededMixer(pinned));

            expect(t.voice).toHaveLength(voices);
            expect(t.sfx).toHaveLength(sfx);
            for (const cue of t.sfx) {
              expect(cue.start).toBeCloseTo(placement.startOf(t.voice), 3);
            }
          },
        );
      });
    }
  }

  it.todo(
    "beginning: the intro SFX pushes voice 1 to start after it (plan 1c)",
  );

  describe("overlapping voices (dialogue)", () => {
    /**
     * Voice 2 talks over voice 1 and stops first: the last voice in the
     * list is not the one that ends last.
     */
    function overlapping(placements: SoundFxPlacementIntent[]) {
      const voice = voiceVersion(2);
      voice.voiceTracks[0].generatedDuration = 4;
      voice.voiceTracks[1] = {
        ...voice.voiceTracks[1],
        playAfter: "track-0",
        isConcurrent: true,
        generatedDuration: 2.5,
      };
      return { voice, music, sfx: sfxVersion(placements) };
    }

    it("voice 2 starts with voice 1", () => {
      const pinned = overlapping([]);
      const t = timings(pinned, seededMixer(pinned));
      expect(t.voice.map((v) => v.start)).toEqual([0, 0]);
      expect(t.voice.map((v) => v.end)).toEqual([4, 2.5]);
    });

    it("end: the cue starts once every voice has finished", () => {
      const pinned = overlapping([{ type: "end" }]);
      const t = timings(pinned, seededMixer(pinned));
      expect(t.sfx[0].start).toBeCloseTo(4, 3);
    });
  });

  describe("sending a new SFX version to an existing mixer", () => {
    /** Run the send path: reconcile the draft against the new pins. */
    function send(active: MixerVersion, pinned: PinnedVersions) {
      const plan = planDraftSync(active, "m1", PINS, pinned, 0);
      if (plan.kind !== "update-draft") return active;
      return { ...active, pins: plan.pins, anchors: plan.anchors };
    }

    it("moves the cues to the new version's placement", () => {
      const before = pinnedFor(3, [{ type: "beforeVoices" }]);
      const mixer = seededMixer(before);

      const after = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      const t = timings(after, send(mixer, after));

      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });

    it("places cues the previous version didn't have", () => {
      const before = pinnedFor(2, [{ type: "end" }]);
      const mixer = seededMixer(before);

      const after = pinnedFor(2, [
        { type: "end" },
        { type: "withFirstVoice" },
        { type: "afterVoice", index: 0 },
      ]);
      const t = timings(after, send(mixer, after));

      expect(t.sfx.map((c) => c.start)).toEqual([
        expect.closeTo(t.voice[1].end, 3),
        expect.closeTo(t.voice[0].start, 3),
        expect.closeTo(t.voice[0].end, 3),
      ]);
    });

    it("keeps a cue the user dragged", () => {
      const pinned = pinnedFor(2, [{ type: "end" }]);
      const mixer = seededMixer(pinned);
      mixer.anchors["sfx-0"] = {
        anchor: { kind: "absolute", t: 7 },
        origin: "user-edit",
      };

      const t = timings(pinned, send(mixer, pinned));
      expect(t.sfx[0].start).toBe(7);
    });
  });
});
