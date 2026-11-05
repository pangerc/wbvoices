// @vitest-environment jsdom

import { server } from "@/test/mocks/server";
import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useSendToMixer } from "../use-send-to-mixer";

const AD = "ad-1";
const FREEZE = `*/api/ads/${AD}/sfx/v2/freeze`;

/** A promise plus the handle to settle it from the test. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

function renderSend(options: {
  flush?: () => Promise<void>;
  onUpdate?: () => unknown;
}) {
  const { result } = renderHook(() =>
    useSendToMixer({
      adId: AD,
      stream: "sfx",
      versionId: "v2",
      onUpdate: options.onUpdate ?? (() => undefined),
      flush: options.flush,
    }),
  );
  return result.current;
}

describe("useSendToMixer", () => {
  it("freezes only after the queued saves have flushed", async () => {
    const saves = deferred();
    const freeze = vi.fn(() =>
      HttpResponse.json({ active: "v2", mixer: { tracks: [] } }),
    );
    server.use(http.post(FREEZE, freeze));

    const send = renderSend({ flush: () => saves.promise });
    const sent = send();
    // Long enough for an un-gated request to reach the handler.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(freeze).not.toHaveBeenCalled();

    saves.resolve();

    await expect(sent).resolves.toBe(true);
    expect(freeze).toHaveBeenCalledTimes(1);
  });

  it("resolves false and skips the refetch when the freeze fails", async () => {
    const onUpdate = vi.fn();
    server.use(
      http.post(FREEZE, () =>
        HttpResponse.json({ error: "nope" }, { status: 500 }),
      ),
    );

    const send = renderSend({ onUpdate });

    await expect(send()).resolves.toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
