import {
  mockMusicVersionDraft,
  mockVoiceVersionDraft,
} from "@/test/fixtures/versions";
import { createMockRedis } from "@/test/utils";
import type { AdMetadata } from "@/types/versions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AD_KEYS,
  ADS_INDEX_KEYS,
  createVersion,
  deleteAd,
  readAdIndex,
  setActiveVersion,
  setAdMetadata,
} from "../versions";

vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

let mockRedis: ReturnType<typeof createMockRedis>;

const OWNER = "Owner@Example.com";

/** Appends `adId` to one JSON-array index, as ad creation does. */
async function index(key: string, adId: string): Promise<void> {
  const ids = await readAdIndex(key);

  await mockRedis.set(key, JSON.stringify([...ids, adId]));
}

/** An ad owned by `owner`, with versions, a conversation and both locks. */
async function seedAd(adId: string, owner: string): Promise<void> {
  await setAdMetadata(adId, {
    name: adId,
    owner,
    createdAt: 0,
    lastModified: 0,
  } as AdMetadata);
  await createVersion(adId, "voices", mockVoiceVersionDraft);
  await setActiveVersion(adId, "voices", "v1");
  await createVersion(adId, "music", mockMusicVersionDraft);
  await mockRedis.set(AD_KEYS.conversation(adId), "[]");
  await mockRedis.set(AD_KEYS.lock(adId), "token");
  await mockRedis.set(AD_KEYS.generatingLock(adId), "token");
  await index(ADS_INDEX_KEYS.all, adId);
  await index(ADS_INDEX_KEYS.byUser(owner), adId);
}

/** Every key `seedAd` writes for `adId`. */
function keysOf(adId: string): string[] {
  return [
    AD_KEYS.meta(adId),
    AD_KEYS.conversation(adId),
    AD_KEYS.lock(adId),
    AD_KEYS.generatingLock(adId),
    AD_KEYS.versions(adId, "voices"),
    AD_KEYS.active(adId, "voices"),
    AD_KEYS.counter(adId, "voices"),
    AD_KEYS.version(adId, "voices", "v1"),
    AD_KEYS.versions(adId, "music"),
    AD_KEYS.counter(adId, "music"),
    AD_KEYS.version(adId, "music", "v1"),
  ];
}

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
});

describe("deleteAd", () => {
  it("deletes every key of the ad and takes it out of both indexes", async () => {
    await seedAd("gone-ad-001", OWNER);

    await deleteAd("gone-ad-001");

    expect(await mockRedis.exists(...keysOf("gone-ad-001"))).toBe(0);
    expect(await readAdIndex(ADS_INDEX_KEYS.all)).toEqual([]);
    expect(await readAdIndex(ADS_INDEX_KEYS.byUser(OWNER))).toEqual([]);
  });

  it("clears the owner's lowercased index too, as a backup import writes it", async () => {
    await seedAd("gone-ad-002", OWNER);
    await index(ADS_INDEX_KEYS.byUser(OWNER.toLowerCase()), "gone-ad-002");

    await deleteAd("gone-ad-002");

    expect(
      await readAdIndex(ADS_INDEX_KEYS.byUser(OWNER.toLowerCase())),
    ).toEqual([]);
  });

  it("leaves other ads untouched", async () => {
    await seedAd("gone-ad-003", OWNER);
    await seedAd("kept-ad-004", OWNER);

    await deleteAd("gone-ad-003");

    expect(await mockRedis.exists(...keysOf("kept-ad-004"))).toBe(
      keysOf("kept-ad-004").length,
    );
    expect(await readAdIndex(ADS_INDEX_KEYS.all)).toEqual(["kept-ad-004"]);
    expect(await readAdIndex(ADS_INDEX_KEYS.byUser(OWNER))).toEqual([
      "kept-ad-004",
    ]);
  });
});
