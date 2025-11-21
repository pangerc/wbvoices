/**
 * Tests for Redis version management operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createVersion,
  getVersion,
  listVersions,
  getAllVersionsWithData,
  getActiveVersion,
  setActiveVersion,
  updateVersion,
  deleteVersion,
  setAdMetadata,
  getAdMetadata,
  AD_KEYS,
} from "../versions";
import {
  mockVoiceVersionDraft,
  mockMusicVersionDraft,
  mockSfxVersionDraft,
  mockAdId,
} from "@/test/fixtures/versions";
import { createMockRedis } from "@/test/utils";
import type { AdMetadata } from "@/types/versions";

// Mock the Redis V3 module
vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

let mockRedis: ReturnType<typeof createMockRedis>;

beforeEach(async () => {
  mockRedis = createMockRedis();
  // Clear all Redis data between tests
  await mockRedis.flushall();
});

describe("AD_KEYS", () => {
  it("should generate correct meta key", () => {
    expect(AD_KEYS.meta(mockAdId)).toBe(`ad:${mockAdId}:meta`);
  });

  it("should generate correct versions key", () => {
    expect(AD_KEYS.versions(mockAdId, "voices")).toBe(
      `ad:${mockAdId}:voices:versions`
    );
  });

  it("should generate correct active key", () => {
    expect(AD_KEYS.active(mockAdId, "music")).toBe(
      `ad:${mockAdId}:music:active`
    );
  });

  it("should generate correct version key", () => {
    expect(AD_KEYS.version(mockAdId, "sfx", "v1")).toBe(
      `ad:${mockAdId}:sfx:v:v1`
    );
  });

  it("should generate correct mixer key", () => {
    expect(AD_KEYS.mixer(mockAdId)).toBe(`ad:${mockAdId}:mixer`);
  });
});

describe("createVersion", () => {
  it("should create first version with ID v1", async () => {
    const versionId = await createVersion(
      mockAdId,
      "voices",
      mockVoiceVersionDraft
    );

    expect(versionId).toBe("v1");

    // Verify version data was saved
    const savedVersion = await getVersion(mockAdId, "voices", "v1");
    expect(savedVersion).toMatchObject(mockVoiceVersionDraft);
  });

  it("should auto-increment version IDs", async () => {
    // Create three versions
    const v1 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    const v2 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    const v3 = await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    expect(v1).toBe("v1");
    expect(v2).toBe("v2");
    expect(v3).toBe("v3");
  });

  it("should maintain separate version sequences per stream", async () => {
    const voiceV1 = await createVersion(
      mockAdId,
      "voices",
      mockVoiceVersionDraft
    );
    const musicV1 = await createVersion(
      mockAdId,
      "music",
      mockMusicVersionDraft
    );
    const sfxV1 = await createVersion(mockAdId, "sfx", mockSfxVersionDraft);

    // Each stream starts at v1
    expect(voiceV1).toBe("v1");
    expect(musicV1).toBe("v1");
    expect(sfxV1).toBe("v1");

    // Verify they're independent
    const voiceV2 = await createVersion(
      mockAdId,
      "voices",
      mockVoiceVersionDraft
    );
    expect(voiceV2).toBe("v2");

    // Music stream should still be at v1
    const versions = await listVersions(mockAdId, "music");
    expect(versions).toEqual(["v1"]);
  });

  it("should append version to versions list in order", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    const versions = await listVersions(mockAdId, "voices");
    expect(versions).toEqual(["v1", "v2", "v3"]);
  });
});

describe("getVersion", () => {
  it("should retrieve existing version", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    const version = await getVersion(mockAdId, "voices", "v1");

    expect(version).toMatchObject(mockVoiceVersionDraft);
  });

  it("should return null for non-existent version", async () => {
    const version = await getVersion(mockAdId, "voices", "v999");

    expect(version).toBeNull();
  });

  it("should parse JSON data correctly", async () => {
    const testData = {
      ...mockVoiceVersionDraft,
      voiceTracks: [
        {
          ...mockVoiceVersionDraft.voiceTracks[0],
          text: "Custom test text",
        },
      ],
    };

    await createVersion(mockAdId, "voices", testData);

    const version = await getVersion(mockAdId, "voices", "v1");

    expect(version).toEqual(testData);
    expect(version?.voiceTracks[0].text).toBe("Custom test text");
  });
});

describe("listVersions", () => {
  it("should return empty array when no versions exist", async () => {
    const versions = await listVersions(mockAdId, "voices");

    expect(versions).toEqual([]);
  });

  it("should return all version IDs in creation order", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    const versions = await listVersions(mockAdId, "voices");

    expect(versions).toEqual(["v1", "v2", "v3"]);
  });
});

describe("getAllVersionsWithData", () => {
  it("should return empty object when no versions exist", async () => {
    const versions = await getAllVersionsWithData(mockAdId, "voices");

    expect(versions).toEqual({});
  });

  it("should return map of version IDs to data", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", {
      ...mockVoiceVersionDraft,
      createdBy: "llm",
    });

    const versions = await getAllVersionsWithData(mockAdId, "voices");

    expect(Object.keys(versions)).toEqual(["v1", "v2"]);
    expect(versions.v1.createdBy).toBe("user");
    expect(versions.v2.createdBy).toBe("llm");
  });
});

describe("getActiveVersion", () => {
  it("should return null when no active version set", async () => {
    const activeId = await getActiveVersion(mockAdId, "voices");

    expect(activeId).toBeNull();
  });

  it("should return active version ID", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await setActiveVersion(mockAdId, "voices", "v1");

    const activeId = await getActiveVersion(mockAdId, "voices");

    expect(activeId).toBe("v1");
  });
});

describe("setActiveVersion", () => {
  it("should set active version and update status", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    await setActiveVersion(mockAdId, "voices", "v1");

    // Check active pointer
    const activeId = await getActiveVersion(mockAdId, "voices");
    expect(activeId).toBe("v1");

    // Check version status updated
    const version = await getVersion(mockAdId, "voices", "v1");
    expect(version?.status).toBe("active");
  });

  it("should throw error when activating non-existent version", async () => {
    await expect(
      setActiveVersion(mockAdId, "voices", "v999")
    ).rejects.toThrow("Cannot activate non-existent version");
  });

  it("should allow switching active version", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    // Activate v1
    await setActiveVersion(mockAdId, "voices", "v1");
    expect(await getActiveVersion(mockAdId, "voices")).toBe("v1");

    // Switch to v2
    await setActiveVersion(mockAdId, "voices", "v2");
    expect(await getActiveVersion(mockAdId, "voices")).toBe("v2");
  });
});

describe("updateVersion", () => {
  it("should update version fields", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    await updateVersion(mockAdId, "voices", "v1", {
      generatedUrls: ["https://example.com/audio.mp3"],
    });

    const version = await getVersion(mockAdId, "voices", "v1");
    expect(version?.generatedUrls).toEqual(["https://example.com/audio.mp3"]);
  });

  it("should preserve other fields when updating", async () => {
    const originalData = {
      ...mockVoiceVersionDraft,
      createdBy: "llm" as const,
    };
    await createVersion(mockAdId, "voices", originalData);

    await updateVersion(mockAdId, "voices", "v1", {
      status: "active" as const,
    });

    const version = await getVersion(mockAdId, "voices", "v1");
    expect(version?.status).toBe("active");
    expect(version?.createdBy).toBe("llm"); // Preserved
  });

  it("should throw error when updating non-existent version", async () => {
    await expect(
      updateVersion(mockAdId, "voices", "v999", { status: "active" })
    ).rejects.toThrow("Version not found");
  });
});

describe("deleteVersion", () => {
  it("should delete non-active version", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    await deleteVersion(mockAdId, "voices", "v1");

    // Verify deleted
    const version = await getVersion(mockAdId, "voices", "v1");
    expect(version).toBeNull();

    // Verify removed from list
    const versions = await listVersions(mockAdId, "voices");
    expect(versions).toEqual(["v2"]);
  });

  it("should throw error when deleting active version", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await setActiveVersion(mockAdId, "voices", "v1");

    await expect(deleteVersion(mockAdId, "voices", "v1")).rejects.toThrow(
      "Cannot delete active version v1"
    );
  });

  it("should allow deleting version after switching active", async () => {
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);
    await createVersion(mockAdId, "voices", mockVoiceVersionDraft);

    // Activate v2
    await setActiveVersion(mockAdId, "voices", "v2");

    // Now v1 can be deleted
    await deleteVersion(mockAdId, "voices", "v1");

    const version = await getVersion(mockAdId, "voices", "v1");
    expect(version).toBeNull();
  });
});

describe("Ad Metadata", () => {
  const mockMetadata: AdMetadata = {
    name: "Test Ad",
    brief: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    owner: "test-session-123",
  };

  it("should save and retrieve ad metadata", async () => {
    await setAdMetadata(mockAdId, mockMetadata);

    const retrieved = await getAdMetadata(mockAdId);

    expect(retrieved).toEqual(mockMetadata);
  });

  it("should return null for non-existent ad", async () => {
    const metadata = await getAdMetadata("non-existent-ad");

    expect(metadata).toBeNull();
  });

  it("should overwrite existing metadata", async () => {
    await setAdMetadata(mockAdId, mockMetadata);

    const updated = { ...mockMetadata, name: "Updated Name" };
    await setAdMetadata(mockAdId, updated);

    const retrieved = await getAdMetadata(mockAdId);
    expect(retrieved?.name).toBe("Updated Name");
  });
});
