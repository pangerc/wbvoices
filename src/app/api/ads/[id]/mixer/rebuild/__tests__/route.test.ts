/**
 * Integration tests for Mixer Rebuild API endpoint
 * POST /api/ads/[id]/mixer/rebuild
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { createVersion, setActiveVersion } from "@/lib/redis/versions";
import {
  mockAdId,
  mockVoiceVersionDraft,
  mockMusicVersionDraft,
} from "@/test/fixtures/versions";
import { createMockRedis } from "@/test/utils";
import type { VoiceVersion, MusicVersion } from "@/types/versions";

// Mock Redis V3
vi.mock("@/lib/redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

// Mock LegacyTimelineCalculator
vi.mock("@/services/legacyTimelineCalculator", () => ({
  LegacyTimelineCalculator: {
    calculateTimings: vi.fn((tracks, audioDurations) => {
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
      return { calculatedTracks, totalDuration: currentTime };
    }),
  },
}));

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
  vi.clearAllMocks();
});

describe("POST /api/ads/[id]/mixer/rebuild", () => {
  it("should rebuild mixer successfully with active versions", async () => {
    // Setup: Create and activate versions
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

    // Make request
    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });

    const response = await POST(request, { params });

    // Verify response
    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty("tracks");
    expect(data).toHaveProperty("calculatedTracks");
    expect(data).toHaveProperty("totalDuration");
    expect(data).toHaveProperty("activeVersions");

    // Verify tracks
    expect(data.tracks).toHaveLength(2);
    expect(data.tracks[0].type).toBe("voice");
    expect(data.tracks[1].type).toBe("music");

    // Verify active versions
    expect(data.activeVersions).toMatchObject({
      voices: "v1",
      music: "v1",
      sfx: null,
    });
  });

  it("should handle empty mixer (no active versions)", async () => {
    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.tracks).toEqual([]);
    expect(data.calculatedTracks).toEqual([]);
    expect(data.totalDuration).toBe(0);
    expect(data.activeVersions).toMatchObject({
      voices: null,
      music: null,
      sfx: null,
    });
  });

  it("should handle mixer with only voice tracks", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/voice.mp3"],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });

    const response = await POST(request, { params });

    expect(response.status).toBe(200);

    const data = await response.json();

    expect(data.tracks).toHaveLength(1);
    expect(data.tracks[0].type).toBe("voice");
    expect(data.activeVersions.voices).toBe("v1");
    expect(data.activeVersions.music).toBeNull();
  });

  it("should include calculated timeline in response", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/voice.mp3"],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });

    const response = await POST(request, { params });
    const data = await response.json();

    expect(data.calculatedTracks).toHaveLength(1);
    expect(data.calculatedTracks[0]).toHaveProperty("id");
    expect(data.calculatedTracks[0]).toHaveProperty("startTime");
    expect(data.calculatedTracks[0]).toHaveProperty("duration");
    expect(data.calculatedTracks[0]).toHaveProperty("type");
    expect(data.totalDuration).toBeGreaterThan(0);
  });

  it("should include lastCalculated timestamp", async () => {
    const beforeTime = Date.now();

    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });

    const response = await POST(request, { params });
    const data = await response.json();

    const afterTime = Date.now();

    expect(data.lastCalculated).toBeGreaterThanOrEqual(beforeTime);
    expect(data.lastCalculated).toBeLessThanOrEqual(afterTime);
  });

  it("should return 500 on error", async () => {
    // Force an error by passing invalid adId that causes issues
    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });

    // Mock rebuildMixer to throw error
    const rebuildMixerModule = await import("@/lib/mixer/rebuilder");
    const originalRebuild = rebuildMixerModule.rebuildMixer;

    vi.spyOn(rebuildMixerModule, "rebuildMixer").mockRejectedValueOnce(
      new Error("Test error")
    );

    const params = Promise.resolve({ id: mockAdId });
    const response = await POST(request, { params });

    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Failed to rebuild mixer");
    expect(data).toHaveProperty("details");

    // Restore original
    vi.spyOn(rebuildMixerModule, "rebuildMixer").mockImplementation(originalRebuild);
  });

  it("should handle different adIds correctly", async () => {
    const adId1 = "test-ad-1";
    const adId2 = "test-ad-2";

    // Create versions for first ad
    const voiceV1: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/ad1-voice.mp3"],
    };
    await createVersion(adId1, "voices", voiceV1);
    await setActiveVersion(adId1, "voices", "v1");

    // Create versions for second ad
    const voiceV2: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/ad2-voice.mp3"],
    };
    await createVersion(adId2, "voices", voiceV2);
    await setActiveVersion(adId2, "voices", "v1");

    // Rebuild first ad
    const request1 = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params1 = Promise.resolve({ id: adId1 });
    const response1 = await POST(request1, { params: params1 });
    const data1 = await response1.json();

    // Rebuild second ad
    const request2 = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params2 = Promise.resolve({ id: adId2 });
    const response2 = await POST(request2, { params: params2 });
    const data2 = await response2.json();

    // Verify they're independent
    expect(data1.tracks[0].url).toContain("ad1-voice.mp3");
    expect(data2.tracks[0].url).toContain("ad2-voice.mp3");
  });

  it("should persist rebuilt mixer to Redis", async () => {
    const voiceVersion: VoiceVersion = {
      ...mockVoiceVersionDraft,
      generatedUrls: ["https://example.com/voice.mp3"],
    };

    await createVersion(mockAdId, "voices", voiceVersion);
    await setActiveVersion(mockAdId, "voices", "v1");

    // Rebuild via API
    const request = new Request("http://localhost:3003/api/ads/test/mixer/rebuild", {
      method: "POST",
    });
    const params = Promise.resolve({ id: mockAdId });
    await POST(request, { params });

    // Verify saved to Redis using getMixerState
    const { getMixerState } = await import("@/lib/mixer/rebuilder");
    const savedState = await getMixerState(mockAdId);

    expect(savedState).not.toBeNull();
    expect(savedState?.tracks).toHaveLength(1);
  });
});
