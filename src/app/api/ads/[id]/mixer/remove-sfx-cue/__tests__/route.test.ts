/**
 * Integration tests for Mixer Remove SFX Cue API endpoint
 * POST /api/ads/[id]/mixer/remove-sfx-cue
 */

import { rebuildMixer } from "@/lib/mixer/rebuilder";
import {
  createVersion,
  getActiveVersion,
  getVersion,
  setActiveVersion,
} from "@/lib/redis/versions";
import {
  mockAdId,
  mockSoundFxPrompt,
  mockVoiceTrack,
  mockVoiceVersionFrozen,
} from "@/test/fixtures/versions";
import { createMockRedis } from "@/test/utils";
import type { MixerState, SfxVersion, VersionStatus } from "@/types/versions";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

// Mock Redis V3
vi.mock("@/lib/redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
  vi.clearAllMocks();
});

/** An SFX version with one cue (and URL) per slot id. */
function sfxVersion(status: VersionStatus, slotIds: string[]): SfxVersion {
  return {
    soundFxPrompts: slotIds.map((slotId) => ({
      ...mockSoundFxPrompt,
      description: `cue ${slotId}`,
      slotId,
    })),
    generatedUrls: slotIds.map((slotId) => `https://example.com/${slotId}.mp3`),
    integratedLufs: slotIds.map(() => -20),
    createdAt: Date.now(),
    createdBy: "llm",
    status,
  };
}

/** Pin one voice track plus `sfx` in the mixer, as a send to mixer would. */
async function seedMixer(sfx: SfxVersion) {
  await createVersion(mockAdId, "voices", {
    ...mockVoiceVersionFrozen,
    voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-0" }],
  });
  await createVersion(mockAdId, "sfx", sfx);
  await setActiveVersion(mockAdId, "voices", "v1");
  await setActiveVersion(mockAdId, "sfx", "v1");
  await rebuildMixer(mockAdId);
}

async function removeCue(slotId: string) {
  const request = new NextRequest(
    "http://localhost:3003/api/ads/test/mixer/remove-sfx-cue",
    { method: "POST", body: JSON.stringify({ slotId }) },
  );
  return POST(request, { params: Promise.resolve({ id: mockAdId }) });
}

function sfxTracks(state: MixerState) {
  return state.tracks.filter((t) => t.type === "soundfx");
}

describe("POST /api/ads/[id]/mixer/remove-sfx-cue", () => {
  it("removes only that cue from a draft, keeping the arrays aligned", async () => {
    await seedMixer(sfxVersion("draft", ["a", "b"]));

    const response = await removeCue("a");

    expect(response.status).toBe(200);

    const state: MixerState = await response.json();
    const draft = await getVersion(mockAdId, "sfx", "v1");

    expect(sfxTracks(state).map((t) => t.slotId)).toEqual(["b"]);
    expect(await getActiveVersion(mockAdId, "sfx")).toBe("v1");
    expect(draft?.soundFxPrompts.map((p) => p.slotId)).toEqual(["b"]);
    expect(draft?.generatedUrls).toEqual(["https://example.com/b.mp3"]);
    expect(draft?.integratedLufs).toEqual([-20]);
  });

  it("leaves a frozen version untouched and activates a copy without the cue", async () => {
    await seedMixer(sfxVersion("frozen", ["a", "b"]));

    const response = await removeCue("b");

    expect(response.status).toBe(200);

    const state: MixerState = await response.json();
    const original = await getVersion(mockAdId, "sfx", "v1");
    const copy = await getVersion(mockAdId, "sfx", "v2");

    expect(sfxTracks(state).map((t) => t.slotId)).toEqual(["a"]);
    expect(await getActiveVersion(mockAdId, "sfx")).toBe("v2");
    expect(original?.soundFxPrompts.map((p) => p.slotId)).toEqual(["a", "b"]);
    expect(copy?.status).toBe("frozen");
    expect(copy?.parentVersionId).toBe("v1");
    expect(copy?.soundFxPrompts.map((p) => p.slotId)).toEqual(["a"]);
    expect(copy?.generatedUrls).toEqual(["https://example.com/a.mp3"]);
  });

  it("unpins the SFX stream when the only cue is removed", async () => {
    await seedMixer(sfxVersion("draft", ["a"]));

    const response = await removeCue("a");

    expect(response.status).toBe(200);

    const state: MixerState = await response.json();

    expect(sfxTracks(state)).toEqual([]);
    expect(state.activeVersions.sfx).toBeNull();
    expect(await getActiveVersion(mockAdId, "sfx")).toBeNull();
  });

  it("returns 404 for a slot the pinned SFX version does not have", async () => {
    await seedMixer(sfxVersion("draft", ["a", "b"]));

    const response = await removeCue("missing");

    expect(response.status).toBe(404);
    expect(
      (await getVersion(mockAdId, "sfx", "v1"))?.soundFxPrompts,
    ).toHaveLength(2);
  });

  it("returns 400 without a slotId", async () => {
    const request = new NextRequest(
      "http://localhost:3003/api/ads/test/mixer/remove-sfx-cue",
      { method: "POST", body: JSON.stringify({}) },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: mockAdId }),
    });

    expect(response.status).toBe(400);
  });
});
