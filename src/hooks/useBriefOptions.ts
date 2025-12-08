import { useState, useEffect, useMemo } from "react";
import { Language, Provider, CampaignFormat } from "@/types";
import { VoiceCounts } from "@/services/voiceCatalogueService";

export type LanguageOption = {
  code: string;
  name: string;
};

export type RegionOption = {
  code: string;
  displayName: string;
};

export type AccentOption = {
  code: string;
  displayName: string;
};

export type LanguageOptions = {
  language: string; // The language these options are for (for staleness check)
  regions: RegionOption[];
  accents: AccentOption[];
  voiceCounts: VoiceCounts;
  suggestedProvider: Provider;
  dialogReady: boolean;
  hasRegions: boolean;
  hasAccents: boolean;
};

/**
 * Load available languages once on mount.
 * This data is static and doesn't change per language selection.
 */
export function useBriefOptions() {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/voice-catalogue/languages")
      .then((r) => r.json())
      .then((data) => {
        setLanguages(data.languages || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load languages:", err);
        setIsLoading(false);
      });
  }, []); // Empty deps - only on mount

  return { languages, isLoading };
}

/**
 * Load language-dependent options (regions, accents, voice counts).
 * Single API call replaces the 12+ calls in useVoiceManagerV2.
 * Accents are filtered by region when a region is selected.
 * dialogReady is calculated based on provider and accent filters.
 *
 * PERF: Uses memoized params key to prevent unnecessary refetches when
 * unrelated state changes cause re-renders.
 */
export function useLanguageOptions(
  language: Language | null,
  campaignFormat: CampaignFormat,
  region?: string | null,
  provider?: string | null,
  accent?: string | null
) {
  const [options, setOptions] = useState<LanguageOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Stabilize params to prevent unnecessary refetches
  // Only refetch when these ACTUALLY change, not on every render
  const paramsKey = useMemo(() => {
    if (!language) return null;
    return JSON.stringify({
      language,
      campaignFormat,
      region: region || null,
      // Normalize "any" and "neutral" to null so they don't trigger refetches
      provider: provider && provider !== "any" ? provider : null,
      accent: accent && accent !== "neutral" ? accent : null,
    });
  }, [language, campaignFormat, region, provider, accent]);

  useEffect(() => {
    if (!paramsKey) {
      setOptions(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const params = JSON.parse(paramsKey);
    const searchParams = new URLSearchParams();
    searchParams.set("language", params.language);
    searchParams.set("campaignFormat", params.campaignFormat);
    if (params.region) searchParams.set("region", params.region);
    if (params.provider) searchParams.set("provider", params.provider);
    if (params.accent) searchParams.set("accent", params.accent);

    fetch(`/api/voice-catalogue/language-options?${searchParams}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          console.error("Language options error:", data.error);
          setOptions(null);
        } else {
          setOptions(data);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to load language options:", err);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [paramsKey]); // Single stable dependency instead of 5 separate ones

  return { options, isLoading };
}
