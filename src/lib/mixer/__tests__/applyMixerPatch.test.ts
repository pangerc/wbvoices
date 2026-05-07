/**
 * Tests for `applyMixerPatch` — the post-stage-6 replacement for the legacy
 * PATCH handler that used to resurrect `ad:{id}:mixer`.
 *
 * What we care about:
 *   - Patch writes hit the active mixer version, never the legacy single-key
 *     blob.
 *   - `volumes` (track-id keyed) translates to `overrides` (slot-id keyed).
 *   - `mixedAudioUrl` lands on the mixer version and flows through
 *     `getMixerState` back to the caller.
 *   - Applying a patch on a frozen active forks a draft first.
 *   - Volumes survive a subsequent read — the UI's slider state round-trips.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRedis } from "@/test/utils";
import {
  mockAdId,
  mockMusicVersionFrozen,
  mockVoiceTrack,
  mockVoiceVersionFrozen,
} from "@/test/fixtures/versions";
import type {
  MixerVersion,
  MusicVersion,
  VoiceVersion,
} from "@/types/versions";

let mockRedis: ReturnType<typeof createMockRedis>;

vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

// Post stage 7: the rebuilder uses `resolveTimeline` directly; no calculator
// mock needed. These tests only assert mixer-version persistence behavior,
// not timing math.

import {
  AD_KEYS,
  createVersion,
  getActiveVersion,
  getVersion,
  listVersions,
  setActiveVersion,
} from "../../redis/versions";
import { applyMixerPatch, getMixerState } from "../rebuilder";

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
});

describe("applyMixerPatch", () => {
  it("writes mixedAudioUrl onto the active mixer version, not the legacy blob", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    const url = "https://blob.example.com/mix-12345.mp3";
    const state = await applyMixerPatch(mockAdId, { mixedAudioUrl: url });

    expect(state?.mixedAudioUrl).toBe(url);

    // Legacy key remained untouched.
    const legacy = await mockRedis.get(AD_KEYS.mixer(mockAdId));
    expect(legacy).toBeNull();

    // mixedAudioUrl is on the active mixer version.
    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;
    expect(mixer.mixedAudioUrl).toBe(url);
  });

  it("translates track-id-keyed volumes into slot-id-keyed overrides", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [
        { ...mockVoiceTrack, slotId: "voice-slot-a", text: "one" },
        { ...mockVoiceTrack, slotId: "voice-slot-b", text: "two" },
      ],
      generatedUrls: ["https://x/a.mp3", "https://x/b.mp3"],
    };
    const music: MusicVersion = {
      ...mockMusicVersionFrozen,
      slotId: "music-slot",
    };
    await createVersion(mockAdId, "voices", voice);
    await createVersion(mockAdId, "music", music);
    await setActiveVersion(mockAdId, "voices", "v1");
    await setActiveVersion(mockAdId, "music", "v1");

    await applyMixerPatch(mockAdId, {
      volumes: {
        "voice-v1-0": 0.55,
        "voice-v1-1": 0.77,
        "music-v1": 0.25,
      },
    });

    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;

    expect(mixer.overrides?.["voice-slot-a"]?.volume).toBe(0.55);
    expect(mixer.overrides?.["voice-slot-b"]?.volume).toBe(0.77);
    expect(mixer.overrides?.["music-slot"]?.volume).toBe(0.25);
  });

  it("forks a frozen active mixer version into a draft before writing", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Bootstrap runs on the first getMixerState read, yielding frozen mixer:v1.
    await getMixerState(mockAdId);
    const preId = (await getActiveVersion(mockAdId, "mixer"))!;
    const pre = (await getVersion(mockAdId, "mixer", preId)) as MixerVersion;
    expect(pre.status).toBe("frozen");

    await applyMixerPatch(mockAdId, { mixedAudioUrl: "https://x/mix.mp3" });

    const postId = (await getActiveVersion(mockAdId, "mixer"))!;
    expect(postId).not.toBe(preId);
    const post = (await getVersion(mockAdId, "mixer", postId)) as MixerVersion;
    expect(post.status).toBe("draft");
    expect(post.parentVersionId).toBe(preId);
    expect(post.mixedAudioUrl).toBe("https://x/mix.mp3");

    const versions = await listVersions(mockAdId, "mixer");
    expect(versions).toEqual([preId, postId]);
  });

  it("volumes round-trip through getMixerState as track-id-keyed volumes", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    await applyMixerPatch(mockAdId, { volumes: { "voice-v1-0": 0.42 } });
    const state = await getMixerState(mockAdId);

    expect(state?.volumes["voice-v1-0"]).toBe(0.42);
    // Also projected onto the track shape so hydration picks it up.
    const voiceTrack = state?.tracks.find((t) => t.id === "voice-v1-0");
    expect(voiceTrack?.volume).toBe(0.42);
  });

  it("returns null for an ad with no content streams", async () => {
    const result = await applyMixerPatch(mockAdId, {
      mixedAudioUrl: "https://x/mix.mp3",
    });
    expect(result).toBeNull();
  });

  it("merges anchorUpdates into mixerVersion.anchors with user-edit provenance", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [
        { ...mockVoiceTrack, slotId: "voice-slot-a" },
        { ...mockVoiceTrack, slotId: "voice-slot-b" },
      ],
      generatedUrls: ["https://x/a.mp3", "https://x/b.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // First patch: move slot-a. Bootstrap creates mixer:v1 frozen with empty
    // anchors; this patch forks to v2 draft and applies the anchor.
    await applyMixerPatch(mockAdId, {
      anchorUpdates: {
        "voice-slot-a": { kind: "absolute", t: 1.5 },
      },
    });

    let draftId = (await getActiveVersion(mockAdId, "mixer"))!;
    let mixer = (await getVersion(mockAdId, "mixer", draftId)) as MixerVersion;
    expect(mixer.status).toBe("draft");
    expect(mixer.anchors["voice-slot-a"]).toEqual({
      anchor: { kind: "absolute", t: 1.5 },
      origin: "user-edit",
    });

    // Second patch: move slot-b. Must preserve slot-a's anchor (non-destructive merge).
    await applyMixerPatch(mockAdId, {
      anchorUpdates: {
        "voice-slot-b": {
          kind: "relativeTo",
          slotId: "voice-slot-a",
          edge: "end",
        },
      },
    });

    draftId = (await getActiveVersion(mockAdId, "mixer"))!;
    mixer = (await getVersion(mockAdId, "mixer", draftId)) as MixerVersion;
    expect(mixer.anchors["voice-slot-a"]).toEqual({
      anchor: { kind: "absolute", t: 1.5 },
      origin: "user-edit",
    });
    expect(mixer.anchors["voice-slot-b"]).toEqual({
      anchor: { kind: "relativeTo", slotId: "voice-slot-a", edge: "end" },
      origin: "user-edit",
    });
  });

  it("null anchor update resets to the stream-level seed with llm-seed provenance", async () => {
    // Start with a voice (so there's a slot id) and an sfx with a legacy
    // "afterVoice" placement. The bootstrap's stream-anchor translator
    // should produce a relativeTo(voice, end) seed on reset.
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Stash an sfx version whose prompt has a stream-level placement
    // (afterVoice index 0). Slot id goes on the prompt.
    const { createVersion: createV } = await import("../../redis/versions");
    await createV(mockAdId, "sfx", {
      soundFxPrompts: [
        {
          slotId: "sfx-slot-0",
          description: "boom",
          duration: 1,
          placement: { type: "afterVoice", index: 0 },
        },
      ],
      generatedUrls: ["https://x/s.mp3"],
      createdAt: Date.now(),
      createdBy: "llm",
      status: "frozen",
    });
    await setActiveVersion(mockAdId, "sfx", "v1");

    // First: user drag moves the sfx to absolute(5) on the mixer.
    await applyMixerPatch(mockAdId, {
      anchorUpdates: { "sfx-slot-0": { kind: "absolute", t: 5 } },
    });
    let draftId = (await getActiveVersion(mockAdId, "mixer"))!;
    let mixer = (await getVersion(mockAdId, "mixer", draftId)) as MixerVersion;
    expect(mixer.anchors["sfx-slot-0"]).toEqual({
      anchor: { kind: "absolute", t: 5 },
      origin: "user-edit",
    });

    // Now reset. Expect the stream-level placement to re-derive as
    // relativeTo voice-slot-0 end.
    await applyMixerPatch(mockAdId, {
      anchorUpdates: { "sfx-slot-0": null },
    });
    draftId = (await getActiveVersion(mockAdId, "mixer"))!;
    mixer = (await getVersion(mockAdId, "mixer", draftId)) as MixerVersion;
    expect(mixer.anchors["sfx-slot-0"]).toEqual({
      anchor: { kind: "relativeTo", slotId: "voice-slot-0", edge: "end" },
      origin: "llm-seed",
    });
  });

  it("preserves layout metadata when overriding an existing anchor", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Seed a mixer version with layout: "push" on the slot so we can assert
    // layout survives the patch.
    const mixer: MixerVersion = {
      anchors: {
        "voice-slot-0": {
          anchor: { kind: "absolute", t: 0 },
          origin: "llm-seed",
          layout: "push",
        },
      },
      pins: { voices: "v1", music: null, sfx: null },
      createdAt: Date.now(),
      createdBy: "llm",
      status: "frozen",
    };
    await createVersion(mockAdId, "mixer", mixer);
    await setActiveVersion(mockAdId, "mixer", "v1");

    await applyMixerPatch(mockAdId, {
      anchorUpdates: {
        "voice-slot-0": { kind: "absolute", t: 2.5 },
      },
    });

    const draftId = (await getActiveVersion(mockAdId, "mixer"))!;
    const post = (await getVersion(mockAdId, "mixer", draftId)) as MixerVersion;
    expect(post.anchors["voice-slot-0"]).toEqual({
      anchor: { kind: "absolute", t: 2.5 },
      origin: "user-edit",
      layout: "push",
    });
  });

  it("trimUpdates write onto overrides[slotId].trim", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [
        { ...mockVoiceTrack, slotId: "voice-slot-0", generatedDuration: 10 },
      ],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    await applyMixerPatch(mockAdId, {
      trimUpdates: { "voice-slot-0": { start: 0, end: 7.5 } },
    });

    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;
    expect(mixer.overrides?.["voice-slot-0"]?.trim).toEqual({
      start: 0,
      end: 7.5,
    });
  });

  it("null trim update clears the trim while preserving other overrides", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Set volume + trim first, then clear trim only. Volume should survive.
    await applyMixerPatch(mockAdId, {
      volumes: { "voice-v1-0": 0.6 },
      trimUpdates: { "voice-slot-0": { start: 0, end: 5 } },
    });
    await applyMixerPatch(mockAdId, {
      trimUpdates: { "voice-slot-0": null },
    });

    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;
    expect(mixer.overrides?.["voice-slot-0"]?.trim).toBeUndefined();
    expect(mixer.overrides?.["voice-slot-0"]?.volume).toBe(0.6);
  });

  it("rejects invalid trim shapes (end <= start, negative start)", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    await applyMixerPatch(mockAdId, {
      trimUpdates: { "voice-slot-0": { start: -1, end: 5 } },
    });
    await applyMixerPatch(mockAdId, {
      trimUpdates: { "voice-slot-0": { start: 5, end: 3 } },
    });

    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;
    expect(mixer.overrides?.["voice-slot-0"]?.trim).toBeUndefined();
  });

  it("ignores legacy extra fields (tracks/totalDuration/lastCalculated)", async () => {
    const voice: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [{ ...mockVoiceTrack, slotId: "voice-slot-0" }],
      generatedUrls: ["https://x/v.mp3"],
    };
    await createVersion(mockAdId, "voices", voice);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Only well-known keys are forwarded through MixerPatch.
    const state = await applyMixerPatch(mockAdId, {
      mixedAudioUrl: "https://x/mix.mp3",
      volumes: { "voice-v1-0": 0.9 },
    });

    expect(state).not.toBeNull();
    const activeId = (await getActiveVersion(mockAdId, "mixer"))!;
    const mixer = (await getVersion(
      mockAdId,
      "mixer",
      activeId,
    )) as MixerVersion;
    // Only the two authorized fields were written.
    expect(mixer.mixedAudioUrl).toBe("https://x/mix.mp3");
    expect(mixer.overrides?.["voice-slot-0"]?.volume).toBe(0.9);
  });
});
