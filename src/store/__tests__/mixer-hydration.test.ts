import type { MixerState } from "@/types/versions";
import { describe, expect, it } from "vitest";
import { needsHydration, stateFromServer } from "../mixer-hydration";
import { useMixerStore, type MixerTrack } from "../mixerStore";

const track = (id: string, url = `https://x/${id}.mp3`): MixerTrack => ({
  id,
  url,
  label: id,
  type: "voice",
});

const server = (overrides: Partial<MixerState> = {}): MixerState => ({
  tracks: [track("voice-v1-0"), track("voice-v1-1")],
  calculatedTracks: [
    { id: "voice-v1-0", startTime: 0, duration: 2, type: "voice" },
    { id: "voice-v1-1", startTime: 2, duration: 3, type: "voice" },
  ],
  volumes: { "voice-v1-1": -4 },
  totalDuration: 5,
  lastCalculated: 0,
  activeVersions: { voices: "v1", music: null, sfx: null },
  ...overrides,
});

describe("stateFromServer", () => {
  it("joins tracks with server positions and volumes", () => {
    const next = stateFromServer(
      { tracks: [], isPreviewValid: true },
      server(),
    );
    expect(next.calculatedTracks.map((t) => [t.id, t.actualStartTime])).toEqual(
      [
        ["voice-v1-0", 0],
        ["voice-v1-1", 2],
      ],
    );
    expect(next.trackVolumes["voice-v1-1"]).toBe(-4);
    expect(next.totalDuration).toBe(5);
  });

  it("keeps the preview valid only when ids and urls are unchanged", () => {
    const s = server();
    const same = stateFromServer(
      { tracks: s.tracks as MixerTrack[], isPreviewValid: true },
      s,
    );
    expect(same.isPreviewValid).toBe(true);

    const changed = stateFromServer(
      { tracks: [track("voice-v1-0", "https://old")], isPreviewValid: true },
      s,
    );
    expect(changed.isPreviewValid).toBe(false);
  });
});

describe("needsHydration", () => {
  const hydrated = () => {
    const s = server();
    const next = stateFromServer({ tracks: [], isPreviewValid: false }, s);
    return {
      s,
      store: { tracks: next.tracks, calculatedTracks: next.calculatedTracks },
    };
  };

  it("is false when the store already mirrors the server", () => {
    const { s, store } = hydrated();
    expect(needsHydration(store, s)).toBe(false);
  });

  it("is true when a start position moved", () => {
    const { store } = hydrated();
    const moved = server({
      calculatedTracks: [
        { id: "voice-v1-0", startTime: 1, duration: 2, type: "voice" },
        { id: "voice-v1-1", startTime: 3, duration: 3, type: "voice" },
      ],
    });
    expect(needsHydration(store, moved)).toBe(true);
  });

  it("is true when the track set changed", () => {
    const { store } = hydrated();
    expect(
      needsHydration(store, server({ tracks: [track("voice-v2-0")] })),
    ).toBe(true);
  });
});

describe("useMixerStore.hydrateFromMixer", () => {
  it("writes the projected snapshot into the store", () => {
    useMixerStore.getState().hydrateFromMixer(server());
    const state = useMixerStore.getState();
    expect(state.tracks).toHaveLength(2);
    expect(state.calculatedTracks[1].actualStartTime).toBe(2);
  });
});
