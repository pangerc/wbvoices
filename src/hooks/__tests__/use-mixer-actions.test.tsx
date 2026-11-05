// @vitest-environment jsdom

import { useMixerStore, type MixerTrack } from "@/store/mixerStore";
import { server } from "@/test/mocks/server";
import type { MixerState } from "@/types/versions";
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { dropContext, useMixerActions } from "../use-mixer-actions";

const AD = "ad-1";

const tracks: MixerTrack[] = [
  { id: "voice-v1-0", slotId: "a", url: "u0", label: "A", type: "voice" },
  {
    id: "voice-v1-1",
    slotId: "b",
    anchorRefSlotId: "a",
    url: "u1",
    label: "B",
    type: "voice",
  },
];

const mixerState = (startB: number): MixerState => ({
  tracks,
  calculatedTracks: [
    { id: "voice-v1-0", startTime: 0, duration: 2, type: "voice" },
    { id: "voice-v1-1", startTime: startB, duration: 2, type: "voice" },
  ],
  totalDuration: startB + 2,
  volumes: {},
  lastCalculated: 0,
  activeVersions: { voices: "v1", music: null, sfx: null },
  mixerActiveVersionId: "v1",
});

beforeEach(() => {
  useMixerStore.getState().hydrateFromMixer(mixerState(2));
});

describe("dropContext", () => {
  it("lists other slots as drop targets and maps anchor refs", () => {
    const { calculatedTracks } = useMixerStore.getState();
    const ctx = dropContext("voice-v1-1", tracks, calculatedTracks);
    expect(ctx.others).toEqual([{ slotId: "a", startTime: 0, duration: 2 }]);
    expect(ctx.existingRefs).toEqual({ a: undefined, b: "a" });
  });
});

describe("useMixerActions", () => {
  it("persists a drop as an anchor update and hydrates the response", async () => {
    let body: unknown;
    server.use(
      http.patch(`*/api/ads/${AD}/mixer`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(mixerState(5));
      }),
    );

    const { result } = renderHook(() => useMixerActions(AD));
    await act(() => result.current.dropTrack("voice-v1-1", 5, true, false));

    expect(body).toEqual({
      anchorUpdates: { b: { kind: "absolute", t: 5 } },
    });
    expect(useMixerStore.getState().calculatedTracks[1].actualStartTime).toBe(
      5,
    );
  });

  it("sends a null anchor to reset a position", async () => {
    let body: unknown;
    server.use(
      http.patch(`*/api/ads/${AD}/mixer`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(mixerState(2));
      }),
    );
    const { result } = renderHook(() => useMixerActions(AD));
    await act(() => result.current.resetPosition("voice-v1-1"));
    expect(body).toEqual({ anchorUpdates: { b: null } });
  });

  it("does not call the server to activate the already-active take", async () => {
    let called = false;
    server.use(
      http.post(`*/api/ads/${AD}/mixer/:versionId/activate`, () => {
        called = true;
        return HttpResponse.json(mixerState(2));
      }),
    );
    const { result } = renderHook(() => useMixerActions(AD));
    await act(() => result.current.activateTake("v1"));
    expect(called).toBe(false);
  });
});
