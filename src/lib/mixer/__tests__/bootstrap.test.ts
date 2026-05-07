/**
 * Tests for stage-6 lazy mixer bootstrap.
 *
 * Coverage targets:
 *   - Truly-empty ads: no-op (don't mint mixer:v1 for ads without content).
 *   - Legacy ad with content: mixer:v1 created; legacy blob deleted; anchors
 *     derived with llm-seed provenance; slot ids backfilled; pins point at
 *     current stream actives.
 *   - Draft stream versions stay drafts after bootstrap — no eager freeze.
 *     (Earlier revisions force-froze drafts, which stole draft editability
 *     from freshly-generated ads.)
 *   - Idempotency: second call is a no-op returning the existing active id.
 *   - Anchor translation parity with anchorFromVoiceTrack / ...FromMusic /
 *     ...FromSoundFxPrompt fixtures to prove bootstrap shares the stage-4
 *     legacy-translation path (not a parallel implementation).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRedis } from "@/test/utils";
import {
  mockAdId,
  mockMusicVersionFrozen,
  mockSfxVersionFrozen,
  mockSoundFxPrompt,
  mockVoiceTrack,
  mockVoiceVersionDraft,
  mockVoiceVersionFrozen,
} from "@/test/fixtures/versions";
import type {
  MixerVersion,
  MusicVersion,
  SfxVersion,
  VoiceVersion,
} from "@/types/versions";

let mockRedis: ReturnType<typeof createMockRedis>;

vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

import {
  AD_KEYS,
  createVersion,
  getActiveVersion,
  getVersion,
  listVersions,
  setActiveVersion,
} from "../../redis/versions";
import { bootstrapLegacyMixer } from "../bootstrap";

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
});

describe("bootstrapLegacyMixer", () => {
  it("skips ads with no content streams at all (no spurious mixer:v1)", async () => {
    const result = await bootstrapLegacyMixer(mockAdId);

    expect(result.created).toBe(false);
    expect(result.versionId).toBeNull();

    const versions = await listVersions(mockAdId, "mixer");
    expect(versions).toEqual([]);
  });

  it("creates mixer:v1 from a legacy voice-only ad and deletes the legacy blob", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      generatedUrls: ["https://example.com/voice-1.mp3"],
    };
    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Seed the legacy single-key blob so we can verify deletion.
    await mockRedis.set(
      AD_KEYS.mixer(mockAdId),
      JSON.stringify({ tracks: [], volumes: {} }),
    );

    const result = await bootstrapLegacyMixer(mockAdId);

    expect(result.created).toBe(true);
    expect(result.versionId).toBe("v1");
    expect(result.legacyKeyDeleted).toBe(true);

    const active = await getActiveVersion(mockAdId, "mixer");
    expect(active).toBe("v1");

    const mixer = (await getVersion(mockAdId, "mixer", "v1")) as MixerVersion;
    expect(mixer.status).toBe("frozen");
    expect(mixer.pins).toEqual({ voices: "v1", music: null, sfx: null });

    // Anchor graph is non-empty — voice slot got an llm-seed anchor.
    const anchorEntries = Object.values(mixer.anchors);
    expect(anchorEntries.length).toBe(1);
    expect(anchorEntries[0].origin).toBe("llm-seed");

    // Legacy key is gone.
    const legacy = await mockRedis.get(AD_KEYS.mixer(mockAdId));
    expect(legacy).toBeNull();
  });

  it("backfills slot ids onto voice/music/sfx versions that predate stage 2", async () => {
    // Fixtures deliberately have no slotId.
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [
        { ...mockVoiceTrack, text: "first" },
        { ...mockVoiceTrack, text: "second" },
      ],
      generatedUrls: ["https://example.com/a.mp3", "https://example.com/b.mp3"],
    };
    const musicVersion: MusicVersion = { ...mockMusicVersionFrozen };
    const sfxVersion: SfxVersion = {
      ...mockSfxVersionFrozen,
      soundFxPrompts: [{ ...mockSoundFxPrompt }, { ...mockSoundFxPrompt }],
      generatedUrls: [
        "https://example.com/s1.mp3",
        "https://example.com/s2.mp3",
      ],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await createVersion(mockAdId, "music", musicVersion);
    await createVersion(mockAdId, "sfx", sfxVersion);
    await setActiveVersion(mockAdId, "voices", "v1");
    await setActiveVersion(mockAdId, "music", "v1");
    await setActiveVersion(mockAdId, "sfx", "v1");

    await bootstrapLegacyMixer(mockAdId);

    const voicePost = (await getVersion(
      mockAdId,
      "voices",
      "v1",
    )) as VoiceVersion;
    const musicPost = (await getVersion(
      mockAdId,
      "music",
      "v1",
    )) as MusicVersion;
    const sfxPost = (await getVersion(mockAdId, "sfx", "v1")) as SfxVersion;

    expect(voicePost.voiceTracks.every((t) => !!t.slotId)).toBe(true);
    expect(new Set(voicePost.voiceTracks.map((t) => t.slotId)).size).toBe(2);
    expect(typeof musicPost.slotId).toBe("string");
    expect(sfxPost.soundFxPrompts.every((p) => !!p.slotId)).toBe(true);
    expect(new Set(sfxPost.soundFxPrompts.map((p) => p.slotId)).size).toBe(2);
  });

  it("anchor graph uses voice/music/sfx slot ids as keys", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      voiceTracks: [
        { ...mockVoiceTrack, slotId: "voice-slot-a" },
        { ...mockVoiceTrack, slotId: "voice-slot-b", playAfter: "track-0" },
      ],
      generatedUrls: ["https://x/a.mp3", "https://x/b.mp3"],
    };
    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    await bootstrapLegacyMixer(mockAdId);

    const mixer = (await getVersion(mockAdId, "mixer", "v1")) as MixerVersion;
    expect(mixer.anchors["voice-slot-a"]).toBeDefined();
    expect(mixer.anchors["voice-slot-b"]).toBeDefined();

    // Second voice anchored relative to the first via legacy playAfter translation.
    const secondAnchor = mixer.anchors["voice-slot-b"].anchor;
    expect(secondAnchor).toMatchObject({
      kind: "relativeTo",
      slotId: "voice-slot-a",
      edge: "end",
    });
  });

  it("preserves draft status on active stream versions — no eager freeze", async () => {
    // Regression guard: bootstrap used to force-freeze active drafts, which
    // stole draft editability from freshly-generated ads. Stream drafts must
    // remain drafts until the next iteration triggers freezeExistingDraft.
    const voiceDraft: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://x.mp3"],
      status: "draft",
    };
    await createVersion(mockAdId, "voices", voiceDraft);
    await setActiveVersion(mockAdId, "voices", "v1");

    await bootstrapLegacyMixer(mockAdId);

    const voicePost = (await getVersion(
      mockAdId,
      "voices",
      "v1",
    )) as VoiceVersion;
    expect(voicePost.status).toBe("draft");
  });

  it("is idempotent — second call is a no-op returning the existing active id", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      generatedUrls: ["https://x.mp3"],
    };
    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    const first = await bootstrapLegacyMixer(mockAdId);
    const second = await bootstrapLegacyMixer(mockAdId);

    expect(first.created).toBe(true);
    expect(first.versionId).toBe("v1");
    expect(second.created).toBe(false);
    expect(second.versionId).toBe("v1");

    // Still exactly one mixer version.
    const versions = await listVersions(mockAdId, "mixer");
    expect(versions).toEqual(["v1"]);
  });

  it("pins reflect which stream versions were active at bootstrap", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionFrozen,
      generatedUrls: ["https://x.mp3"],
    };
    const musicVersion: MusicVersion = { ...mockMusicVersionFrozen };
    // Create two voice versions, activate v2; pins should be v2, not v1.
    await createVersion(mockAdId, "voices", voiceVersion);
    await createVersion(mockAdId, "voices", voiceVersion);
    await createVersion(mockAdId, "music", musicVersion);
    await setActiveVersion(mockAdId, "voices", "v2");
    await setActiveVersion(mockAdId, "music", "v1");

    await bootstrapLegacyMixer(mockAdId);

    const mixer = (await getVersion(mockAdId, "mixer", "v1")) as MixerVersion;
    expect(mixer.pins.voices).toBe("v2");
    expect(mixer.pins.music).toBe("v1");
    expect(mixer.pins.sfx).toBeNull();
  });
});
