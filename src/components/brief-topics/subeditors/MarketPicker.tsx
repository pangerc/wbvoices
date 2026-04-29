/**
 * MarketPicker — alaric-grounded market selector for the Brand topic.
 *
 * Loads the canonical 86-market list once on mount via /api/markets
 * (defaults to platform=spotify; passes ?showAll=true when the user
 * clicks the escape hatch). Maintains its own loading state — the
 * orchestrator just owns the `selectedRegion` field.
 *
 * Legacy behaviour: `selectedRegion` may carry pre-v4 voice-region
 * taxonomy values (e.g. "us-east"). Those don't match alaric alpha-2
 * codes; we render them with a "(legacy)" suffix and let the user
 * re-pick to promote to a real alpha-2.
 */

import { useEffect, useMemo, useState } from "react";
import type { MarketRow } from "@/lib/alaric-client";
import { GlassyListbox } from "../../ui";

export interface MarketPickerProps {
  value: string | null;
  onChange: (alpha2: string | null, market: MarketRow | null) => void;
  disabled?: boolean;
}

export function MarketPicker({ value, onChange, disabled }: MarketPickerProps) {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    const url = showAll ? "/api/markets?showAll=true" : "/api/markets";
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`markets ${res.status}`);
        return res.json();
      })
      .then((data: { markets: MarketRow[] }) => {
        if (Array.isArray(data?.markets)) setMarkets(data.markets);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [showAll]);

  // Compose options: alaric markets first, then any legacy value not in
  // the alaric set rendered as "(legacy)" so re-picking promotes it.
  const options = useMemo(() => {
    const alaricOptions = markets.map((m) => ({
      value: m.code,
      label: `${m.name} (${m.code})`,
    }));
    if (
      value &&
      !markets.some((m) => m.code === value) &&
      value.length > 0
    ) {
      return [
        ...alaricOptions,
        { value, label: `${value} (legacy)` },
      ];
    }
    return alaricOptions;
  }, [markets, value]);

  function handleChange(next: string) {
    const market = markets.find((m) => m.code === next) || null;
    onChange(next || null, market);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <label className="block text-sm font-medium text-gray-300 truncate">
          Market{" "}
          <span className="text-gray-500 font-normal">(where it runs)</span>
        </label>
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
        >
          {showAll ? "Spotify only" : "Show all"}
        </button>
      </div>
      <GlassyListbox
        value={value || ""}
        onChange={handleChange}
        options={options}
        disabled={disabled || isLoading}
        loading={isLoading}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1">
          Markets unavailable: {error}
        </p>
      )}
    </div>
  );
}
