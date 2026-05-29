/**
 * MarketPicker — alaric-grounded market selector for the Brand topic.
 *
 * Loads the canonical 86-market list once on mount via /api/markets
 * (defaults to platform=spotify; passes ?showAll=true when the user
 * clicks the escape hatch). Searchable combobox surface — same UX
 * as the language picker in LanguageTopic.
 *
 * Legacy behaviour: `selectedRegion` may carry pre-v4 voice-region
 * taxonomy values (e.g. "us-east"). Those don't match alaric alpha-2
 * codes; we render them with a "(legacy)" suffix and let the user
 * re-pick to promote to a real alpha-2.
 */

import { useMarkets } from "@/hooks/market";
import type { MarketRow } from "@/lib/alaric-client";
import { useMemo, useState } from "react";
import { GlassyCombobox } from "../../ui";

export interface MarketPickerProps {
  value: string | null;
  onChange: (alpha2: string | null, market: MarketRow | null) => void;
  disabled?: boolean;
}

type MarketComboItem = {
  value: string;
  label: string;
  flag?: string;
};

export function MarketPicker({ value, onChange, disabled }: MarketPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const [eagerQuery, setEagerQuery] = useState("");

  const { markets, isLoading, error } = useMarkets({ eagerQuery, showAll });

  // Build the option list from alaric markets. If there's a legacy
  // selectedRegion value not in the alaric set, append it tagged so
  // the user can see and replace it.
  const allOptions = useMemo<MarketComboItem[]>(() => {
    const alaricOptions = markets.map((m) => ({
      value: m.code,
      label: m.name,
      flag: m.code,
    }));
    if (
      value &&
      value.trim().length > 0 &&
      !markets.some((m) => m.code === value)
    ) {
      return [
        ...alaricOptions,
        { value, label: `${value} (legacy)`, flag: value },
      ];
    }
    return alaricOptions;
  }, [markets, value]);

  // Client-side filter on the typed query (name OR alpha-2 OR aliases).
  // Alaric's MarketRow.aliases field carries demonyms / native-language
  // names, so typing "slovenian" or "slovenija" both match Slovenia.
  const filteredOptions = useMemo<MarketComboItem[]>(() => {
    const q = eagerQuery.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((opt) => {
      if (opt.label.toLowerCase().includes(q)) return true;
      if (opt.value.toLowerCase().includes(q)) return true;
      const market = markets.find((m) => m.code === opt.value);
      if (market?.aliases?.some((a) => a.toLowerCase().includes(q)))
        return true;
      return false;
    });
  }, [allOptions, markets, eagerQuery]);

  const selectedItem = useMemo<MarketComboItem | null>(() => {
    if (!value) return null;
    return allOptions.find((o) => o.value === value) ?? null;
  }, [allOptions, value]);

  function handleChange(item: MarketComboItem | null) {
    if (!item) {
      onChange(null, null);
      return;
    }
    const market = markets.find((m) => m.code === item.value) || null;
    onChange(item.value, market);
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
          tabIndex={-1}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
        >
          {showAll ? "Spotify only" : "Show all"}
        </button>
      </div>
      <GlassyCombobox<string>
        value={selectedItem}
        onChange={handleChange}
        options={filteredOptions}
        onQueryChange={setEagerQuery}
        disabled={disabled || isLoading}
        loading={isLoading}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1">
          Markets unavailable: {error.message}
        </p>
      )}
    </div>
  );
}
