/**
 * Pure render-planning tests for the client mixer. No AudioContext involved.
 */

import { describe, expect, it } from "vitest";
import {
  buildTimingInfo,
  planSchedule,
  SILENCED_GAIN_DB,
  type TimelineClip,
  type TrackTiming,
} from "../audio-mixer";

const clip = (
  id: string,
  type: TimelineClip["type"],
  start: number,
  duration: number,
): TimelineClip => ({
  id,
  url: `https://x/${id}.mp3`,
  type,
  actualStartTime: start,
  actualDuration: duration,
});

describe("buildTimingInfo", () => {
  const tracks = [
    clip("voice-a", "voice", 2, 3),
    clip("music", "music", 0, 10),
    clip("sfx", "soundfx", 1, 1),
  ];

  it("sorts by start and applies dB volumes", () => {
    const info = buildTimingInfo(
      tracks,
      { "voice-a": -3 },
      new Set(),
      new Set(),
    );
    expect(info.map((t) => t.id)).toEqual(["music", "sfx", "voice-a"]);
    expect(info.find((t) => t.id === "voice-a")?.gainDb).toBe(-3);
    expect(info.find((t) => t.id === "music")?.gainDb).toBe(0);
  });

  it("silences muted tracks", () => {
    const info = buildTimingInfo(tracks, {}, new Set(["sfx"]), new Set());
    expect(info.find((t) => t.id === "sfx")?.gainDb).toBe(SILENCED_GAIN_DB);
  });

  it("silences everything but the soloed tracks", () => {
    const info = buildTimingInfo(tracks, {}, new Set(), new Set(["voice-a"]));
    expect(Object.fromEntries(info.map((t) => [t.id, t.gainDb]))).toEqual({
      "voice-a": 0,
      music: SILENCED_GAIN_DB,
      sfx: SILENCED_GAIN_DB,
    });
  });
});

describe("planSchedule", () => {
  const timing = (overrides: Partial<TrackTiming> = {}): TrackTiming => ({
    id: "v",
    url: "u",
    type: "voice",
    startTime: 1,
    duration: 4,
    ...overrides,
  });
  const plan = (
    timingInfo: TrackTiming[],
    durations: Record<string, number>,
    measureLufs: (url: string) => number | undefined = () => undefined,
  ) =>
    planSchedule({
      voiceUrls: [],
      musicUrl: null,
      soundFxUrls: [],
      timingInfo,
      bufferDurations: new Map(Object.entries(durations)),
      measureLufs,
    });

  it("schedules at the resolved start for the resolved duration", () => {
    const { timings, maxEndTime } = plan([timing()], { u: 10 });
    expect(timings.get("u")).toMatchObject({
      start: 1,
      end: 5,
      sourceOffset: 0,
      playDuration: 4,
      gain: 1,
    });
    expect(maxEndTime).toBe(5);
  });

  it("honours the trim window, clamped to the buffer", () => {
    const { timings } = plan(
      [timing({ trim: { start: 2, end: 9 }, duration: 7 })],
      { u: 5 },
    );
    expect(timings.get("u")).toMatchObject({
      sourceOffset: 2,
      playDuration: 3,
    });
  });

  it("normalises to the per-type LUFS target before the user trim", () => {
    const { timings } = plan([timing({ integratedLufs: -22, gainDb: 0 })], {
      u: 10,
    });
    // voice target -16 → +6 dB
    expect(timings.get("u")!.gain).toBeCloseTo(Math.pow(10, 6 / 20));
  });

  it("falls back to measured loudness when none was supplied", () => {
    const { timings } = plan([timing()], { u: 10 }, () => -10);
    expect(timings.get("u")!.gain).toBeCloseTo(Math.pow(10, -6 / 20));
  });

  it("hard-mutes the silenced sentinel", () => {
    const { timings } = plan([timing({ gainDb: SILENCED_GAIN_DB })], { u: 10 });
    expect(timings.get("u")!.gain).toBe(0);
  });

  it("skips timings whose buffer failed to load", () => {
    const { timings } = plan([timing()], {});
    expect(timings.size).toBe(0);
  });

  it("falls back to sequential voices after the longest SFX without timing info", () => {
    const { timings, maxEndTime } = planSchedule({
      voiceUrls: ["v1", "v2"],
      musicUrl: "m",
      soundFxUrls: ["s"],
      timingInfo: [],
      bufferDurations: new Map([
        ["v1", 2],
        ["v2", 3],
        ["m", 20],
        ["s", 1],
      ]),
      measureLufs: () => undefined,
    });
    expect(timings.get("m")).toMatchObject({ start: 0, end: 20 });
    expect(timings.get("v1")).toMatchObject({ start: 1, end: 3 });
    expect(timings.get("v2")).toMatchObject({ start: 3, end: 6 });
    expect(maxEndTime).toBe(20);
  });
});
