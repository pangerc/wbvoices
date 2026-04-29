/**
 * BrandPickerSubeditor — debounced SF-account search + greenfield recents
 * for the Brand topic. Routes through /api/brand-context, the unified
 * endpoint that handles all four `kind` paths (sf-account, search,
 * greenfield, spotify-ad-manager-stub).
 *
 * Behaviour mirrors the v3.5 picker's UX:
 *   - Debounced SF search (default Spotify-only filter; "Show all"
 *     escape hatch retries unfiltered when the filter returns zero).
 *   - Recents row preloaded from the user's ad history.
 *   - "Use as standalone brand" affordance for greenfield entries that
 *     don't match any SF account.
 *   - On pick: brand state lifts to the parent (V4); parent triggers the
 *     sf-account fetch to load the dossier badge under the picker.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { BrandRef } from "@/types";
import type { SfAccountSearchResult } from "@/lib/alaric-client";

export interface BrandPickerSubeditorProps {
  brand: BrandRef | null;
  onBrandChanged: (brand: BrandRef | null) => void;
  marketAlpha2?: string | null;
  disabled?: boolean;
}

export function BrandPickerSubeditor({
  brand,
  onBrandChanged,
  marketAlpha2,
  disabled,
}: BrandPickerSubeditorProps) {
  // Search state
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SfAccountSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [spotifyOnly, setSpotifyOnly] = useState(true);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  // Recents (greenfield) state — loaded once on mount
  const [recents, setRecents] = useState<BrandRef[]>([]);
  const recentsLoadedRef = useRef(false);

  useEffect(() => {
    if (recentsLoadedRef.current) return;
    recentsLoadedRef.current = true;

    const controller = new AbortController();
    fetch("/api/brand-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "greenfield" }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { recents: [] }))
      .then((data: { recents?: BrandRef[] }) => {
        if (Array.isArray(data?.recents)) setRecents(data.recents);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[BrandPicker] failed to load recents:", err);
        }
      });
    return () => controller.abort();
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearchError(null);
      setFallbackUsed(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setFallbackUsed(false);

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        // Pass 1: spotify-filtered if toggle is on
        const primaryRes = await fetch("/api/brand-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "search",
            query: q,
            ...(spotifyOnly ? {} : { clientPlatforms: [] }),
            ...(marketAlpha2 ? { marketAlpha2 } : {}),
          }),
          signal: controller.signal,
        });
        if (!primaryRes.ok) {
          const body = await primaryRes.json().catch(() => ({}));
          throw new Error(body?.error || `search failed (${primaryRes.status})`);
        }
        const primary = await primaryRes.json();
        const primaryHits: SfAccountSearchResult[] = Array.isArray(
          primary?.candidates
        )
          ? primary.candidates
          : [];

        // Auto-fallback when spotify-only returns zero — global brands
        // (Red Bull, Heineken) may not be Spotify-tagged in alaric yet.
        if (spotifyOnly && primaryHits.length === 0) {
          const fallbackRes = await fetch("/api/brand-context", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "search",
              query: q,
              clientPlatforms: [],
              ...(marketAlpha2 ? { marketAlpha2 } : {}),
            }),
            signal: controller.signal,
          });
          if (fallbackRes.ok) {
            const fb = await fallbackRes.json();
            const fbHits: SfAccountSearchResult[] = Array.isArray(
              fb?.candidates
            )
              ? fb.candidates
              : [];
            if (fbHits.length > 0) {
              setHits(fbHits);
              setFallbackUsed(true);
              return;
            }
          }
        }

        setHits(primaryHits);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setSearchError(err.message);
          setHits([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [query, spotifyOnly, marketAlpha2]);

  const pickFromSearch = useCallback(
    (hit: SfAccountSearchResult) => {
      onBrandChanged({
        name: hit.name,
        salesforceAccountId: hit.id,
        salesforceAccountSnapshot: {
          id: hit.id,
          name: hit.name,
          industry: hit.industry,
        },
      });
      setQuery("");
      setHits([]);
      setDropdownOpen(false);
    },
    [onBrandChanged]
  );

  const pickStandalone = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      onBrandChanged({
        name: trimmed,
        salesforceAccountId: null,
        salesforceAccountSnapshot: null,
      });
      setQuery("");
      setHits([]);
      setDropdownOpen(false);
    },
    [onBrandChanged]
  );

  const pickRecent = useCallback(
    (recent: BrandRef) => {
      onBrandChanged(recent);
      setQuery("");
      setHits([]);
      setDropdownOpen(false);
    },
    [onBrandChanged]
  );

  const clearBrand = useCallback(() => {
    onBrandChanged(null);
    setQuery("");
    setHits([]);
    setDropdownOpen(false);
  }, [onBrandChanged]);

  // Recent brand chips — render only when no brand picked yet (clean
  // empty-state nudge, not a permanent row).
  const recentChips = useMemo(() => {
    if (brand) return [];
    return recents.slice(0, 6);
  }, [brand, recents]);

  // Render
  if (brand) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{brand.name}</div>
          {brand.salesforceAccountSnapshot ? (
            <div className="text-xs text-gray-400 truncate">
              SF · {brand.salesforceAccountSnapshot.industry || "Unknown industry"}
            </div>
          ) : (
            <div className="text-xs text-gray-500">Standalone (no SF link)</div>
          )}
        </div>
        <button
          type="button"
          onClick={clearBrand}
          disabled={disabled}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          title="Clear brand"
        >
          <XMarkIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl focus-within:border-white/30 transition-colors">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search Salesforce or type a brand name…"
            disabled={disabled}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={() => setSpotifyOnly((s) => !s)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
            title={
              spotifyOnly
                ? "Showing Spotify-buying clients only"
                : "Showing all SF accounts"
            }
          >
            {spotifyOnly ? "Spotify only" : "Show all"}
          </button>
          <ChevronDownIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        </div>

        {dropdownOpen && (query.trim().length >= 2 || hits.length > 0) && (
          <div className="absolute z-20 mt-1 w-full bg-black/90 border border-white/15 rounded-xl shadow-2xl backdrop-blur-md max-h-80 overflow-y-auto">
            {isSearching && (
              <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
            )}
            {searchError && (
              <div className="px-3 py-2 text-xs text-red-400">
                {searchError}
              </div>
            )}
            {fallbackUsed && (
              <div className="px-3 py-2 text-xs text-amber-400 border-b border-white/10">
                No Spotify match — showing all SF accounts
              </div>
            )}
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => pickFromSearch(hit)}
                className="block w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
              >
                <div className="text-sm text-white">{hit.name}</div>
                {hit.industry && (
                  <div className="text-xs text-gray-400">{hit.industry}</div>
                )}
              </button>
            ))}
            {!isSearching && query.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => pickStandalone(query)}
                className="block w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-t border-white/10"
              >
                <div className="text-sm text-gray-300">
                  Use as standalone brand:{" "}
                  <span className="text-white">"{query.trim()}"</span>
                </div>
                <div className="text-xs text-gray-500">
                  No Salesforce link; brand voice will rely on the brief alone
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {recentChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Recent:</span>
          {recentChips.map((recent) => (
            <button
              key={recent.name}
              type="button"
              onClick={() => pickRecent(recent)}
              disabled={disabled}
              className="text-xs px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors"
            >
              {recent.name}
              {recent.salesforceAccountId && (
                <span className="ml-1 text-gray-500">·sf</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
