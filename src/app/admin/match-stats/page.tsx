"use client";

import {
  type Granularity,
  type MatchStats,
  type MatchStatsBucket,
} from "@/app/api/admin/match-stats/route";
import { GlassTab } from "@/components/ui/GlassTab";
import { GlassTabBar } from "@/components/ui/GlassTabBar";
import { Button } from "@/components/ui/buttons/Button";
import { useQuery } from "@/hooks/query";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { useMemo, useState } from "react";

// Friendly labels for the match dimensions (keys from MatchDimension).
const DIMENSION_LABELS: Record<string, string> = {
  duration: "Duration",
  wordCount: "Word count",
  language: "Language",
  format: "Campaign format",
  provider: "Voice provider",
  forbiddenWords: "Forbidden words",
  providedScript: "Provided script",
  cta: "Call to action",
  tone: "Tone / pacing",
  intent: "Brief intent",
  brand: "Brand mention",
};

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Day",
  month: "Month",
  year: "Year",
};

const SEVERITY_ORDER = ["high", "medium", "low"];

// ---- CSV helpers (local — statistics page's copies aren't exported) ----
function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvField).join(",")).join("\n");
}
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type StatRow = { key: string; label: string; count: number };

function StatBar({ item, max }: { item: StatRow; max: number }) {
  const percent = max > 0 ? (item.count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 shrink-0 truncate text-sm text-gray-300">
        {item.label}
      </div>
      <div className="h-2 flex-1 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-wb-blue"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <div className="w-12 shrink-0 text-right text-sm font-medium text-white">
        {item.count.toLocaleString()}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
  onDownload,
}: {
  title: string;
  items: StatRow[];
  onDownload?: () => void;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0);
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {onDownload && items.length > 0 && (
          <Button
            variant="outline"
            icon={ArrowDownTrayIcon}
            onClick={onDownload}
          >
            Download CSV
          </Button>
        )}
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((i) => (
            <StatBar key={i.key} item={i} max={max} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No data yet.</p>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

export default function MatchStatsPage() {
  const requestedAt = useMemo(() => new Date(), []);
  const { data, isLoading, error } = useQuery<MatchStats>(
    "/api/admin/match-stats",
  );
  const [granularity, setGranularity] = useState<Granularity>("month");

  const buckets: MatchStatsBucket[] = data?.byGranularity?.[granularity] ?? [];
  const totals = data?.totals;

  const dimItems: StatRow[] = totals
    ? Object.entries(totals.byDimension)
        .map(([key, count]) => ({
          key,
          label: DIMENSION_LABELS[key] ?? key,
          count,
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  const sevItems: StatRow[] = totals
    ? SEVERITY_ORDER.filter((s) => totals.bySeverity[s]).map((s) => ({
        key: s,
        label: s[0].toUpperCase() + s.slice(1),
        count: totals.bySeverity[s],
      }))
    : [];

  const impItems: StatRow[] = totals
    ? totals.topImprovements.map((i) => ({
        key: i.improvementId,
        label: i.improvementId,
        count: i.applied,
      }))
    : [];

  const stamp = format(requestedAt, "yyyy-MM-dd_HH-mm");

  const downloadTimeline = () => {
    downloadCsv(
      `${stamp}-match-stats-${granularity}.csv`,
      toCsv(
        [
          GRANULARITY_LABELS[granularity],
          "Mismatches",
          "Proposed",
          "Applied",
          "Applied (click)",
          "Applied (manual)",
        ],
        buckets.map((b) => [
          b.key,
          b.mismatches,
          b.proposed,
          b.applied,
          b.appliedClick,
          b.appliedManual,
        ]),
      ),
    );
  };

  const maxMismatch = buckets.reduce((m, b) => Math.max(m, b.mismatches), 0);

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <ClipboardDocumentCheckIcon className="h-8 w-8 text-wb-blue" />
          <div>
            <h1 className="text-3xl font-bold">Match Review Stats</h1>
            <p className="text-sm text-gray-400">
              How often generated ads didn&apos;t match the brief, and how many
              improvements were applied (AAC-255).
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400">
              {error.message ?? "Failed to load match stats"}
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {!isLoading && !error && data && totals && (
          <div className="space-y-8">
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryTile label="Mismatches" value={totals.mismatches} />
              <SummaryTile label="Proposed" value={totals.proposed} />
              <SummaryTile label="Applied" value={totals.applied} />
              <SummaryTile
                label="Applied · click"
                value={totals.appliedClick}
              />
              <SummaryTile
                label="Applied · manual"
                value={totals.appliedManual}
              />
            </div>

            {/* Breakdowns */}
            <div className="grid gap-6 lg:grid-cols-2">
              <BreakdownCard
                title="Mismatches by dimension"
                items={dimItems}
                onDownload={() =>
                  downloadCsv(
                    `${stamp}-match-stats-by-dimension.csv`,
                    toCsv(
                      ["Dimension", "Mismatches"],
                      dimItems.map((i) => [i.label, i.count]),
                    ),
                  )
                }
              />
              <BreakdownCard title="Mismatches by severity" items={sevItems} />
            </div>

            <BreakdownCard
              title="Top applied improvements"
              items={impItems}
              onDownload={() =>
                downloadCsv(
                  `${stamp}-match-stats-top-improvements.csv`,
                  toCsv(
                    ["Improvement", "Applied"],
                    impItems.map((i) => [i.label, i.count]),
                  ),
                )
              }
            />

            {/* Time series */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Over time</h2>
                <div className="flex items-center gap-3">
                  <GlassTabBar>
                    {(["day", "month", "year"] as Granularity[]).map((g) => (
                      <GlassTab
                        key={g}
                        isActive={granularity === g}
                        onClick={() => setGranularity(g)}
                      >
                        {GRANULARITY_LABELS[g]}
                      </GlassTab>
                    ))}
                  </GlassTabBar>
                  {buckets.length > 0 && (
                    <Button
                      variant="outline"
                      icon={ArrowDownTrayIcon}
                      onClick={downloadTimeline}
                    >
                      Download CSV
                    </Button>
                  )}
                </div>
              </div>

              {buckets.length > 0 ? (
                <div className="space-y-4">
                  {buckets.map((b) => (
                    <div key={b.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-200">
                          {b.key}
                        </span>
                        <span className="text-gray-400">
                          {b.mismatches} mismatch · {b.proposed} proposed ·{" "}
                          {b.applied} applied
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-wb-blue"
                          style={{
                            width: `${
                              maxMismatch > 0
                                ? Math.max(
                                    (b.mismatches / maxMismatch) * 100,
                                    2,
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  No match-review events recorded yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
