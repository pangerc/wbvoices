import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!language) {
      setOptions(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const params = new URLSearchParams({
      language,
      campaignFormat,
    });

    // Add region param if specified (to filter accents)
    if (region) {
      params.set("region", region);
    }

    // Add provider/accent params for dialogReady calculation
    if (provider && provider !== "any") {
      params.set("provider", provider);
    }
    if (accent && accent !== "neutral") {
      params.set("accent", accent);
    }

    fetch(`/api/voice-catalogue/language-options?${params}`, {
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
  }, [language, campaignFormat, region, provider, accent]);

  return { options, isLoading };
}
