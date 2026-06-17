"use client";

import { Button, Card, LoadingSpinner } from "@/components/ui";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";

/** Shape of `GET /api/ads/fix`: how many ads have stale foreign-id references. */
type CountResponse = {
  shouldFix: number;
};

/** Shape of `POST /api/ads/fix`: how many ads were actually repaired. */
type FixResponse = {
  fixed: number;
};

/** Where the admin tool is in its lifecycle. */
type Phase = "loading" | "ready" | "fixing" | "done" | "error";

/**
 * Admin tool for the conversation ad-id backfill (`/api/ads/fix`).
 *
 * On mount it runs the dry-run (`GET`) to count how many ads still reference
 * another ad's id, explains why that happens, and offers a button that runs
 * the repair (`POST`) behind a loading screen.
 *
 * Rendered client-side only (see the route's `dynamic(..., { ssr: false })`)
 * because it is a stateful, interactive operations console with no SEO value.
 */
export function AdsFixAdmin() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [problematic, setProblematic] = useState(0);
  const [fixed, setFixed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Tracks the in-flight count request. The scan is expensive (it walks every
  // ad's conversation), so before starting a new one we abort any previous —
  // this collapses StrictMode's double-mount and rapid re-scans into a single
  // live request.
  const countControllerRef = useRef<AbortController | null>(null);

  const loadCount = useCallback(async () => {
    countControllerRef.current?.abort();
    const controller = new AbortController();
    countControllerRef.current = controller;

    setPhase("loading");
    setError(null);

    try {
      const response = await fetch("/api/ads/fix", {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load count (${response.status})`);
      }

      const data: CountResponse = await response.json();

      setProblematic(data.shouldFix);
      setPhase("ready");
    } catch (err) {
      // A superseded/unmounted request is expected — leave the UI as-is.
      if (controller.signal.aborted) {
        return;
      }

      setError(err instanceof Error ? err.message : "Failed to load count");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    loadCount();

    return () => countControllerRef.current?.abort();
  }, [loadCount]);

  const handleFix = useCallback(async () => {
    setPhase("fixing");
    setError(null);

    try {
      const response = await fetch("/api/ads/fix", { method: "POST" });

      if (!response.ok) {
        throw new Error(`Failed to fix ads (${response.status})`);
      }

      const data: FixResponse = await response.json();

      setFixed(data.fixed);
      setProblematic(0);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fix ads");
      setPhase("error");
    }
  }, []);

  return (
    <div className="min-h-screen bg-wb-almost-black p-8 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Fix Ad Conversations</h1>
          <p className="text-wb-gray">
            Repair conversations whose history still references another
            ad&apos;s id.
          </p>
        </header>

        {/* What & why — context for whoever runs this. */}
        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-lg font-semibold">What this does</h2>
          <p className="mb-3 text-sm text-wb-white-gray">
            When an ad is duplicated, its conversation history is copied too.
            The duplication flow historically failed to remap the embedded ad
            ids, so a copied conversation kept pointing at the{" "}
            <span className="font-medium text-white">source</span> ad — both in
            free-text message bodies and inside tool-call arguments.
          </p>
          <p className="mb-3 text-sm text-wb-white-gray">
            This tool scans every ad&apos;s conversation and rewrites any
            foreign ad id to the ad&apos;s own id. The count below comes from a
            dry run that changes nothing; the fix is only applied when you press
            the button.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-wb-blue/40 bg-wb-blue/10 p-3">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-wb-blue" />
            <p className="text-sm text-wb-white-gray">
              Note: this also corrects cases where, within a conversation, the
              AI changed a different ad. These references are still broken — but
              broken because the current integration lets the AI modify any ad
              it wants, not because of duplication. They&apos;re remapped to
              this ad too.
            </p>
          </div>
        </Card>

        {phase === "loading" && (
          <Card className="flex items-center justify-center gap-3 p-10 text-wb-gray">
            <LoadingSpinner size="md" />
            <span>Scanning conversations…</span>
          </Card>
        )}

        {phase === "fixing" && (
          <Card className="flex flex-col items-center justify-center gap-3 p-10 text-wb-gray">
            <LoadingSpinner size="lg" />
            <span>Fixing {problematic} ads… this may take a moment.</span>
          </Card>
        )}

        {phase === "error" && (
          <Card className="flex flex-col items-start gap-4 border-wb-red p-6">
            <div className="flex items-center gap-2 text-wb-red">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
            <Button variant="outline" onClick={loadCount}>
              Retry
            </Button>
          </Card>
        )}

        {phase === "ready" && (
          <Card className="flex flex-col items-center gap-6 p-10">
            <div className="text-center">
              <div className="text-6xl font-bold">{problematic}</div>
              <div className="mt-1 text-wb-gray">
                {problematic === 1 ? "ad needs fixing" : "ads need fixing"}
              </div>
            </div>

            {problematic > 0 ? (
              <Button icon={WrenchScrewdriverIcon} onClick={handleFix}>
                Fix {problematic} ads
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-wb-green">
                <CheckCircleIcon className="h-5 w-5 shrink-0" />
                <span>Everything looks clean.</span>
              </div>
            )}
          </Card>
        )}

        {phase === "done" && (
          <Card className="flex flex-col items-center gap-4 p-10">
            <div className="flex items-center gap-2 text-wb-green">
              <CheckCircleIcon className="h-6 w-6 shrink-0" />
              <span className="text-lg font-semibold">
                Fixed {fixed} {fixed === 1 ? "ad" : "ads"}.
              </span>
            </div>
            <Button variant="outline" onClick={loadCount}>
              Re-scan
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
