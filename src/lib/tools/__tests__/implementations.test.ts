import { describe, it, expect } from "vitest";
import { searchVoices, createVoiceDraft } from "../implementations";

describe("searchVoices", () => {
  it("returns voices matching language", async () => {
    const result = await searchVoices({ language: "english", count: 5 });
    expect(result.voices.length).toBeGreaterThan(0);
    expect(result.voices.length).toBeLessThanOrEqual(5);
    expect(result.count).toBe(result.voices.length);
  });

  it("filters by gender", async () => {
    const result = await searchVoices({
      language: "english",
      gender: "female",
      count: 10,
    });
    expect(
      result.voices.every((v) => v.gender.toLowerCase() === "female")
    ).toBe(true);
  });

  it("returns empty array for unsupported language", async () => {
    const result = await searchVoices({ language: "klingon", count: 10 });
    expect(result.voices).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("respects count parameter", async () => {
    const result = await searchVoices({ language: "english", count: 3 });
    expect(result.voices.length).toBeLessThanOrEqual(3);
  });
});

describe("createVoiceDraft", () => {
  it("creates draft version in Redis", async () => {
    const result = await createVoiceDraft({
      adId: "test-ad-001",
      tracks: [
        { voiceId: "voice-1", text: "Hello world" },
        {
          voiceId: "voice-2",
          text: "Goodbye",
          playAfter: "track-0",
          overlap: -0.5,
        },
      ],
    });

    expect(result.versionId).toMatch(/^v\d+$/);
    expect(result.status).toBe("draft");
  });

  it("creates draft with single track", async () => {
    const result = await createVoiceDraft({
      adId: "test-ad-002",
      tracks: [{ voiceId: "voice-1", text: "Single track" }],
    });

    expect(result.versionId).toMatch(/^v\d+$/);
    expect(result.status).toBe("draft");
  });

  it("handles empty tracks array gracefully", async () => {
    const result = await createVoiceDraft({
      adId: "test-ad-003",
      tracks: [],
    });

    expect(result.versionId).toMatch(/^v\d+$/);
    expect(result.status).toBe("draft");
  });
});
