/**
 * Where clips land, end to end and without I/O: stream versions → seed /
 * reconciled anchors → `deriveTimeline`. Each kind of change moves only what
 * depends on it:
 *
 * - a music change moves nothing but the music clip;
 * - a voice change moves the voices, and the SFX placed against them;
 * - an SFX change moves only the SFX: never a voice, never the music.
 *
 * The SFX placement contract, the same one `e2e/support/sfx-placements.ts`
 * checks in the browser:
 *
 * - At beginning: the first cue starts at 0, over voice 1.
 * - With first voice: the first cue starts with voice 1.
 * - After voice k: the first cue starts at voice k's end, over voice k+1.
 * - At end: the first cue starts once every voice has finished, and after any
 *   cues queued on a voice's end.
 *
 * Several cues at one spot play one after another, in cue order, and the
 * lines keep their place whatever the cues do. The grids below run that
 * contract against four line layouts (back to back, first line late,
 * interrupting, dialogue) and every kind of change. A mixer drag (`user-edit`)
 * overrides the placement. A stale reference (a voice that's gone, or has no
 * audio) never sends a clip to 0.
 */

import { deriveTimeline } from "@/lib/mixer/derive-timeline";
import {
  buildSeedAnchors,
  computePatchedVersion,
  planDraftSync,
  type PinnedVersions,
} from "@/lib/mixer/mixer-reconcile";
import { reconcileSlots } from "@/lib/tools/slotReconciliation";
import { mockMusicVersionFrozen } from "@/test/fixtures/versions";
import type { SoundFxPlacementIntent, VoiceTrack } from "@/types";
import type {
  Anchor,
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

/** Cue lengths, distinct so a cue that starts on the wrong neighbour shows. */
const CUE_DURATIONS = [1.5, 0.75, 1.25];

/** One voice clip per duration, back to back, slot ids `{slotPrefix}-{i}`. */
function voiceVersion(
  durations: readonly number[],
  slotPrefix = "voice",
): VoiceVersion {
  return {
    voiceTracks: durations.map((d, i) => ({
      slotId: `${slotPrefix}-${i}`,
      voice: null,
      text: `Line ${i + 1}.`,
      playAfter: i === 0 ? "start" : "previous",
      overlap: 0,
      generatedUrl: `https://blob/${slotPrefix}-${i}.mp3`,
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
      duration: CUE_DURATIONS[i % CUE_DURATIONS.length],
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
    voice: voiceVersion(VOICE_DURATIONS.slice(0, voices)),
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

/**
 * Run the send path: reconcile the draft against the new pins, or fork a
 * saved take into a new draft.
 */
function send(active: MixerVersion, pinned: PinnedVersions): MixerVersion {
  const plan = planDraftSync(active, "m1", PINS, pinned, 0);
  if (plan.kind === "fork") return plan.draft;
  if (plan.kind === "noop") return active;

  return { ...active, pins: plan.pins, anchors: plan.anchors };
}

/** A take saved from `pinned`: frozen, with its resolver output cached. */
function savedTake(pinned: PinnedVersions): MixerVersion {
  const draft = seededMixer(pinned);
  const { calculatedTracks, resolved } = deriveTimeline({
    pins: PINS,
    pinned,
    mixerVersion: draft,
  });

  return {
    ...draft,
    status: "frozen",
    cachedResolverOutput: {
      calculatedTracks,
      totalDuration: resolved.totalDuration,
      calculatedAt: 0,
    },
  };
}

/** Apply a PATCH /mixer trim body to the draft. */
function trimmed(
  mixer: MixerVersion,
  pinned: PinnedVersions,
  trimUpdates: Record<string, { start: number; end: number }>,
): MixerVersion {
  return {
    ...mixer,
    ...computePatchedVersion(mixer, pinned, { trimUpdates }),
  };
}

/** Apply a PATCH /mixer body to the draft, as the mixer panel sends it. */
function patched(
  mixer: MixerVersion,
  pinned: PinnedVersions,
  anchorUpdates: Record<string, Anchor | null>,
): MixerVersion {
  return {
    ...mixer,
    ...computePatchedVersion(mixer, pinned, { anchorUpdates }),
  };
}

/**
 * A voice version the LLM rewrote from `parent`: slot ids carry over by
 * position, as `create_voice_draft` assigns them.
 */
function rewrittenVoices(
  parent: VoiceVersion,
  durations: readonly number[],
  layout: VoiceLayout = BACK_TO_BACK,
): VoiceVersion {
  const { assigned } = reconcileSlots(
    parent.voiceTracks.map((t) => t.slotId),
    durations.length,
    "voices",
    "v1",
  );
  const next = layoutVersion(layout, durations);

  next.voiceTracks.forEach((track, i) => {
    track.slotId = assigned[i];
  });

  return next;
}

type Span = { start: number; end: number };

/** Start/end per clip type, in stream order. */
function timings(pinned: PinnedVersions, mixerVersion: MixerVersion) {
  const { calculatedTracks } = deriveTimeline({
    pins: PINS,
    pinned,
    mixerVersion,
  });
  // By the index the id ends with: as strings, `sfx-v1-10` sorts before
  // `sfx-v1-2`.
  const index = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1));
  const of = (type: string): Span[] =>
    calculatedTracks
      .filter((t) => t.type === type)
      .sort((a, b) => index(a.id) - index(b.id))
      .map((t) => ({ start: t.startTime, end: t.startTime + t.duration }));

  return { voice: of("voice"), sfx: of("soundfx"), music: of("music") };
}

/** Matches spans to the millisecond, with a readable diff when it doesn't. */
function spans(expected: Span[]) {
  return expected.map(({ start, end }) => ({
    start: expect.closeTo(start, 3),
    end: expect.closeTo(end, 3),
  }));
}

/** How a script's lines are timed against each other. */
type VoiceLayout = {
  name: string;
  /** The fewest lines the layout makes sense with. */
  minVoices: number;
  /** Line lengths, used unless a case passes its own. */
  durations: readonly number[];
  /** Line `i`'s timing fields, as `create_voice_draft` writes them. */
  timing: (i: number) => Partial<VoiceTrack>;
  /** Where lines of these lengths play: the cues never change it. */
  spans: (durations: readonly number[]) => Span[];
};

/** Each line where the one before it ends, the first at `from`. */
function chained(durations: readonly number[], from = 0, overlap = 0): Span[] {
  let cursor = from;

  return durations.map((duration, i) => {
    const start = i === 0 ? cursor : Math.max(0, cursor - overlap);
    cursor = start + duration;

    return { start, end: cursor };
  });
}

const BACK_TO_BACK: VoiceLayout = {
  name: "back to back",
  minVoices: 1,
  durations: VOICE_DURATIONS,
  timing: (i) => ({ playAfter: i === 0 ? "start" : "previous" }),
  spans: (durations) => chained(durations),
};

/** Line 1 at 1.5s, set by the AI's absolute anchor; the rest back to back. */
const FIRST_LINE_LATE: VoiceLayout = {
  name: "first line late",
  minVoices: 1,
  durations: VOICE_DURATIONS,
  timing: (i) =>
    i === 0
      ? { playAfter: "start", anchor: { kind: "absolute", t: 1.5 } }
      : { playAfter: "previous" },
  spans: (durations) => chained(durations, 1.5),
};

/** Each line cuts in 0.5s before the one before it ends. */
const INTERRUPTING: VoiceLayout = {
  name: "interrupting",
  minVoices: 2,
  durations: VOICE_DURATIONS,
  timing: (i) =>
    i === 0 ? { playAfter: "start" } : { playAfter: "previous", overlap: 0.5 },
  spans: (durations) => chained(durations, 0, 0.5),
};

/**
 * Line 2 talks over line 1 and stops first, so the last line in the script
 * isn't the last to finish; line 3 follows line 1, and any later line the one
 * before it.
 */
const DIALOGUE: VoiceLayout = {
  name: "dialogue",
  minVoices: 2,
  durations: [4, 2.5, 1.75],
  timing: (i) => {
    if (i === 0) return { playAfter: "start" };
    if (i === 1) return { playAfter: "track-0", isConcurrent: true };
    if (i === 2) return { playAfter: "track-0" };
    return { playAfter: "previous" };
  },
  spans: (durations) => {
    const out: Span[] = [];
    durations.forEach((duration, i) => {
      let start = 0;
      if (i === 2) start = out[0].end;
      if (i > 2) start = out[i - 1].end;
      out.push({ start, end: start + duration });
    });

    return out;
  },
};

const LAYOUTS = [BACK_TO_BACK, FIRST_LINE_LATE, INTERRUPTING, DIALOGUE];

/** Line counts a layout runs with: from its minimum to 3. */
function voiceCounts(layout: VoiceLayout): number[] {
  return [1, 2, 3].filter((voices) => voices >= layout.minVoices);
}

/** One line per duration, timed by `layout`, slot ids `{slotPrefix}-{i}`. */
function layoutVersion(
  layout: VoiceLayout,
  durations: readonly number[],
  slotPrefix = "voice",
): VoiceVersion {
  return {
    voiceTracks: durations.map((d, i) => ({
      slotId: `${slotPrefix}-${i}`,
      voice: null,
      text: `Line ${i + 1}.`,
      overlap: 0,
      generatedUrl: `https://blob/${slotPrefix}-${i}.mp3`,
      generatedDuration: d,
      ...layout.timing(i),
    })),
    generatedUrls: [],
    createdAt: 0,
    createdBy: "llm",
    status: "frozen",
  } as VoiceVersion;
}

/** `layout`'s first `voices` lines, the music bed and cues at `placements`. */
function layoutPinned(
  layout: VoiceLayout,
  voices: number,
  placements: SoundFxPlacementIntent[],
) {
  return {
    voice: layoutVersion(layout, layout.durations.slice(0, voices)),
    music,
    sfx: sfxVersion(placements),
  } satisfies PinnedVersions;
}

/** A cue, as the reference model sees it. */
type Cue = { placement: SoundFxPlacementIntent; duration: number };

function cuesOf(sfx: SfxVersion): Cue[] {
  return sfx.soundFxPrompts.map((prompt) => ({
    placement: prompt.placement!,
    duration: prompt.duration!,
  }));
}

/**
 * The placement contract as a reference model: where each cue starts, from
 * the lines' spans alone (script order).
 *
 * - At beginning: 0. With first voice: line 1's start. After voice k: line
 *   k's end.
 * - At end, or after a line the script doesn't have: once every line has
 *   finished and every after-voice queue has played.
 * - Cues at one spot play one after another, in cue order.
 */
function expectedCues(voice: Span[], cues: Cue[]): Span[] {
  const spotOf = ({ placement }: Cue): string => {
    switch (placement.type) {
      case "beforeVoices":
      case "start":
        return "beginning";
      case "withFirstVoice":
        return "first";
      case "afterVoice":
        return placement.index < voice.length
          ? `after ${placement.index}`
          : "end";
      default:
        return "end";
    }
  };
  const startOf = (spot: string): number => {
    if (spot === "beginning") return 0;
    if (spot === "first") return voice[0].start;
    return voice[Number(spot.slice("after ".length))].end;
  };

  const queueEnds = new Map<string, number>();
  const placed: Span[] = [];
  const spots = cues.map(spotOf);

  spots.forEach((spot, i) => {
    if (spot === "end") return;

    const start = queueEnds.get(spot) ?? startOf(spot);
    placed[i] = { start, end: start + cues[i].duration };
    queueEnds.set(spot, placed[i].end);
  });

  const afterVoiceEnds = [...queueEnds]
    .filter(([spot]) => spot.startsWith("after "))
    .map(([, end]) => end);
  let next = Math.max(0, ...voice.map((v) => v.end), ...afterVoiceEnds);

  spots.forEach((spot, i) => {
    if (spot !== "end") return;

    placed[i] = { start: next, end: next + cues[i].duration };
    next = placed[i].end;
  });

  return placed;
}

/** One cue at every spot the listbox offers for `voices` lines. */
function everySpot(voices: number): SoundFxPlacementIntent[] {
  return [
    { type: "beforeVoices" },
    { type: "withFirstVoice" },
    ...Array.from(
      { length: voices },
      (_, k): SoundFxPlacementIntent => ({ type: "afterVoice", index: k }),
    ),
    { type: "end" },
  ];
}

/**
 * Every option of the cue's Placement listbox for `voices` voices, plus the
 * deprecated `start` the listbox still saves for "At beginning".
 */
function placementsFor(
  voices: number,
): Array<[string, SoundFxPlacementIntent]> {
  return [
    ["beginning", { type: "beforeVoices" }],
    ["beginning (saved by the listbox as start)", { type: "start" }],
    ["with first voice", { type: "withFirstVoice" }],
    ...Array.from(
      { length: voices },
      (_, k): [string, SoundFxPlacementIntent] => [
        `after voice ${k + 1}`,
        { type: "afterVoice", index: k },
      ],
    ),
    ["end", { type: "end" }],
  ];
}

describe("deriveTimeline", () => {
  it("music starts at 0", () => {
    const pinned = pinnedFor(2, [{ type: "end" }]);
    const { music: bed } = timings(pinned, seededMixer(pinned));

    expect(bed).toHaveLength(1);
    expect(bed[0].start).toBe(0);
  });

  // layout × voices × cues × placement: every cue of the version shares one
  // placement. The lines sit where the layout puts them, whatever the cues.
  describe.each(LAYOUTS)("$name", (layout) => {
    it.each(voiceCounts(layout))("%i voice(s), no cues", (voices) => {
      const pinned = layoutPinned(layout, voices, []);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.voice).toEqual(
        spans(layout.spans(layout.durations.slice(0, voices))),
      );
    });

    for (const voices of voiceCounts(layout)) {
      for (const cues of [1, 2, 3]) {
        describe(`${voices} voice(s) · ${cues} cue(s)`, () => {
          it.each(placementsFor(voices))("%s", (_, placement) => {
            const pinned = layoutPinned(
              layout,
              voices,
              Array(cues).fill(placement),
            );
            const voice = layout.spans(layout.durations.slice(0, voices));

            const t = timings(pinned, seededMixer(pinned));

            expect(t.voice).toEqual(spans(voice));
            expect(t.sfx).toEqual(
              spans(expectedCues(voice, cuesOf(pinned.sfx))),
            );
          });
        });
      }
    }

    describe("several spots in one version", () => {
      for (const voices of voiceCounts(layout)) {
        it.each<[string, SoundFxPlacementIntent[]]>([
          ["one cue at each spot", everySpot(voices)],
          ["the same cues in reverse order", everySpot(voices).reverse()],
          [
            "two cues at each spot",
            everySpot(voices).flatMap((placement) => [placement, placement]),
          ],
        ])(`${voices} voice(s): %s`, (_, placements) => {
          const pinned = layoutPinned(layout, voices, placements);
          const voice = layout.spans(layout.durations.slice(0, voices));

          const t = timings(pinned, seededMixer(pinned));

          expect(t.voice).toEqual(spans(voice));
          expect(t.sfx).toEqual(spans(expectedCues(voice, cuesOf(pinned.sfx))));
        });
      }
    });

    it("no line has audio yet: every cue lands against the silent lines", () => {
      const pinned = layoutPinned(layout, 3, everySpot(3));
      for (const track of pinned.voice.voiceTracks) track.generatedUrl = null;
      const silent = layout.spans([0, 0, 0]);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.voice).toEqual([]);
      expect(t.sfx).toEqual(spans(expectedCues(silent, cuesOf(pinned.sfx))));
    });
  });

  describe.each<[string, (pinned: PinnedVersions) => MixerVersion]>([
    ["a draft", seededMixer],
    ["a saved take", savedTake],
  ])("changes sent to %s", (_, mixerFor) => {
    describe.each(LAYOUTS)("$name, 3 lines", (layout) => {
      describe("SFX: no line and not the music moves", () => {
        const placements = everySpot(3);

        it.each<[string, SfxVersion]>([
          [
            "a placement change",
            sfxVersion(
              placements.map(() => ({ type: "afterVoice", index: 1 })),
            ),
          ],
          [
            "an added cue",
            sfxVersion([...placements, { type: "afterVoice", index: 0 }]),
          ],
          ["a removed cue", sfxVersion(placements.slice(1))],
          [
            "longer cues",
            {
              ...sfxVersion(placements),
              soundFxPrompts: sfxVersion(placements).soundFxPrompts.map(
                (prompt, i) => ({
                  ...prompt,
                  duration: CUE_DURATIONS[i % CUE_DURATIONS.length] * 3,
                }),
              ),
            },
          ],
          ["every cue removed", sfxVersion([])],
        ])("%s", (_, sfx) => {
          const before = layoutPinned(layout, 3, placements);
          const mixer = mixerFor(before);
          const after = { ...before, sfx };

          const was = timings(before, mixer);
          const now = timings(after, send(mixer, after));

          expect(now.sfx).not.toEqual(was.sfx);
          expect(now.voice).toEqual(was.voice);
          expect(now.music).toEqual(was.music);
          expect(now.sfx).toEqual(spans(expectedCues(now.voice, cuesOf(sfx))));
        });
      });

      describe("voices: the cues follow the lines", () => {
        const other = layout === DIALOGUE ? BACK_TO_BACK : DIALOGUE;
        const changes: Array<[string, (parent: VoiceVersion) => VoiceVersion]> =
          [
            [
              "a line regenerated longer",
              (parent) => {
                const next = structuredClone(parent);
                next.voiceTracks[1].generatedDuration =
                  (next.voiceTracks[1].generatedDuration ?? 0) + 2;

                return next;
              },
            ],
            [
              "a middle line deleted",
              (parent) => ({
                ...parent,
                voiceTracks: parent.voiceTracks.filter((_, i) => i !== 1),
              }),
            ],
            [
              "a line appended",
              (parent) => ({
                ...parent,
                voiceTracks: [
                  ...parent.voiceTracks,
                  layoutVersion(layout, [...layout.durations, 2])
                    .voiceTracks[3],
                ],
              }),
            ],
            [
              "an AI rewrite with new lengths and one more line",
              (parent) => rewrittenVoices(parent, [3, 2, 1, 2.25], layout),
            ],
            [
              "a blank version with fresh slots",
              () => layoutVersion(layout, [2, 3, 1.5], "blank"),
            ],
            [
              `the lines re-timed as ${other.name}`,
              (parent) => rewrittenVoices(parent, other.durations, other),
            ],
          ];
        const placementSets: Array<[string, SoundFxPlacementIntent[]]> = [
          ...placementsFor(3).map(
            ([name, placement]): [string, SoundFxPlacementIntent[]] => [
              `2 cues ${name}`,
              [placement, placement],
            ],
          ),
          ["one cue at each spot", everySpot(3)],
        ];

        describe.each(changes)("%s", (_, change) => {
          it.each(placementSets)("%s", (_, placements) => {
            const before = layoutPinned(layout, 3, placements);
            const mixer = mixerFor(before);
            const after = { ...before, voice: change(before.voice) };
            const voicesAlone = { ...after, sfx: null };

            const was = timings(before, mixer);
            const now = timings(after, send(mixer, after));
            const alone = timings(voicesAlone, seededMixer(voicesAlone));

            expect(now.voice).toEqual(spans(alone.voice));
            expect(now.sfx).toEqual(
              spans(expectedCues(now.voice, cuesOf(after.sfx))),
            );
            expect(now.music).toEqual(was.music);
          });
        });
      });

      it("music: no line and no SFX moves", () => {
        const before = layoutPinned(layout, 3, everySpot(3));
        const mixer = mixerFor(before);
        const after = {
          ...before,
          music: {
            ...music,
            slotId: "music-2",
            duration: 45,
            generatedUrl: "https://blob/music-2.mp3",
          },
        };

        const was = timings(before, mixer);
        const now = timings(after, send(mixer, after));

        expect(now.music).not.toEqual(was.music);
        expect(now.voice).toEqual(was.voice);
        expect(now.sfx).toEqual(was.sfx);
      });
    });
  });

  describe("edge cases, 3 lines back to back", () => {
    it("at end waits for a long cue after a middle line", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 1 },
        { type: "end" },
      ]);
      pinned.sfx.soundFxPrompts[0].duration = 4;

      const t = timings(pinned, seededMixer(pinned));

      // After voice 2 plays 5.75–9.75, past the last line's end at 7.5.
      expect(t.sfx).toEqual(
        spans([
          { start: 5.75, end: 9.75 },
          { start: 9.75, end: 10.5 },
        ]),
      );
    });

    it("a trimmed line: the cue after it starts at the trimmed end", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);

      const mixer = trimmed(seededMixer(pinned), pinned, {
        "voice-1": { start: 0, end: 1.5 },
      });
      const t = timings(pinned, mixer);

      expect(t.voice[1]).toEqual(spans([{ start: 2.5, end: 4 }])[0]);
      expect(t.sfx[0].start).toBeCloseTo(4, 3);
    });

    it("a trimmed cue: the next cue in its queue closes up, and no line moves", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
      ]);

      const was = timings(pinned, seededMixer(pinned));
      const mixer = trimmed(seededMixer(pinned), pinned, {
        "sfx-0": { start: 0, end: 0.5 },
      });
      const t = timings(pinned, mixer);

      expect(t.sfx).toEqual(
        spans([
          { start: 2.5, end: 3 },
          { start: 3, end: 3.75 },
        ]),
      );
      expect(t.voice).toEqual(was.voice);
    });

    it("at end waits for the trimmed queue, not the full one", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 2 },
        { type: "end" },
      ]);

      const mixer = trimmed(seededMixer(pinned), pinned, {
        "sfx-0": { start: 0, end: 0.5 },
      });
      const t = timings(pinned, mixer);

      expect(t.sfx[1].start).toBeCloseTo(8, 3);
    });

    it("the first cue of a queue has no audio: the next starts on the spot", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
      ]);
      pinned.sfx.generatedUrls[0] = "";

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx).toEqual(spans([{ start: 2.5, end: 3.25 }]));
    });

    it("a middle cue has no audio: the next follows the one before it", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
      ]);
      pinned.sfx.generatedUrls[1] = "";

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx).toEqual(
        spans([
          { start: 2.5, end: 4 },
          { start: 4, end: 5.25 },
        ]),
      );
    });

    it("a cue after a dragged line follows the line", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);

      const dragged = patched(seededMixer(pinned), pinned, {
        "voice-1": { kind: "absolute", t: 8 },
      });
      const t = timings(pinned, dragged);

      expect(t.sfx[0].start).toBeCloseTo(11.25, 3);
    });

    it("a cue dragged onto another cue follows it through an SFX change, and no line moves", () => {
      const before = pinnedFor(3, [
        { type: "beforeVoices" },
        { type: "afterVoice", index: 2 },
      ]);
      const dragged = patched(seededMixer(before), before, {
        "sfx-1": { kind: "relativeTo", slotId: "sfx-0", edge: "end" },
      });
      const after = {
        ...before,
        sfx: sfxVersion([
          { type: "afterVoice", index: 0 },
          { type: "afterVoice", index: 2 },
        ]),
      };

      const was = timings(before, dragged);
      const now = timings(after, send(dragged, after));

      expect(was.sfx[1].start).toBeCloseTo(1.5, 3);
      expect(now.sfx[0].start).toBeCloseTo(2.5, 3);
      expect(now.sfx[1].start).toBeCloseTo(4, 3);
      expect(now.voice).toEqual(was.voice);
    });

    it("a cue dragged onto a line's start follows the line through a voice change", () => {
      const before = pinnedFor(3, [{ type: "end" }]);
      const dragged = patched(seededMixer(before), before, {
        "sfx-0": { kind: "relativeTo", slotId: "voice-1", edge: "start" },
      });
      const voice = structuredClone(before.voice);
      voice.voiceTracks[0].generatedDuration = 4.5;
      const after = { ...before, voice };

      const t = timings(after, send(dragged, after));

      expect(t.sfx[0].start).toBeCloseTo(4.5, 3);
    });

    it("a saved take whose cue got longer in place: the next cue moves, the lines don't", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
      ]);
      const take = savedTake(pinned);
      const regenerated = structuredClone(pinned);
      regenerated.sfx.soundFxPrompts[0].duration = 3;

      const was = timings(pinned, take);
      const now = timings(regenerated, take);

      expect(now.sfx[1].start).toBeCloseTo(5.5, 3);
      expect(now.voice).toEqual(was.voice);
    });
  });

  describe("placements mixed in one version", () => {
    it("beginning: the intro cue plays over voice 1, which starts at 0", () => {
      const pinned = pinnedFor(2, [{ type: "beforeVoices" }]);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx[0].start).toBe(0);
      expect(t.voice[0].start).toBe(0);
    });

    it("end waits for a cue hanging off the last voice", () => {
      const pinned = pinnedFor(2, [
        { type: "afterVoice", index: 1 },
        { type: "end" },
      ]);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
      expect(t.sfx[1].start).toBeCloseTo(t.sfx[0].end, 3);
    });

    it("with first voice starts with voice 1, alongside an intro cue", () => {
      const pinned = pinnedFor(2, [
        { type: "beforeVoices" },
        { type: "withFirstVoice" },
      ]);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx[1].start).toBeCloseTo(t.voice[0].start, 3);
    });
  });

  describe("overlapping voices (dialogue)", () => {
    /**
     * Voice 2 talks over voice 1 and stops first: the last voice in the
     * list is not the one that ends last.
     */
    function overlapping(placements: SoundFxPlacementIntent[]) {
      const voice = voiceVersion(VOICE_DURATIONS.slice(0, 2));
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

    it("after voice 1: the cue starts at voice 1's end, and voice 2, talking over voice 1, stays put", () => {
      const pinned = overlapping([{ type: "afterVoice", index: 0 }]);

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx[0].start).toBeCloseTo(4, 3);
      expect(t.voice[1].start).toBe(0);
    });
  });

  describe("sending a new SFX version to an existing mixer", () => {
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

    describe("moves no voice and not the music", () => {
      const before = pinnedFor(3, [
        { type: "beforeVoices" },
        { type: "afterVoice", index: 0 },
      ]);

      it.each<[string, SfxVersion]>([
        [
          "a placement change",
          sfxVersion([
            { type: "afterVoice", index: 1 },
            { type: "afterVoice", index: 1 },
          ]),
        ],
        [
          "an added cue",
          sfxVersion([
            { type: "beforeVoices" },
            { type: "afterVoice", index: 0 },
            { type: "afterVoice", index: 1 },
          ]),
        ],
        ["a removed cue", sfxVersion([{ type: "beforeVoices" }])],
        [
          "longer cues",
          {
            ...before.sfx,
            soundFxPrompts: before.sfx.soundFxPrompts.map((prompt, i) => ({
              ...prompt,
              duration: CUE_DURATIONS[i] * 3,
            })),
          },
        ],
      ])("%s", (_, sfx) => {
        const mixer = seededMixer(before);
        const after = { ...before, sfx };

        const was = timings(before, mixer);
        const now = timings(after, send(mixer, after));

        expect(now.sfx).not.toEqual(was.sfx);
        expect(now.voice).toEqual(was.voice);
        expect(now.music).toEqual(was.music);
      });
    });

    it("keeps a cue the user dragged", () => {
      const pinned = pinnedFor(2, [{ type: "end" }]);
      const mixer = seededMixer(pinned);
      mixer.anchors["sfx-0"] = {
        anchor: { kind: "absolute", t: 7 },
        origin: "user-edit",
      };

      const after = {
        ...pinned,
        sfx: sfxVersion([{ type: "afterVoice", index: 0 }]),
      };
      const t = timings(after, send(mixer, after));

      expect(t.sfx[0].start).toBe(7);
    });
  });

  describe("sending new voices under placed cues", () => {
    it("same line count, new lengths: the cues follow", () => {
      const before = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      const mixer = seededMixer(before);

      const after = {
        ...before,
        voice: rewrittenVoices(before.voice, [3, 2, 1]),
      };
      const t = timings(after, send(mixer, after));

      expect(t.voice[1].end).toBeCloseTo(5, 3);
      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });

    it("fewer lines than the cue's voice: the cue plays at end", () => {
      const before = pinnedFor(3, [{ type: "afterVoice", index: 2 }]);
      const mixer = seededMixer(before);

      const after = { ...before, voice: rewrittenVoices(before.voice, [2.5]) };
      const t = timings(after, send(mixer, after));

      expect(t.sfx[0].start).toBeCloseTo(t.voice[0].end, 3);
    });

    it("a blank version: a cue whose stored anchor points at a vanished voice plays at its placement", () => {
      // A cue saved before `create_sfx_draft` turned AI anchors into
      // placements: the anchor is stored and the placement defaulted to "end".
      const before = pinnedFor(3, [{ type: "end" }]);
      before.sfx.soundFxPrompts[0].anchor = {
        kind: "relativeTo",
        slotId: "voice-0",
        edge: "end",
      };
      const mixer = seededMixer(before);

      // A blank version's lines all get fresh slot ids.
      const after = { ...before, voice: voiceVersion([2.5, 3.25], "blank") };
      const t = timings(after, send(mixer, after));

      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });

    it("a stored anchor whose voice is still pinned keeps its timing", () => {
      const pinned = pinnedFor(3, [{ type: "end" }]);
      pinned.sfx.soundFxPrompts[0].anchor = {
        kind: "relativeTo",
        slotId: "voice-0",
        edge: "end",
      };

      const t = timings(pinned, seededMixer(pinned));

      expect(t.sfx[0].start).toBeCloseTo(t.voice[0].end, 3);
    });

    it("a voice without audio: the cue after it and the voices after it keep their place", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      // Editing line 2's text clears its audio until it's regenerated.
      pinned.voice.voiceTracks[1].generatedUrl = null;

      const t = timings(pinned, seededMixer(pinned));

      // Voice 2 has no clip, so t.voice holds voices 1 and 3.
      expect(t.voice).toHaveLength(2);
      expect(t.sfx[0].start).toBeCloseTo(t.voice[0].end, 3);
      expect(t.voice[1].start).toBeCloseTo(t.voice[0].end, 3);
    });

    it("a middle line deleted under playAfter: track-N refs: the voices stay in order and the cue follows", () => {
      // Lines saved before `create_voice_draft` stopped writing a default
      // playAfter…
      const written = voiceVersion([2.5, 3.25, 1.75, 2]);
      written.voiceTracks.forEach((track, i) => {
        track.playAfter = i === 0 ? "start" : `track-${i - 1}`;
      });
      const before = {
        voice: written,
        music,
        sfx: sfxVersion([{ type: "afterVoice", index: 1 }]),
      };
      const mixer = seededMixer(before);

      // …and line 2 dropped without renumbering the refs, as
      // `removeVoiceTrack` did before it renumbered them: the stale `track-N`
      // refs must not fall to 0 s.
      const edited: VoiceVersion = {
        ...written,
        voiceTracks: written.voiceTracks.filter((_, i) => i !== 1),
      };
      const after = { ...before, voice: edited };
      const t = timings(after, send(mixer, after));

      expect(t.voice[1].start).toBeCloseTo(t.voice[0].end, 3);
      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
      expect(t.voice[2].start).toBeCloseTo(t.voice[1].end, 3);
    });
  });

  describe("reading a draft mixer between sends", () => {
    it("a line deleted from the live voice draft leaves no clip at 0", () => {
      const original = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      const mixer = seededMixer(original);

      // The mixer pins the voice draft, which is edited in place: no send.
      const live = {
        ...original,
        voice: {
          ...original.voice,
          voiceTracks: original.voice.voiceTracks.filter((_, i) => i !== 1),
        },
      };
      const t = timings(live, mixer);

      expect(t.voice[1].start).toBeCloseTo(t.voice[0].end, 3);
      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });
  });

  describe("mixer edits", () => {
    it("a queued cue dragged off its spot leaves the spot to the next cue", () => {
      const pinned = pinnedFor(3, [
        { type: "afterVoice", index: 0 },
        { type: "afterVoice", index: 0 },
      ]);

      const dragged = patched(seededMixer(pinned), pinned, {
        "sfx-0": { kind: "absolute", t: 12 },
      });
      const t = timings(pinned, dragged);

      expect(t.sfx[0].start).toBe(12);
      expect(t.sfx[1].start).toBeCloseTo(t.voice[0].end, 3);
    });

    it("a dragged voice is not pushed by the cue before it", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 0 }]);

      const dragged = patched(seededMixer(pinned), pinned, {
        "voice-1": { kind: "absolute", t: 8 },
      });
      const t = timings(pinned, dragged);

      expect(t.voice[1].start).toBe(8);
    });

    it("reset puts a dragged cue back on its placement", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      const dragged = patched(seededMixer(pinned), pinned, {
        "sfx-0": { kind: "absolute", t: 12 },
      });

      const reset = patched(dragged, pinned, { "sfx-0": null });
      const t = timings(pinned, reset);

      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });
  });

  describe("a frozen take", () => {
    it("a voice whose length changed moves the cue after it", () => {
      const pinned = pinnedFor(3, [{ type: "afterVoice", index: 1 }]);
      const draft = seededMixer(pinned);
      const { calculatedTracks, resolved } = deriveTimeline({
        pins: PINS,
        pinned,
        mixerVersion: draft,
      });
      const frozen: MixerVersion = {
        ...draft,
        status: "frozen",
        cachedResolverOutput: {
          calculatedTracks,
          totalDuration: resolved.totalDuration,
          calculatedAt: 0,
        },
      };

      // The take pins the voice draft, where line 2 is regenerated longer.
      const regenerated = structuredClone(pinned);
      regenerated.voice.voiceTracks[1].generatedDuration = 5;
      const t = timings(regenerated, frozen);

      expect(t.voice[1].end - t.voice[1].start).toBeCloseTo(5, 3);
      expect(t.sfx[0].start).toBeCloseTo(t.voice[1].end, 3);
    });
  });
});
