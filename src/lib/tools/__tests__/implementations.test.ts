/**
 * Integration tests for the draft-creation tool implementations.
 *
 * Focuses on slot-id lineage: a new draft inherits slot ids from its parent
 * version by ordinal match, mints fresh ids for added slots, and reports
 * orphaned ids for removed slots. The `reconcileSlots` pure unit is covered
 * separately in slotReconciliation.test.ts — this file exercises the wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRedis } from "@/test/utils";

// Mock Redis before importing anything that depends on it.
let mockRedis: ReturnType<typeof createMockRedis>;
vi.mock("@/lib/redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

// Mock the voice catalogue — tests don't care about the catalogue's real state.
vi.mock("@/services/voiceCatalogueService", () => ({
  voiceCatalogue: {
    getVoiceById: vi.fn(async (id: string) => null),
  },
}));

import {
  createVoiceDraft,
  createMusicDraft,
  createSfxDraft,
} from "../implementations";
import { getVersion, freezeVersion } from "@/lib/redis/versions";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
} from "@/types/versions";

const ADID = "test-ad-reconcile";

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
});

describe("createVoiceDraft slot lineage", () => {
  it("first-ever draft mints fresh slot ids and returns no reconciliation report", async () => {
    const result = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "v1", text: "hello" },
        { voiceId: "v2", text: "world" },
      ],
    });

    expect(result.status).toBe("draft");
    expect(result.reconciliation).toBeUndefined();

    const stored = (await getVersion(ADID, "voices", result.versionId)) as VoiceVersion;
    expect(stored.voiceTracks).toHaveLength(2);
    expect(stored.voiceTracks[0].slotId).toBeTruthy();
    expect(stored.voiceTracks[1].slotId).toBeTruthy();
    expect(stored.voiceTracks[0].slotId).not.toBe(stored.voiceTracks[1].slotId);
    expect(stored.parentVersionId).toBeUndefined();
  });

  it("second draft with same track count inherits all slot ids from the frozen parent", async () => {
    // First draft
    const first = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "line 1" },
        { voiceId: "b", text: "line 2" },
      ],
    });
    const parent = (await getVersion(ADID, "voices", first.versionId)) as VoiceVersion;
    const parentSlotIds = parent.voiceTracks.map((t) => t.slotId);
    // Freeze so the second createVoiceDraft's resolveParentVersionId can find it.
    await freezeVersion(ADID, "voices", first.versionId);

    // Second draft (different text, same count)
    const second = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "line 1 revised" },
        { voiceId: "b", text: "line 2 revised" },
      ],
    });

    const child = (await getVersion(ADID, "voices", second.versionId)) as VoiceVersion;
    expect(child.voiceTracks.map((t) => t.slotId)).toEqual(parentSlotIds);
    expect(child.parentVersionId).toBe(first.versionId);

    expect(second.reconciliation).toBeDefined();
    expect(second.reconciliation!.preserved).toHaveLength(2);
    expect(second.reconciliation!.created).toHaveLength(0);
    expect(second.reconciliation!.orphaned).toHaveLength(0);
  });

  it("adding a track preserves existing slot ids and mints a new one for the addition", async () => {
    const first = await createVoiceDraft({
      adId: ADID,
      tracks: [{ voiceId: "a", text: "line 1" }],
    });
    const firstVersion = (await getVersion(ADID, "voices", first.versionId)) as VoiceVersion;
    const originalSlotId = firstVersion.voiceTracks[0].slotId;
    await freezeVersion(ADID, "voices", first.versionId);

    const second = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "line 1" },
        { voiceId: "b", text: "line 2 added" },
      ],
    });

    const child = (await getVersion(ADID, "voices", second.versionId)) as VoiceVersion;
    expect(child.voiceTracks[0].slotId).toBe(originalSlotId);
    expect(child.voiceTracks[1].slotId).toBeTruthy();
    expect(child.voiceTracks[1].slotId).not.toBe(originalSlotId);

    expect(second.reconciliation!.preserved).toHaveLength(1);
    expect(second.reconciliation!.created).toHaveLength(1);
    expect(second.reconciliation!.created[0].ordinalIndex).toBe(1);
  });

  it("dropping a track preserves kept slot ids and reports the dropped one as orphaned", async () => {
    const first = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "keep" },
        { voiceId: "b", text: "drop" },
      ],
    });
    const firstVersion = (await getVersion(ADID, "voices", first.versionId)) as VoiceVersion;
    const keptSlot = firstVersion.voiceTracks[0].slotId;
    const droppedSlot = firstVersion.voiceTracks[1].slotId;
    await freezeVersion(ADID, "voices", first.versionId);

    const second = await createVoiceDraft({
      adId: ADID,
      tracks: [{ voiceId: "a", text: "keep" }],
    });

    const child = (await getVersion(ADID, "voices", second.versionId)) as VoiceVersion;
    expect(child.voiceTracks).toHaveLength(1);
    expect(child.voiceTracks[0].slotId).toBe(keptSlot);

    expect(second.reconciliation!.preserved).toHaveLength(1);
    expect(second.reconciliation!.orphaned).toEqual([
      { slotId: droppedSlot, ordinalIndex: 1 },
    ]);
  });

  it("explicit parentVersionId: null forces a fresh slate even when a frozen parent exists", async () => {
    const first = await createVoiceDraft({
      adId: ADID,
      tracks: [{ voiceId: "a", text: "v1" }],
    });
    const firstVersion = (await getVersion(ADID, "voices", first.versionId)) as VoiceVersion;
    await freezeVersion(ADID, "voices", first.versionId);

    const forked = await createVoiceDraft({
      adId: ADID,
      parentVersionId: null,
      tracks: [{ voiceId: "a", text: "fresh start" }],
    });

    const forkedVersion = (await getVersion(ADID, "voices", forked.versionId)) as VoiceVersion;
    expect(forkedVersion.voiceTracks[0].slotId).not.toBe(
      firstVersion.voiceTracks[0].slotId
    );
    expect(forkedVersion.parentVersionId).toBeUndefined();
    expect(forked.reconciliation).toBeUndefined();
  });
});

describe("createSfxDraft slot lineage", () => {
  it("preserves slot ids across equal-count regeneration", async () => {
    const first = await createSfxDraft({
      adId: ADID,
      prompts: [
        { description: "whoosh" },
        { description: "ding" },
      ],
    });
    const firstVersion = (await getVersion(ADID, "sfx", first.versionId)) as SfxVersion;
    const parentSlotIds = firstVersion.soundFxPrompts.map((p) => p.slotId);
    await freezeVersion(ADID, "sfx", first.versionId);

    const second = await createSfxDraft({
      adId: ADID,
      prompts: [
        { description: "new whoosh" },
        { description: "new ding" },
      ],
    });

    const child = (await getVersion(ADID, "sfx", second.versionId)) as SfxVersion;
    expect(child.soundFxPrompts.map((p) => p.slotId)).toEqual(parentSlotIds);
    expect(second.reconciliation!.preserved).toHaveLength(2);
  });
});

describe("createVoiceDraft anchor translation (stage 4)", () => {
  it("LLM-supplied anchor is translated ordinal→slotId and persisted on the track", async () => {
    const result = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "first" },
        {
          voiceId: "b",
          text: "second",
          anchor: {
            kind: "relativeTo",
            trackRef: "voice-0",
            edge: "end",
            offset: -0.2,
          },
        },
      ],
    });
    const version = (await getVersion(ADID, "voices", result.versionId)) as VoiceVersion;
    expect(version.voiceTracks[1].anchor).toEqual({
      kind: "relativeTo",
      slotId: version.voiceTracks[0].slotId!,
      edge: "end",
      offset: -0.2,
    });
  });

  it("LLM anchor input with unresolvable ordinal is dropped silently", async () => {
    const result = await createVoiceDraft({
      adId: ADID,
      tracks: [
        {
          voiceId: "a",
          text: "only",
          anchor: {
            kind: "relativeTo",
            trackRef: "voice-5", // out of range
            edge: "end",
          },
        },
      ],
    });
    const version = (await getVersion(ADID, "voices", result.versionId)) as VoiceVersion;
    expect(version.voiceTracks[0].anchor).toBeUndefined();
  });
});

describe("createSfxDraft anchor translation (stage 4)", () => {
  it("sfx anchor referencing voice-0 resolves against active voice version", async () => {
    // Set up: create + freeze a voice version first so sfx can reference it
    const voiceResult = await createVoiceDraft({
      adId: ADID,
      tracks: [{ voiceId: "a", text: "voice one" }],
    });
    const voiceVersion = (await getVersion(ADID, "voices", voiceResult.versionId)) as VoiceVersion;
    const voiceSlot = voiceVersion.voiceTracks[0].slotId!;
    await freezeVersion(ADID, "voices", voiceResult.versionId);
    const { setActiveVersion } = await import("@/lib/redis/versions");
    await setActiveVersion(ADID, "voices", voiceResult.versionId);

    const sfxResult = await createSfxDraft({
      adId: ADID,
      prompts: [
        {
          description: "ding on voice 1 end",
          anchor: {
            kind: "relativeTo",
            trackRef: "voice-0",
            edge: "end",
          },
        },
      ],
    });

    const sfxVersion = (await getVersion(ADID, "sfx", sfxResult.versionId)) as SfxVersion;
    expect(sfxVersion.soundFxPrompts[0].anchor).toEqual({
      kind: "relativeTo",
      slotId: voiceSlot,
      edge: "end",
    });
  });
});

describe("createMusicDraft slot lineage", () => {
  it("first draft mints one slot id; second preserves it", async () => {
    const first = await createMusicDraft({
      adId: ADID,
      prompt: "upbeat pop",
      duration: 30,
    });
    const firstVersion = (await getVersion(ADID, "music", first.versionId)) as MusicVersion;
    const slotId = firstVersion.slotId;
    expect(slotId).toBeTruthy();
    await freezeVersion(ADID, "music", first.versionId);

    const second = await createMusicDraft({
      adId: ADID,
      prompt: "upbeat pop, more energetic",
      duration: 30,
    });

    const child = (await getVersion(ADID, "music", second.versionId)) as MusicVersion;
    expect(child.slotId).toBe(slotId);
    expect(second.reconciliation!.preserved).toEqual([
      { slotId: slotId!, ordinalIndex: 0 },
    ]);
  });
});
