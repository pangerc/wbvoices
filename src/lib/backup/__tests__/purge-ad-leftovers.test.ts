import { createMockRedis } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

vi.mock("@/lib/db", () => ({ db: {} }));

const { purgeAdLeftovers } = await import("../importers");
const { readAdIndex } = await import("@/lib/redis/versions");

let mockRedis: ReturnType<typeof createMockRedis>;

/**
 * A live ad (meta, a version, both indexes) and two deleted ones:
 * - gone-a: still in ads:all and its owner's index, with a stray version key;
 * - gone-b: only in another user's index, with a conversation and a lock.
 */
async function seed(): Promise<void> {
  await mockRedis.set("ad:live-1:meta", JSON.stringify({ owner: "u1@x.com" }));
  await mockRedis.set("ad:live-1:voices:v:v1", "{}");
  await mockRedis.set("ads:all", JSON.stringify(["live-1", "gone-a"]));
  await mockRedis.set(
    "ads:by_user:u1@x.com",
    JSON.stringify(["live-1", "gone-a"]),
  );
  await mockRedis.set("ads:by_user:u2@x.com", JSON.stringify(["gone-b"]));
  await mockRedis.set("ad:gone-a:voices:v:v1", "{}");
  await mockRedis.set("ad:gone-b:conversation", "[]");
  await mockRedis.set("ad:gone-b:lock", "token");
}

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
  await seed();
});

describe("purgeAdLeftovers", () => {
  it("finds what deleted ads left behind, and a dry run changes nothing", async () => {
    const found = await purgeAdLeftovers({ dryRun: true });

    expect(found.allIndex).toEqual(["gone-a"]);
    expect(found.userIndexes).toEqual({
      "u1@x.com": ["gone-a"],
      "u2@x.com": ["gone-b"],
    });
    expect(found.strayKeys.sort()).toEqual([
      "ad:gone-a:voices:v:v1",
      "ad:gone-b:conversation",
    ]);

    expect(await readAdIndex("ads:all")).toEqual(["live-1", "gone-a"]);
    expect(await mockRedis.exists("ad:gone-a:voices:v:v1")).toBe(1);
  });

  it("removes them from ads:all, every ads:by_user index and the keys", async () => {
    await purgeAdLeftovers({ dryRun: false });

    expect(await readAdIndex("ads:all")).toEqual(["live-1"]);
    expect(await readAdIndex("ads:by_user:u1@x.com")).toEqual(["live-1"]);
    expect(await readAdIndex("ads:by_user:u2@x.com")).toEqual([]);
    expect(
      await mockRedis.exists("ad:gone-a:voices:v:v1", "ad:gone-b:conversation"),
    ).toBe(0);
  });

  it("leaves live ads and lock keys alone", async () => {
    await purgeAdLeftovers({ dryRun: false });

    expect(
      await mockRedis.exists("ad:live-1:meta", "ad:live-1:voices:v:v1"),
    ).toBe(2);
    expect(await mockRedis.exists("ad:gone-b:lock")).toBe(1);
  });
});
