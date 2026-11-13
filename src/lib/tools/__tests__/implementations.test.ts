/**
 * Integration tests for the draft-creation tool implementations.
 *
 * Focuses on slot-id lineage: a new draft inherits slot ids from its parent
 * version by ordinal match, mints fresh ids for added slots, and reports
 * orphaned ids for removed slots. The `reconcileSlots` pure unit is covered
 * separately in slotReconciliation.test.ts — this file exercises the wiring.
 */

import { createMockRedis } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { freezeVersion, getVersion } from "@/lib/redis/versions";
import type { MusicVersion, SfxVersion, VoiceVersion } from "@/types/versions";
import {
  createMusicDraft,
  createSfxDraft,
  createVoiceDraft,
} from "../implementations";

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

    const stored = (await getVersion(
      ADID,
      "voices",
      result.versionId,
    )) as VoiceVersion;
    expect(stored.voiceTracks).toHaveLength(2);
    expect(stored.voiceTracks[0].slotId).toBeTruthy();
    expect(stored.voiceTracks[1].slotId).toBeTruthy();
    expect(stored.voiceTracks[0].slotId).not.toBe(stored.voiceTracks[1].slotId);
    // No default "track-{i-1}": it goes stale when a line is deleted.
    expect(stored.voiceTracks.map((t) => t.playAfter)).toEqual([
      undefined,
      undefined,
    ]);
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
    const parent = (await getVersion(
      ADID,
      "voices",
      first.versionId,
    )) as VoiceVersion;
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

    const child = (await getVersion(
      ADID,
      "voices",
      second.versionId,
    )) as VoiceVersion;
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
    const firstVersion = (await getVersion(
      ADID,
      "voices",
      first.versionId,
    )) as VoiceVersion;
    const originalSlotId = firstVersion.voiceTracks[0].slotId;
    await freezeVersion(ADID, "voices", first.versionId);

    const second = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "line 1" },
        { voiceId: "b", text: "line 2 added" },
      ],
    });

    const child = (await getVersion(
      ADID,
      "voices",
      second.versionId,
    )) as VoiceVersion;
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
    const firstVersion = (await getVersion(
      ADID,
      "voices",
      first.versionId,
    )) as VoiceVersion;
    const keptSlot = firstVersion.voiceTracks[0].slotId;
    const droppedSlot = firstVersion.voiceTracks[1].slotId;
    await freezeVersion(ADID, "voices", first.versionId);

    const second = await createVoiceDraft({
      adId: ADID,
      tracks: [{ voiceId: "a", text: "keep" }],
    });

    const child = (await getVersion(
      ADID,
      "voices",
      second.versionId,
    )) as VoiceVersion;
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
    const firstVersion = (await getVersion(
      ADID,
      "voices",
      first.versionId,
    )) as VoiceVersion;
    await freezeVersion(ADID, "voices", first.versionId);

    const forked = await createVoiceDraft({
      adId: ADID,
      parentVersionId: null,
      tracks: [{ voiceId: "a", text: "fresh start" }],
    });

    const forkedVersion = (await getVersion(
      ADID,
      "voices",
      forked.versionId,
    )) as VoiceVersion;
    expect(forkedVersion.voiceTracks[0].slotId).not.toBe(
      firstVersion.voiceTracks[0].slotId,
    );
    expect(forkedVersion.parentVersionId).toBeUndefined();
    expect(forked.reconciliation).toBeUndefined();
  });
});

describe("createSfxDraft slot lineage", () => {
  it("preserves slot ids across equal-count regeneration", async () => {
    const first = await createSfxDraft({
      adId: ADID,
      prompts: [{ description: "whoosh" }, { description: "ding" }],
    });
    const firstVersion = (await getVersion(
      ADID,
      "sfx",
      first.versionId,
    )) as SfxVersion;
    const parentSlotIds = firstVersion.soundFxPrompts.map((p) => p.slotId);
    await freezeVersion(ADID, "sfx", first.versionId);

    const second = await createSfxDraft({
      adId: ADID,
      prompts: [{ description: "new whoosh" }, { description: "new ding" }],
    });

    const child = (await getVersion(
      ADID,
      "sfx",
      second.versionId,
    )) as SfxVersion;
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
    const version = (await getVersion(
      ADID,
      "voices",
      result.versionId,
    )) as VoiceVersion;
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
    const version = (await getVersion(
      ADID,
      "voices",
      result.versionId,
    )) as VoiceVersion;
    expect(version.voiceTracks[0].anchor).toBeUndefined();
  });
});

/**
 * The cue's Placement listbox is the only source of truth for where it plays,
 * so an AI anchor is stored as the placement it means, never as an anchor the
 * listbox can't show or change.
 */
describe("createSfxDraft: AI anchors become placements", () => {
  /** One anchor for each placement an anchor can map to (end has no anchor form). */
  const ANCHORED_PROMPTS = [
    {
      description: "ding after voice 2",
      anchor: { kind: "relativeTo", trackRef: "voice-1", edge: "end" },
    },
    {
      description: "bed with voice 1",
      anchor: {
        kind: "simultaneousWith",
        trackRef: "voice-0",
        alignment: "startAtStart",
      },
    },
    {
      description: "intro whoosh",
      anchor: { kind: "absolute", t: 0 },
    },
  ] as const;

  const EXPECTED_PLACEMENTS = [
    { type: "afterVoice", index: 1 },
    { type: "withFirstVoice" },
    { type: "beforeVoices" },
  ];

  async function twoVoiceLines(): Promise<string> {
    const voices = await createVoiceDraft({
      adId: ADID,
      tracks: [
        { voiceId: "a", text: "voice one" },
        { voiceId: "b", text: "voice two" },
      ],
    });

    return voices.versionId;
  }

  async function storedCues(sfxVersionId: string) {
    const sfxVersion = (await getVersion(
      ADID,
      "sfx",
      sfxVersionId,
    )) as SfxVersion;

    return sfxVersion.soundFxPrompts;
  }

  it("maps anchors to placements when a voice version is active", async () => {
    const voiceVersionId = await twoVoiceLines();
    await freezeVersion(ADID, "voices", voiceVersionId);
    const { setActiveVersion } = await import("@/lib/redis/versions");
    await setActiveVersion(ADID, "voices", voiceVersionId);

    const sfx = await createSfxDraft({
      adId: ADID,
      prompts: [...ANCHORED_PROMPTS],
    });

    const cues = await storedCues(sfx.versionId);
    expect(cues.map((cue) => cue.placement)).toEqual(EXPECTED_PLACEMENTS);
    expect(cues.map((cue) => cue.anchor)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("maps anchors to placements before any voice version is active (no voice lookup needed)", async () => {
    // Generation writes the voice draft in the same agent loop and only
    // activates it once the loop is done; the anchor->placement mapping must
    // not depend on the voice version.
    await twoVoiceLines();

    const sfx = await createSfxDraft({
      adId: ADID,
      prompts: [...ANCHORED_PROMPTS],
    });

    const cues = await storedCues(sfx.versionId);
    expect(cues.map((cue) => cue.placement)).toEqual(EXPECTED_PLACEMENTS);
    expect(cues.map((cue) => cue.anchor)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("an anchor's placement wins over the placement field; no equivalent falls back", async () => {
    const sfx = await createSfxDraft({
      adId: ADID,
      prompts: [
        {
          description: "sting",
          anchor: { kind: "absolute", t: 2 },
          placement: { type: "afterVoice", index: 0 },
        },
        {
          description: "tail",
          anchor: { kind: "relativeTo", trackRef: "voice-1", edge: "start" },
        },
      ],
    });

    const cues = await storedCues(sfx.versionId);
    expect(cues.map((cue) => cue.placement)).toEqual([
      { type: "afterVoice", index: 0 },
      { type: "end" },
    ]);
    expect(cues.map((cue) => cue.anchor)).toEqual([undefined, undefined]);
  });
});

describe("createMusicDraft slot lineage", () => {
  it("first draft mints one slot id; second preserves it", async () => {
    const first = await createMusicDraft({
      adId: ADID,
      prompt: "upbeat pop",
      duration: 30,
    });
    const firstVersion = (await getVersion(
      ADID,
      "music",
      first.versionId,
    )) as MusicVersion;
    const slotId = firstVersion.slotId;
    expect(slotId).toBeTruthy();
    await freezeVersion(ADID, "music", first.versionId);

    const second = await createMusicDraft({
      adId: ADID,
      prompt: "upbeat pop, more energetic",
      duration: 30,
    });

    const child = (await getVersion(
      ADID,
      "music",
      second.versionId,
    )) as MusicVersion;
    expect(child.slotId).toBe(slotId);
    expect(second.reconciliation!.preserved).toEqual([
      { slotId: slotId!, ordinalIndex: 0 },
    ]);
  });
});
