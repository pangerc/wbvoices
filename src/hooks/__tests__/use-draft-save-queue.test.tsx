// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDraftSaveQueue } from "../use-draft-save-queue";

/** A promise plus the handles to settle it from the test. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useDraftSaveQueue", () => {
  it("sends writes in call order even when the first is slow", async () => {
    const { result } = renderHook(() =>
      useDraftSaveQueue(() => Promise.resolve()),
    );
    const order: string[] = [];
    const first = deferred();

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => {
      a = result.current.save(async () => {
        order.push("a:start");
        await first.promise;
        order.push("a:end");
      });
      b = result.current.save(async () => {
        order.push("b:start");
      });
    });

    await Promise.resolve();
    expect(order).toEqual(["a:start"]);

    first.resolve();
    await act(() => Promise.all([a, b]));
    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("reports saving from the call until the refetch settles, across overlapping saves", async () => {
    const refetches = [deferred(), deferred()];
    let call = 0;
    const onSaved = vi.fn(() => refetches[call++].promise);
    const { result } = renderHook(() => useDraftSaveQueue(onSaved));

    expect(result.current.isSaving()).toBe(false);

    let a!: Promise<unknown>;
    let b!: Promise<unknown>;
    act(() => {
      a = result.current.save(() => Promise.resolve("a"));
      b = result.current.save(() => Promise.resolve("b"));
    });
    // Synchronously after the call — before the write even starts.
    expect(result.current.isSaving()).toBe(true);

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    refetches[0].resolve();
    await a;
    expect(result.current.isSaving()).toBe(true);

    expect(result.current.saving).toBe(true);

    refetches[1].resolve();
    await act(() => expect(b).resolves.toBe("b"));
    expect(result.current.isSaving()).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("releases the guard and keeps the queue moving after a failed write", async () => {
    const onSaved = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useDraftSaveQueue(onSaved));

    const failed = result.current.save(() => Promise.reject(new Error("boom")));
    const next = result.current.save(() => Promise.resolve("ok"));

    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(result.current.isSaving()).toBe(false);
    // Only the successful write refetches.
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("flushes at once when nothing is queued", async () => {
    const { result } = renderHook(() =>
      useDraftSaveQueue(() => Promise.resolve()),
    );

    await expect(result.current.flush()).resolves.toBeUndefined();
  });

  it("flushes only after every write and its refetch, including saves queued while waiting", async () => {
    const write = deferred();
    const refetch = deferred();
    const late = deferred();
    const onSaved = vi
      .fn()
      .mockReturnValueOnce(refetch.promise)
      .mockReturnValue(Promise.resolve());
    const { result } = renderHook(() => useDraftSaveQueue(onSaved));
    let flushed = false;

    act(() => {
      void result.current.save(() => write.promise);
    });
    const flush = result.current.flush().then(() => {
      flushed = true;
    });

    write.resolve();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    act(() => {
      void result.current.save(() => late.promise);
    });
    refetch.resolve();
    await Promise.resolve();

    expect(flushed).toBe(false);

    late.resolve();
    await act(() => flush);

    expect(flushed).toBe(true);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("flushes after a failed write too", async () => {
    const { result } = renderHook(() =>
      useDraftSaveQueue(() => Promise.resolve()),
    );

    const failed = result.current.save(() => Promise.reject(new Error("boom")));

    await expect(failed).rejects.toThrow("boom");
    await expect(result.current.flush()).resolves.toBeUndefined();
  });
});
