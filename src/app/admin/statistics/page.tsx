"use client";

import { type Statistics } from "@/app/api/ads/statistics/route";
import { Button } from "@/components/ui/buttons/Button";
import { useMarkets } from "@/hooks/market";
import { useQuery } from "@/hooks/query";
import { getLanguageName, regionDisplayNames } from "@/utils/language";
import { ArrowDownTrayIcon, ChartBarIcon } from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { useMemo } from "react";

/** A single breakdown row, ready for display and CSV export. */
type StatItem = {
  /** Raw key as returned by the endpoint, e.g. a market code "GB". */
  key: string;
  /** Friendly display label, e.g. "United Kingdom" (falls back to `key`). */
  label: string;
  /** Number of ads for this key. */
  count: number;
};

/** Resolves a dimension's raw key into a friendly display label. */
type LabelResolver = (key: string) => string;

/** Escape a single CSV field, quoting it when it contains delimiters. */
function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Build a CSV document from a header row and data rows. */
function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\n");
}

/** Trigger a client-side download of `content` as a file named `filename`. */
function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

/** "byMarket" → "Market", "byVoiceProvider" → "Voice Provider". */
function dimensionNoun(dimension: string): string {
  const stripped = dimension.replace(/^by/, "");
  return stripped.replace(/([A-Z])/g, " $1").trim() || stripped;
}

/**
 * "byMarket" → "2026-06-19_14-30-statistics-market.csv", stamped with the ISO
 * date and time the statistics request was made.
 */
function csvFilename(dimension: string, requestedAt: Date): string {
  const stamp = format(requestedAt, "yyyy-MM-dd_HH-mm");
  const noun = dimensionNoun(dimension).toLowerCase().replace(/\s+/g, "-");
  return `${stamp}-statistics-${noun}.csv`;
}

/** Props for {@link StatBar}. */
type StatBarProps = {
  /** Row to render. */
  item: StatItem;
  /** Highest count across the breakdown, used to scale the bar width. */
  max: number;
};

/**
 * A single row in a breakdown: display label (with its raw key as a secondary
 * label when they differ), a proportional bar and the absolute count.
 */
function StatBar({ item, max }: StatBarProps) {
  const percent = max > 0 ? (item.count / max) * 100 : 0;

  return (
    <div className="flex items-center gap-4">
      <div className="w-40 shrink-0 truncate text-sm text-gray-300">
        {item.label}
        {item.label !== item.key && (
          <span className="ml-1 text-gray-500">({item.key})</span>
        )}
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

/** Props for {@link BreakdownSection}. */
type BreakdownSectionProps = {
  /** Dimension key from the endpoint, e.g. "byMarket". */
  dimension: string;
  /** Sorted rows for this dimension. */
  items: StatItem[];
  /** When the statistics request was made; stamped into the CSV filename. */
  requestedAt: Date;
};

/**
 * One self-contained breakdown: a titled card with a per-row bar chart and its
 * own CSV download button. Rendered once per `byX` dimension in the response.
 */
function BreakdownSection({
  dimension,
  items,
  requestedAt,
}: BreakdownSectionProps) {
  const noun = dimensionNoun(dimension);
  const max = items.reduce((m, item) => Math.max(m, item.count), 0);
  const hasLabels = items.some((item) => item.label !== item.key);

  const handleDownload = () => {
    const headers = hasLabels ? [noun, "Key", "Count"] : [noun, "Count"];
    const rows = items.map((item) =>
      hasLabels ? [item.label, item.key, item.count] : [item.key, item.count],
    );
    downloadFile(
      csvFilename(dimension, requestedAt),
      toCsv(headers, rows),
      "text/csv",
    );
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">By {noun}</h2>
        {items.length > 0 && (
          <Button
            variant="outline"
            icon={ArrowDownTrayIcon}
            onClick={handleDownload}
          >
            Download CSV
          </Button>
        )}
      </div>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <StatBar key={item.key} item={item} max={max} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No data available yet.</p>
      )}
    </div>
  );
}

/** Sort a breakdown's entries into display rows, resolving friendly labels. */
function toItems(
  breakdown: Record<string, number>,
  resolveLabel: LabelResolver,
): StatItem[] {
  return Object.entries(breakdown)
    .map(([key, count]) => ({ key, label: resolveLabel(key), count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Admin statistics page. Fetches aggregate ad statistics from the statistics
 * endpoint and renders one breakdown section (table + CSV export) per `byX`
 * dimension in the response.
 */
export default function StatisticsPage() {
  // Captured once on mount — when `useQuery` fires the statistics request.
  const requestedAt = useMemo(() => new Date(), []);
  const { data, isLoading, error } = useQuery<Statistics>(
    "/api/ads/statistics",
  );
  const { markets } = useMarkets();

  const codeToName = new Map(markets?.map((m) => [m.code, m.name]) ?? []);

  // Per-dimension label resolvers; dimensions without an entry display their
  // raw key as-is.
  const resolvers: Record<string, LabelResolver> = {
    byMarket: (key) =>
      key === "all"
        ? "All"
        : key === "without"
          ? "Without market"
          : (codeToName.get(key) ?? regionDisplayNames[key] ?? key),
    byLanguage: (key) =>
      key === "without" ? "Without language" : (getLanguageName(key) ?? key),
  };

  // `total` is a scalar count; every other key is a `byX` breakdown.
  const total = data?.total ?? 0;
  const dimensions = Object.entries(data ?? {})
    .filter(
      (entry): entry is [string, Record<string, number>] =>
        entry[0] !== "total",
    )
    .map(([dimension, breakdown]) => ({
      dimension,
      items: toItems(breakdown, resolvers[dimension] ?? ((key) => key)).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    }))
    .sort((a, b) => a.dimension.localeCompare(b.dimension));

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ChartBarIcon className="h-8 w-8 text-wb-blue" />
          <div>
            <h1 className="text-3xl font-bold">Statistics</h1>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400">
              {error.message ?? "Failed to load statistics"}
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {!isLoading && !error && data && (
          <div className="space-y-8">
            {/* Total */}
            <div className="rounded-lg border border-wb-blue/30 bg-linear-to-r from-wb-blue/20 to-purple-500/20 p-6">
              <div className="mb-1 text-sm text-gray-300">Total Ads</div>
              <div className="text-3xl font-bold">{total.toLocaleString()}</div>
            </div>

            {/* One section per dimension */}
            {dimensions.map(({ dimension, items }) => (
              <BreakdownSection
                key={dimension}
                dimension={dimension}
                items={items}
                requestedAt={requestedAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
