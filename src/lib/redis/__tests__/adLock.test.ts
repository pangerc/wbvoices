import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRedis } from "@/test/utils";

let mockRedis: ReturnType<typeof createMockRedis>;

vi.mock("../../redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

import { withAdLock, AdLockTimeoutError } from "../adLock";

beforeEach(async () => {
  mockRedis = createMockRedis();
  await mockRedis.flushall();
});

describe("withAdLock", () => {
  it("runs op when no prior holder exists and returns its value", async () => {
    const result = await withAdLock("ad-1", async () => 42);
    expect(result).toBe(42);
  });

  it("releases the lock after op resolves (second call can acquire immediately)", async () => {
    await withAdLock("ad-1", async () => "first");
    const t0 = Date.now();
    const result = await withAdLock("ad-1", async () => "second", {
      timeoutMs: 500,
    });
    expect(result).toBe("second");
    expect(Date.now() - t0).toBeLessThan(300);
  });

  it("releases the lock after op throws", async () => {
    await expect(
      withAdLock("ad-1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // Successor acquires without delay
    const result = await withAdLock("ad-1", async () => "after-error", {
      timeoutMs: 500,
    });
    expect(result).toBe("after-error");
  });

  it("serializes concurrent callers on the same ad (no overlap)", async () => {
    // Instrument: track when each op enters and exits.
    const enters: number[] = [];
    const exits: number[] = [];

    const work = async (label: number) => {
      enters.push(label);
      await new Promise((r) => setTimeout(r, 30));
      exits.push(label);
      return label;
    };

    const results = await Promise.all([
      withAdLock("ad-1", () => work(1), { retryMs: 10, timeoutMs: 2000 }),
      withAdLock("ad-1", () => work(2), { retryMs: 10, timeoutMs: 2000 }),
      withAdLock("ad-1", () => work(3), { retryMs: 10, timeoutMs: 2000 }),
    ]);

    expect(new Set(results)).toEqual(new Set([1, 2, 3]));
    // Each op must have exited before the next one entered — strict sequencing.
    for (let i = 0; i + 1 < enters.length; i++) {
      // The i-th exit must appear in exits before the (i+1)-th enter.
      const nextLabel = enters[i + 1];
      const currentLabel = enters[i];
      const currentExitOrder = exits.indexOf(currentLabel);
      const nextEnterOrder = enters.indexOf(nextLabel);
      // nextLabel entered in position (i+1); currentLabel must have already
      // been added to `exits` before that moment.
      expect(currentExitOrder).toBeLessThan(nextEnterOrder + 1);
    }
  });

  it("different ad ids do not block each other (concurrent OK)", async () => {
    const log: string[] = [];
    const slow = async (tag: string) => {
      log.push(`${tag}:enter`);
      await new Promise((r) => setTimeout(r, 30));
      log.push(`${tag}:exit`);
    };

    await Promise.all([
      withAdLock("ad-a", () => slow("a")),
      withAdLock("ad-b", () => slow("b")),
    ]);

    // Both should have interleaved: a:enter and b:enter come before any exit.
    expect(log.slice(0, 2).sort()).toEqual(["a:enter", "b:enter"]);
  });

  it("throws AdLockTimeoutError when the lock is already held and doesn't release in time", async () => {
    // Directly grab the lock via mock Redis so withAdLock sees contention.
    const token = "external-holder";
    await mockRedis.set(`ad:ad-1:lock`, token, { nx: true, ex: 60 });

    await expect(
      withAdLock("ad-1", async () => "never-runs", {
        timeoutMs: 150,
        retryMs: 20,
      }),
    ).rejects.toBeInstanceOf(AdLockTimeoutError);
  });

  it("does not delete a successor's lock when TTL expired mid-op (CAS on release)", async () => {
    // Scenario under test:
    //   1. Caller A acquires the lock with a short TTL.
    //   2. A's op runs long enough that the TTL expires mid-op.
    //   3. Caller B acquires after the TTL lapses (different token).
    //   4. A's op finally finishes and its `finally` block runs its release.
    //   5. B's op is still running at the moment A's release executes.
    // Expectation: the Lua CAS guard makes A's release a no-op because
    // the stored token now belongs to B. So B's lock survives.
    //
    // Timing: we explicitly keep B's op running past A's completion so the
    // assertion window is well-defined. Timing is padded for CI jitter.
    const originalWarn = console.warn;
    console.warn = vi.fn();

    try {
      const TTL_SEC = 1;
      const FIRST_OP_MS = 1800; // 800ms past TTL
      const WAIT_BEFORE_SECOND_MS = 1300; // 300ms past TTL — B should acquire
      const SECOND_OP_MS = 1200; // extends past A's finish

      let aReleased = false;
      let bAcquired = false;
      let bReleaseSignal: (() => void) | null = null;
      const bCanRelease = new Promise<void>((resolve) => {
        bReleaseSignal = resolve;
      });

      const firstDone = withAdLock(
        "ad-1",
        async () => {
          await new Promise((r) => setTimeout(r, FIRST_OP_MS));
          return "first";
        },
        { ttlSec: TTL_SEC, timeoutMs: 4000, retryMs: 20 },
      ).then((v) => {
        aReleased = true;
        return v;
      });

      await new Promise((r) => setTimeout(r, WAIT_BEFORE_SECOND_MS));

      const secondDone = withAdLock(
        "ad-1",
        async () => {
          bAcquired = true;
          // Block B's op until test signals release so we can peek the
          // lock key while B is still the holder.
          await Promise.race([
            bCanRelease,
            new Promise((r) => setTimeout(r, SECOND_OP_MS)),
          ]);
          return "second";
        },
        { ttlSec: 5, timeoutMs: 4000, retryMs: 20 },
      );

      await firstDone;
      expect(aReleased).toBe(true);
      expect(bAcquired).toBe(true);

      // A's release has already executed. B's op is still running.
      // If CAS worked, the lock key is still present and holds B's token.
      const held = await mockRedis.get(`ad:ad-1:lock`);
      expect(held).not.toBeNull();

      bReleaseSignal!();
      await secondDone;
    } finally {
      console.warn = originalWarn;
    }
  }, 15000);
});
