/**
 * Tests for Mixer Rebuilder Logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rebuildMixer, getMixerState } from "../rebuilder";
import { createVersion, setActiveVersion } from "../../redis/versions";
import {
  mockAdId,
  mockVoiceVersionDraft,
  mockMusicVersionDraft,
  mockSfxVersionDraft,
  mockVoiceTrack,
  mockSoundFxPrompt,
} from "@/test/fixtures/versions";
import { createMockRedis } from "@/test/utils";
import type { VoiceVersion, MusicVersion, SfxVersion } from "@/types/versions";

// Mock Redis V3
vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

// Mock LegacyTimelineCalculator
vi.mock("@/services/legacyTimelineCalculator", () => ({
  LegacyTimelineCalculator: {
    calculateTimings: vi.fn((tracks, audioDurations) => {
      // Simple mock that calculates sequential timing
      let currentTime = 0;
      const calculatedTracks = tracks.map((track: { id: string; type: string }) => {
        const duration = audioDurations[track.id] || 3;
        const startTime = currentTime;
        currentTime += duration;

        return {
          id: track.id,
          actualStartTime: startTime,
          actualDuration: duration,
          type: track.type,
        };
      });

      return {
        calculatedTracks,
        totalDuration: currentTime,
      };
    }),
  },
}));

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
  vi.clearAllMocks();
});

describe("rebuildMixer", () => {
  describe("with all streams active and generated", () => {
    it("should build mixer with voice, music, and sfx tracks", async () => {
      // Create versions with generated URLs
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: ["https://blob.vercel-storage.com/voice-1.mp3"],
      };
      const musicVersion: MusicVersion = {
        ...mockMusicVersionDraft,
        generatedUrl: "https://blob.vercel-storage.com/music-1.mp3",
      };
      const sfxVersion: SfxVersion = {
        ...mockSfxVersionDraft,
        generatedUrls: ["https://blob.vercel-storage.com/sfx-1.mp3"],
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await createVersion(mockAdId, "music", musicVersion);
      await createVersion(mockAdId, "sfx", sfxVersion);

      await setActiveVersion(mockAdId, "voices", "v1");
      await setActiveVersion(mockAdId, "music", "v1");
      await setActiveVersion(mockAdId, "sfx", "v1");

      // Rebuild mixer
      const mixerState = await rebuildMixer(mockAdId);

      // Verify mixer structure
      expect(mixerState).toMatchObject({
        volumes: {},
        activeVersions: {
          voices: "v1",
          music: "v1",
          sfx: "v1",
        },
      });

      // Verify tracks array
      expect(mixerState.tracks).toHaveLength(3);
      expect(mixerState.tracks[0].type).toBe("voice");
      expect(mixerState.tracks[1].type).toBe("music");
      expect(mixerState.tracks[2].type).toBe("soundfx");

      // Verify calculated tracks
      expect(mixerState.calculatedTracks).toHaveLength(3);
      expect(mixerState.totalDuration).toBeGreaterThan(0);

      // Verify timestamps
      expect(mixerState.lastCalculated).toBeGreaterThan(0);
    });

    it("should include track metadata", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        voiceTracks: [
          {
            ...mockVoiceTrack,
            voice: {
              ...mockVoiceTrack.voice!,
              name: "Test Voice",
              id: "test-voice-123",
              gender: "female" as const,
            },
            text: "Test script text",
          },
        ],
        generatedUrls: ["https://example.com/voice.mp3"],
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      const voiceTrack = mixerState.tracks[0];
      expect(voiceTrack.label).toBe("Test Voice");
      expect(voiceTrack.metadata).toMatchObject({
        voiceId: "test-voice-123",
        scriptText: "Test script text",
      });
    });

    it("should persist mixer state to Redis", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: ["https://example.com/voice.mp3"],
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      await rebuildMixer(mockAdId);

      // Retrieve from Redis
      const savedState = await getMixerState(mockAdId);

      expect(savedState).not.toBeNull();
      expect(savedState?.tracks).toHaveLength(1);
      expect(savedState?.activeVersions.voices).toBe("v1");
    });
  });

  describe("with partial active versions", () => {
    it("should build mixer with only voice tracks when only voices active", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: ["https://example.com/voice.mp3"],
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toHaveLength(1);
      expect(mixerState.tracks[0].type).toBe("voice");
      expect(mixerState.activeVersions).toMatchObject({
        voices: "v1",
        music: null,
        sfx: null,
      });
    });

    it("should build mixer with only music track when only music active", async () => {
      const musicVersion: MusicVersion = {
        ...mockMusicVersionDraft,
        generatedUrl: "https://example.com/music.mp3",
        duration: 30,
      };

      await createVersion(mockAdId, "music", musicVersion);
      await setActiveVersion(mockAdId, "music", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toHaveLength(1);
      expect(mixerState.tracks[0].type).toBe("music");
      // Label is "{Provider} - {prompt preview}" format
      expect(mixerState.tracks[0].label).toContain("Loudly");
      expect(mixerState.tracks[0].duration).toBe(30);
    });

    it("should handle voices and music without sfx", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: ["https://example.com/voice.mp3"],
      };
      const musicVersion: MusicVersion = {
        ...mockMusicVersionDraft,
        generatedUrl: "https://example.com/music.mp3",
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await createVersion(mockAdId, "music", musicVersion);
      await setActiveVersion(mockAdId, "voices", "v1");
      await setActiveVersion(mockAdId, "music", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toHaveLength(2);
      expect(mixerState.activeVersions.sfx).toBeNull();
    });
  });

  describe("with no active versions", () => {
    it("should return empty mixer when no versions activated", async () => {
      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toEqual([]);
      expect(mixerState.calculatedTracks).toEqual([]);
      expect(mixerState.totalDuration).toBe(0);
      expect(mixerState.activeVersions).toMatchObject({
        voices: null,
        music: null,
        sfx: null,
      });
    });
  });

  describe("with active versions but no generated URLs", () => {
    it("should skip voice tracks without generated URLs", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: [], // No audio generated yet
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      // No tracks added since no URLs
      expect(mixerState.tracks).toEqual([]);
      expect(mixerState.activeVersions.voices).toBe("v1");
    });

    it("should skip music track without generated URL", async () => {
      const musicVersion: MusicVersion = {
        ...mockMusicVersionDraft,
        generatedUrl: "", // No audio generated yet
      };

      await createVersion(mockAdId, "music", musicVersion);
      await setActiveVersion(mockAdId, "music", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toEqual([]);
    });

    it("should include generated tracks and skip ungenerated ones", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        voiceTracks: [mockVoiceTrack, mockVoiceTrack],
        generatedUrls: ["https://example.com/voice-1.mp3"], // Only first one generated
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      // Only one track added (second skipped due to missing URL)
      expect(mixerState.tracks).toHaveLength(1);
    });
  });

  describe("with multiple voice tracks", () => {
    it("should handle multiple voice tracks with generated URLs", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        voiceTracks: [
          { ...mockVoiceTrack, text: "First voice track" },
          { ...mockVoiceTrack, text: "Second voice track" },
          { ...mockVoiceTrack, text: "Third voice track" },
        ],
        generatedUrls: [
          "https://example.com/voice-1.mp3",
          "https://example.com/voice-2.mp3",
          "https://example.com/voice-3.mp3",
        ],
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await setActiveVersion(mockAdId, "voices", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toHaveLength(3);
      expect(mixerState.tracks.every((t) => t.type === "voice")).toBe(true);
    });
  });

  describe("with multiple SFX tracks", () => {
    it("should handle multiple sound effect tracks", async () => {
      const sfxVersion: SfxVersion = {
        ...mockSfxVersionDraft,
        soundFxPrompts: [
          { ...mockSoundFxPrompt, description: "Whoosh 1" },
          { ...mockSoundFxPrompt, description: "Whoosh 2" },
        ],
        generatedUrls: [
          "https://example.com/sfx-1.mp3",
          "https://example.com/sfx-2.mp3",
        ],
      };

      await createVersion(mockAdId, "sfx", sfxVersion);
      await setActiveVersion(mockAdId, "sfx", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      expect(mixerState.tracks).toHaveLength(2);
      expect(mixerState.tracks[0].type).toBe("soundfx");
      expect(mixerState.tracks[0].label).toContain("Whoosh 1");
    });
  });

  describe("timeline calculation integration", () => {
    it("should calculate sequential timing for tracks", async () => {
      const voiceVersion: VoiceVersion = {
        ...mockVoiceVersionDraft,
        generatedUrls: ["https://example.com/voice.mp3"],
      };
      const musicVersion: MusicVersion = {
        ...mockMusicVersionDraft,
        generatedUrl: "https://example.com/music.mp3",
        duration: 30,
      };

      await createVersion(mockAdId, "voices", voiceVersion);
      await createVersion(mockAdId, "music", musicVersion);
      await setActiveVersion(mockAdId, "voices", "v1");
      await setActiveVersion(mockAdId, "music", "v1");

      const mixerState = await rebuildMixer(mockAdId);

      // Verify calculated tracks have timing info
      expect(mixerState.calculatedTracks).toHaveLength(2);
      expect(mixerState.calculatedTracks[0]).toHaveProperty("startTime");
      expect(mixerState.calculatedTracks[0]).toHaveProperty("duration");

      // Verify total duration calculated
      expect(mixerState.totalDuration).toBeGreaterThan(0);
    });
  });

  describe("version switching", () => {
    it("should rebuild with new tracks when version changes", async () => {
      // Create two voice versions
      const v1: VoiceVersion = {
        ...mockVoiceVersionDraft,
        voiceTracks: [{ ...mockVoiceTrack, text: "Version 1 text" }],
        generatedUrls: ["https://example.com/v1-voice.mp3"],
      };
      const v2: VoiceVersion = {
        ...mockVoiceVersionDraft,
        voiceTracks: [{ ...mockVoiceTrack, text: "Version 2 text" }],
        generatedUrls: ["https://example.com/v2-voice.mp3"],
      };

      await createVersion(mockAdId, "voices", v1);
      await createVersion(mockAdId, "voices", v2);

      // Activate v1
      await setActiveVersion(mockAdId, "voices", "v1");
      let mixerState = await rebuildMixer(mockAdId);
      expect(mixerState.activeVersions.voices).toBe("v1");
      expect(mixerState.tracks[0].url).toContain("v1-voice.mp3");

      // Switch to v2
      await setActiveVersion(mockAdId, "voices", "v2");
      mixerState = await rebuildMixer(mockAdId);
      expect(mixerState.activeVersions.voices).toBe("v2");
      expect(mixerState.tracks[0].url).toContain("v2-voice.mp3");
    });
  });
});

describe("getMixerState", () => {
  it("should return null when no mixer state exists", async () => {
    const state = await getMixerState(mockAdId);

    expect(state).toBeNull();
  });

  it("should retrieve saved mixer state", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/voice.mp3"],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Build mixer
    const builtState = await rebuildMixer(mockAdId);

    // Retrieve it
    const retrievedState = await getMixerState(mockAdId);

    expect(retrievedState).toEqual(builtState);
  });

  it("should parse JSON data correctly", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/voice.mp3"],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");
    await rebuildMixer(mockAdId);

    const state = await getMixerState(mockAdId);

    expect(state).toHaveProperty("tracks");
    expect(state).toHaveProperty("calculatedTracks");
    expect(state).toHaveProperty("totalDuration");
    expect(state).toHaveProperty("activeVersions");
    expect(Array.isArray(state?.tracks)).toBe(true);
  });
});
