"use client";

import { Button, Card, LoadingSpinner } from "@/components/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";

/** Shape of `/api/admin/ads-leftovers` (GET = dry run, POST = removed). */
type Leftovers = {
  /** Ids in `ads:all` whose project is gone. */
  allIndex: string[];
  /** Per owner email, ids in `ads:by_user:{email}` whose project is gone. */
  userIndexes: Record<string, string[]>;
  /** Remaining `ad:{id}:*` keys of deleted projects. */
  strayKeys: string[];
};

/** Where the tool is in its lifecycle. */
type Phase = "loading" | "ready" | "purging" | "done" | "error";

/** How many things a leftovers report holds, per category. */
function totals(leftovers: Leftovers) {
  return {
    allIndex: leftovers.allIndex.length,
    userIndexes: Object.values(leftovers.userIndexes).flat().length,
    strayKeys: leftovers.strayKeys.length,
  };
}

/** The dry run: what deleted projects left behind. */
async function fetchLeftovers(signal: AbortSignal): Promise<Leftovers> {
  const response = await fetch("/api/admin/ads-leftovers", { signal });
  if (!response.ok) {
    throw new Error(`Failed to scan (${response.status})`);
  }
  return response.json();
}

/** Every deleted project id the report mentions. */
function projectIds(leftovers: Leftovers): string[] {
  const ids = new Set([
    ...leftovers.allIndex,
    ...Object.values(leftovers.userIndexes).flat(),
    ...leftovers.strayKeys.map((key) => key.split(":")[1]),
  ]);
  return [...ids].sort();
}

/**
 * Admin tool for the leftovers of deleted projects
 * (`/api/admin/ads-leftovers`), on the Fixes page.
 *
 * On mount it runs the dry run and lists what deleted projects left behind:
 * their ids in the `ads:all` and `ads:by_user:*` indexes and their remaining
 * keys. A button, behind a confirm, removes it.
 */
export function AdsLeftoversFix() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [report, setReport] = useState<Leftovers | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The scan walks every key, so a new one aborts the previous (StrictMode's
  // double mount, a quick re-scan).
  const scanRef = useRef<AbortController | null>(null);

  // Starts a dry run, aborting any previous one; state is only set in its
  // callbacks.
  const scan = useCallback(() => {
    scanRef.current?.abort();
    const controller = new AbortController();
    scanRef.current = controller;

    fetchLeftovers(controller.signal).then(
      (leftovers) => {
        setReport(leftovers);
        setPhase("ready");
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;

        setError(err instanceof Error ? err.message : "Failed to scan");
        setPhase("error");
      },
    );
  }, []);

  useEffect(() => {
    scan();

    return () => scanRef.current?.abort();
  }, [scan]);

  const rescan = useCallback(() => {
    setPhase("loading");
    setError(null);
    scan();
  }, [scan]);

  const purge = useCallback(async () => {
    if (!window.confirm("Remove every leftover of deleted projects?")) return;

    setPhase("purging");
    setError(null);

    try {
      const response = await fetch("/api/admin/ads-leftovers", {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to purge (${response.status})`);
      }

      setReport(await response.json());
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to purge");
      setPhase("error");
    }
  }, []);

  const counts = report ? totals(report) : null;
  const ids = report ? projectIds(report) : [];

  return (
    <section className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">
          Leftovers of Deleted Projects
        </h1>
        <p className="text-wb-gray">
          Remove what deleted projects left behind.
        </p>
      </header>

      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-lg font-semibold">What this does</h2>
        <p className="mb-3 text-sm text-wb-white-gray">
          Deleting a project used to keep its id in the project indexes (
          <code>ads:all</code> and each owner&apos;s <code>ads:by_user</code>
          ), along with some of its data. Every dashboard load then fetched
          and skipped those ids, so it got slower over time.
        </p>
        <p className="text-sm text-wb-white-gray">
          The list below comes from a dry run that changes nothing. Purging
          removes those index entries and the remaining keys. Audio files in
          storage are kept.
        </p>
      </Card>

      {phase === "loading" && (
        <Card className="flex items-center justify-center gap-3 p-10 text-wb-gray">
          <LoadingSpinner size="md" />
          <span>Scanning…</span>
        </Card>
      )}

      {phase === "purging" && (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-wb-gray">
          <LoadingSpinner size="lg" />
          <span>Purging {ids.length} deleted projects…</span>
        </Card>
      )}

      {phase === "error" && (
        <Card className="flex flex-col items-start gap-4 border-wb-red p-6">
          <div className="flex items-center gap-2 text-wb-red">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <Button variant="outline" onClick={rescan}>
            Retry
          </Button>
        </Card>
      )}

      {(phase === "ready" || phase === "done") && counts && (
        <Card className="flex flex-col gap-6 p-6">
          {phase === "done" && (
            <div className="flex items-center gap-2 text-wb-green">
              <CheckCircleIcon className="h-6 w-6 shrink-0" />
              <span className="text-lg font-semibold">Removed:</span>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-wb-gray">In ads:all</dt>
            <dd>{counts.allIndex}</dd>
            <dt className="text-wb-gray">In ads:by_user indexes</dt>
            <dd>{counts.userIndexes}</dd>
            <dt className="text-wb-gray">Remaining keys</dt>
            <dd>{counts.strayKeys}</dd>
          </dl>

          {ids.length > 0 && (
            <details className="text-sm text-wb-white-gray">
              <summary className="cursor-pointer">
                {ids.length} deleted projects
              </summary>
              <p className="mt-2 wrap-break-word font-mono text-xs">
                {ids.join(", ")}
              </p>
            </details>
          )}

          {phase === "ready" &&
            (ids.length > 0 ? (
              <Button icon={TrashIcon} onClick={purge}>
                Purge {ids.length} deleted projects
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-wb-green">
                <CheckCircleIcon className="h-5 w-5 shrink-0" />
                <span>Nothing left behind.</span>
              </div>
            ))}

          {phase === "done" && (
            <Button variant="outline" onClick={rescan}>
              Re-scan
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}
