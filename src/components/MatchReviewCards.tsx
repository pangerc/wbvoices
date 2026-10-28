"use client";

/**
 * AI Match-Review cards (AAC-255) — presentational.
 *
 * Renders the deterministic + critic `MatchFinding[]` produced after generation:
 * one card per dimension that didn't match the brief, each with its improvement
 * options. All data access (chat turn, brief patch, apply-logging, SWR
 * revalidation) lives on the ad page via `onApply`; this component only renders
 * and reports clicks.
 *
 * The whole panel can be collapsed (Hide / Show solutions) — findings stay in
 * state, only their display is toggled. The "Regenerate" action renders only
 * when the server includes it (admin toggle `matchReviewRegenerateEnabled`);
 * otherwise just the minimal "Apply" shows.
 */

import type { Improvement, MatchFinding } from "@/lib/match-review";
import { useState } from "react";

export type ApplyVariant = "apply" | "regenerate";

type Props = {
  findings: MatchFinding[];
  /**
   * Fire an improvement action + log it. `variant` picks the minimal edit
   * (`apply`) or the full rewrite (`regenerate`).
   */
  onApply: (
    finding: MatchFinding,
    improvement: Improvement,
    variant: ApplyVariant,
  ) => Promise<void>;
};

const SEVERITY: Record<
  MatchFinding["severity"],
  { label: string; cls: string }
> = {
  high: { label: "High", cls: "bg-red-500/20 text-red-200 border-red-500/40" },
  medium: {
    label: "Medium",
    cls: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  },
  low: { label: "Low", cls: "bg-sky-500/20 text-sky-200 border-sky-500/40" },
};

// Opaque, blurred shell so the text never competes with the animated
// background dots behind the workspace (AAC-255 feedback).
const SHELL =
  "relative z-10 mb-6 rounded-lg border border-white/15 bg-neutral-900/90 p-4 shadow-xl backdrop-blur-md";

export function MatchReviewCards({ findings, onApply }: Props) {
  // Key of the improvement currently applying, so only its button spins.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Collapse the panel without discarding the findings (Hide / Show solutions).
  const [hidden, setHidden] = useState(false);

  if (!findings.length) return null;

  const count = findings.length;
  const noun = count === 1 ? "thing" : "things";

  if (hidden) {
    return (
      <div className={SHELL}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90">
            Match review — {count} {noun} to check
          </h3>
          <button
            onClick={() => setHidden(false)}
            className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
          >
            Show solutions
          </button>
        </div>
      </div>
    );
  }

  const handleClick = async (
    finding: MatchFinding,
    imp: Improvement,
    variant: ApplyVariant,
  ) => {
    const key = `${finding.dimension}:${imp.id}:${variant}`;
    setBusyKey(key);
    try {
      await onApply(finding, imp, variant);
    } finally {
      setBusyKey((k) => (k === key ? null : k));
    }
  };

  return (
    <div className={SHELL}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">
          Match review — {count} {noun} to check
        </h3>
        <button
          onClick={() => setHidden(true)}
          className="text-xs text-white/50 hover:text-white/80"
        >
          Hide
        </button>
      </div>
      <p className="mb-3 text-xs text-white/40">
        Suggestions for this result only — they disappear on refresh and
        aren&apos;t saved for later review.
      </p>

      <div className="space-y-3">
        {findings.map((finding) => {
          const sev = SEVERITY[finding.severity];
          return (
            <div
              key={finding.dimension}
              className="rounded-md border border-white/10 bg-black/40 p-3"
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${sev.cls}`}
                >
                  {sev.label}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                  {finding.dimension}
                </span>
              </div>

              <p className="text-sm text-white/80">{finding.explanation}</p>

              {(finding.expected || finding.actual) && (
                <p className="mt-1 text-xs text-white/50">
                  {finding.expected && (
                    <>
                      Expected:{" "}
                      <span className="text-white/70">{finding.expected}</span>
                    </>
                  )}
                  {finding.expected && finding.actual && " · "}
                  {finding.actual && (
                    <>
                      Got:{" "}
                      <span className="text-white/70">{finding.actual}</span>
                    </>
                  )}
                </p>
              )}

              <div className="mt-2 space-y-2">
                {finding.improvements.map((imp) => {
                  const applyKey = `${finding.dimension}:${imp.id}:apply`;
                  const regenKey = `${finding.dimension}:${imp.id}:regenerate`;
                  return (
                    <div
                      key={imp.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white/80">{imp.title}</p>
                        {imp.rationale && (
                          <p className="text-xs text-white/45">
                            {imp.rationale}
                          </p>
                        )}
                      </div>
                      {imp.apply || imp.regenerate ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {imp.apply && (
                            <button
                              onClick={() =>
                                void handleClick(finding, imp, "apply")
                              }
                              disabled={!!busyKey}
                              title="Minimal edit — keeps your script, changes only this"
                              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40"
                            >
                              {busyKey === applyKey ? "Applying…" : "Apply"}
                            </button>
                          )}
                          {imp.regenerate && (
                            <button
                              onClick={() =>
                                void handleClick(finding, imp, "regenerate")
                              }
                              disabled={!!busyKey}
                              title="Full rewrite of the script for this fix"
                              className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
                            >
                              {busyKey === regenKey
                                ? "Regenerating…"
                                : "Regenerate"}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="shrink-0 self-center text-xs text-white/35">
                          Manual
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
