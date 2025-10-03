import { useState, useEffect, useCallback, useRef } from "react";
import { Provider, Voice, Language } from "@/types";
import { VoiceCounts } from "@/utils/providerSelection";
import {
  hasRegionalAccents,
  getLanguageRegions,
  getRegionalAccents,
} from "@/utils/language";
// REMOVED: Direct import of voiceCatalogue - client can't access Redis!

/**
 * 🗡️ NEW VOICE MANAGER - REDIS POWERED!
 * Clean data-driven architecture with proper client-server separation
 */
export interface VoiceManagerV2State {
  // Core state
  selectedLanguage: Language;
  selectedRegion: string | null;
  selectedAccent: string;
  selectedProvider: Provider;

  // Available options
  availableLanguages: { code: Language; name: string }[];
  availableRegions: { code: string; displayName: string }[];
  availableAccents: { code: string; displayName: string }[];
  availableProviders: { provider: Provider; count: number; label: string }[];

  // Voice data
  currentVoices: Voice[];
  voiceCounts: VoiceCounts;

  // Loading states (much simpler now!)
  isLoading: boolean;

  // Helper flags
  hasRegions: boolean;
  hasAccents: boolean;

  // Actions
  setSelectedLanguage: (language: Language) => void;
  setSelectedRegion: (region: string | null) => void;
  setSelectedAccent: (accent: string) => void;
  setSelectedProvider: (provider: Provider) => void;

  // Helper methods
  // autoSelectProvider: REMOVED - Now handled server-side

  // 🗡️ DEPRECATED: Client-side filtering methods removed
  // Use server-side APIs instead:
  // - BriefPanel: Uses filtered-voices API operation
  // - ScripterPanel: Uses restoration endpoint with overrideVoices prop
  getFilteredVoices: () => Voice[]; // LEGACY: Still needed for ScripterPanel fallback
  loadVoices: () => Promise<void>; // LEGACY: Still needed for fallback
}

export function useVoiceManagerV2(): VoiceManagerV2State {
  // Core state - Language → Region → Accent → Provider flow
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("en");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedAccent, setSelectedAccent] = useState<string>("neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>("any");

  // AbortController to cancel previous voice loading requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Available options with safe initial states
  // 🗡️ DEMON HUNTING: Static fallback language to prevent crashes during nuclear strike
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: Language; name: string }[]
  >([{ code: "en", name: "English" }]);
  const [availableRegions, setAvailableRegions] = useState<
    { code: string; displayName: string }[]
  >([]);
  const [availableAccents, setAvailableAccents] = useState<
    { code: string; displayName: string }[]
  >([{ code: "neutral", displayName: "Any Accent" }]);
  const [availableProviders, setAvailableProviders] = useState<
    { provider: Provider; count: number; label: string }[]
  >([{ provider: "any", count: 0, label: "Any Provider (0 voices)" }]);

  // Voice data
  const [currentVoices, setCurrentVoices] = useState<Voice[]>([]);
  const [voiceCounts, setVoiceCounts] = useState<VoiceCounts>({
    elevenlabs: 0,
    lovo: 0,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    any: 0,
  });

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Helper flags
  const hasRegions = hasRegionalAccents(selectedLanguage);
  const hasAccents = availableAccents.length > 1;

  // 🧪 DEMON DIAGNOSTIC: Hook lifecycle tracking
  useEffect(() => {
    console.log('🏁 VOICE MANAGER V2 HOOK MOUNTED');
    return () => console.log('💀 VOICE MANAGER V2 HOOK UNMOUNTED');
  }, []);

  // Initialize available languages on mount
  useEffect(() => {
    console.count('🔥 vm:init-languages'); // 🧪 DEMON DIAGNOSTIC
    const initLanguages = async () => {
      setIsLoading(true);
      try {
        // Get all available languages from the API
        const response = await fetch("/api/voice-catalogue/languages");
        const data = await response.json();

        if (data.error) {
          console.error("❌ Failed to load languages:", data.error);
          return;
        }

        const languages = data.languages || [];

        if (languages.length === 0) {
          console.error(
            "⚠️ No languages available! Run POST /api/admin/voice-cache"
          );
          return;
        }

        setAvailableLanguages(languages);

        // Let users and project restoration control their own language choice
        console.log(
          `✅ Languages loaded (${languages.length}), current language: ${selectedLanguage}`
        );
      } catch (error) {
        console.error("Failed to initialize languages:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initLanguages();
  }, [selectedLanguage]);

  // When language changes, update available regions
  useEffect(() => {
    console.count('🔥 vm:language->regions'); // 🧪 DEMON DIAGNOSTIC
    // Clear current voices immediately when language changes to prevent stale data
    console.log("🔄 Language changed, clearing stale voices");
    setCurrentVoices([]);

    const regions = getLanguageRegions(selectedLanguage);

    // Add "All Regions" option if there are regions
    const regionsWithAll =
      regions.length > 0
        ? [{ code: "all", displayName: "All Regions" }, ...regions]
        : regions;

    setAvailableRegions(regionsWithAll);

    // Let project restoration and user choice control region selection
    console.log(
      `✅ Language changed to ${selectedLanguage}, regions available: ${regions.length}, current region: ${selectedRegion}`
    );
  }, [selectedLanguage, selectedRegion]);

  // When language or region changes, update available accents
  useEffect(() => {
    console.count('🔥 vm:accents'); // 🧪 DEMON DIAGNOSTIC
    const updateAccents = async () => {
      setIsLoading(true);
      try {
        let accents: { code: string; displayName: string }[] = [];

        // If we have a selected region (and it's not "all"), get regional accents
        if (selectedRegion && selectedRegion !== "all" && hasRegions) {
          const regionalAccents = getRegionalAccents(
            selectedLanguage,
            selectedRegion
          );
          accents = regionalAccents.map((accent) => ({
            code: accent === "none" ? "neutral" : accent,
            displayName:
              accent === "none"
                ? "Any Accent"
                : accent.charAt(0).toUpperCase() + accent.slice(1),
          }));
        } else {
          // Fall back to API for languages without regional mapping
          const url = new URL(
            "/api/voice-catalogue/accents",
            window.location.origin
          );
          url.searchParams.set("language", selectedLanguage);

          const response = await fetch(url);
          const data = await response.json();

          if (data.error) {
            console.error("❌ Failed to load accents:", data.error);
            accents = [{ code: "neutral", displayName: "Any Accent" }];
          } else {
            accents = data.accents || [
              { code: "neutral", displayName: "Any Accent" },
            ];
          }
        }

        setAvailableAccents(accents);

        // 🔥 NEW: Reset accent if it's no longer valid for the new language
        const currentAccentIsValid = accents.some(accent => accent.code === selectedAccent);
        if (!currentAccentIsValid) {
          console.log(`🔄 Current accent "${selectedAccent}" is invalid for ${selectedLanguage}, resetting to "neutral"`);
          setSelectedAccent("neutral");
        }

        console.log(
          `✅ Accents updated for ${selectedLanguage}/${selectedRegion}, current accent: ${selectedAccent}${currentAccentIsValid ? '' : ' → neutral'}`
        );
      } catch (error) {
        console.error("Failed to update accents:", error);
        setAvailableAccents([{ code: "neutral", displayName: "Any Accent" }]);
      } finally {
        setIsLoading(false);
      }
    };

    updateAccents();
  }, [selectedLanguage, selectedRegion, hasRegions, selectedAccent]);

  // 🗡️ REMOVED: Provider reset on language change
  // Now relying on server-side selection and Redis as source of truth
  // Provider persists across language changes unless server decides otherwise

  // When language OR ACCENT changes, update voice counts and providers
  useEffect(() => {
    console.count('🔥 vm:providers'); // 🧪 DEMON DIAGNOSTIC
    const updateProviders = async () => {
      setIsLoading(true);
      try {
        // Single data-driven call via API
        const url = new URL("/api/voice-catalogue", window.location.origin);
        url.searchParams.set("operation", "provider-options");
        url.searchParams.set("language", selectedLanguage);
        // Only send region if it's not "all"
        if (selectedRegion && selectedRegion !== "all") {
          url.searchParams.set("region", selectedRegion);
        }
        // Include accent for accurate provider counts
        if (selectedAccent && selectedAccent !== "neutral") {
          url.searchParams.set("accent", selectedAccent);
        }
        url.searchParams.set("exclude", "lovo"); // Lovo disabled due to poor voice quality

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch provider options");
        }
        const providers: Array<{
          provider: Provider;
          count: number;
          label: string;
          disabled?: boolean;
        }> = await response.json();

        // Convert to our UI format and set voice counts
        const uiProviders = providers.map((p) => ({
          provider: p.provider,
          count: p.count,
          label: p.label,
        }));

        setAvailableProviders(uiProviders);

        // Extract counts for legacy compatibility
        const counts: VoiceCounts = {
          elevenlabs:
            providers.find((p) => p.provider === "elevenlabs")?.count || 0,
          lovo: 0, // Excluded
          openai: providers.find((p) => p.provider === "openai")?.count || 0,
          qwen: providers.find((p) => p.provider === "qwen")?.count || 0,
          bytedance: providers.find((p) => p.provider === "bytedance")?.count || 0,
          any: providers.find((p) => p.provider === "any")?.count || 0,
        };
        setVoiceCounts(counts);
      } catch (error) {
        console.error("Failed to update providers:", error);
      } finally {
        setIsLoading(false);
      }
    };

    updateProviders();
  }, [selectedLanguage, selectedRegion, selectedAccent]); // Update when language, region, or accent changes

  // 🗡️ ALWAYS LOAD ALL VOICES - Clean, consistent approach!
  const loadVoices = useCallback(async () => {
    // Cancel previous request if it's still running
    if (abortControllerRef.current) {
      console.log("🚫 Cancelling previous voice loading request");
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    console.log(
      `🔄 Loading filtered voices for language=${selectedLanguage}, region=${
        selectedRegion || "all"
      }, accent=${selectedAccent} (excluding Lovo)`
    );
    setIsLoading(true);
    setCurrentVoices([]); // Clear immediately

    try {
      // Load from non-excluded providers only (exclude Lovo due to poor quality)
      const providers = ["elevenlabs", "openai", "qwen"] as const;
      const voicePromises = providers.map(async (provider) => {
        try {
          const url = new URL("/api/voice-catalogue", window.location.origin);
          url.searchParams.set("operation", "voices");
          url.searchParams.set("provider", provider);
          url.searchParams.set("language", selectedLanguage);
          if (selectedRegion) {
            url.searchParams.set("region", selectedRegion);
          }
          if (selectedAccent && selectedAccent !== "neutral") {
            url.searchParams.set("accent", selectedAccent);
          }

          const response = await fetch(url, { signal: abortController.signal });
          const voices = await response.json();
          // Tag each voice with its provider
          return Array.isArray(voices)
            ? voices.map((v: Voice) => ({ ...v, provider }))
            : [];
        } catch (error) {
          // Don't log abort errors as they're intentional
          if (error instanceof Error && error.name === "AbortError") {
            console.log(`🚫 ${provider} voice request cancelled`);
            return [];
          }
          console.error(`Failed to load ${provider} voices:`, error);
          return [];
        }
      });

      const providerVoicesArrays = await Promise.all(voicePromises);
      const allVoices = providerVoicesArrays.flat();

      // Convert to Voice type (may need mapping)
      const mappedVoices: Voice[] = allVoices.map((v: unknown) => {
        const voice = v as Record<string, unknown>;
        return {
          id: voice.id as string,
          name: voice.name as string,
          gender:
            voice.gender === "male" || voice.gender === "female"
              ? (voice.gender as "male" | "female")
              : null,
          language: voice.language as string,
          accent: voice.accent as string,
          description: (voice.personality || voice.description) as string,
          age: voice.age as string,
          style: (voice.styles as string[])?.[0] || (voice.style as string),
          use_case: (voice.useCase || voice.use_case) as string,
          sampleUrl: voice.sampleUrl as string,
          // Add provider info
          provider: voice.provider as string,
        } as Voice & { provider?: string };
      });

      // Only update state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        console.log(
          `✅ Loaded ${mappedVoices.length} voices from all providers for ${selectedLanguage}`
        );
        console.log(`🔍 Provider breakdown:`, {
          elevenlabs: mappedVoices.filter(
            (v) =>
              (v as Voice & { provider?: string }).provider === "elevenlabs"
          ).length,
          lovo: mappedVoices.filter(
            (v) => (v as Voice & { provider?: string }).provider === "lovo"
          ).length,
          openai: mappedVoices.filter(
            (v) => (v as Voice & { provider?: string }).provider === "openai"
          ).length,
          qwen: mappedVoices.filter(
            (v) => (v as Voice & { provider?: string }).provider === "qwen"
          ).length,
        });
        setCurrentVoices(mappedVoices);
      } else {
        console.log(
          "🚫 Voice loading request was aborted, skipping state update"
        );
      }
    } catch (error) {
      // Don't log abort errors as they're intentional
      if (error instanceof Error && error.name === "AbortError") {
        console.log("🚫 Voice loading request cancelled");
        return; // Exit early for aborted requests
      }
      console.error("Failed to load voices:", error);
    } finally {
      // Only clear loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [selectedLanguage, selectedAccent, selectedRegion]); // Reload when language/accent/region changes, NOT provider

  // Load voices when language or accent changes (not provider!)
  useEffect(() => {
    console.count('🔥 vm:load-voices'); // 🧪 DEMON DIAGNOSTIC
    loadVoices();
  }, [loadVoices]);

  // 🗡️ DEPRECATED: Legacy fallback method for ScripterPanel
  // This should only be used when overrideVoices is not available
  const getFilteredVoices = useCallback(() => {
    console.log(
      "⚠️ getFilteredVoices called (DEPRECATED - use server APIs instead)"
    );

    // Simple fallback: return current voices without complex filtering
    // The complex regional filtering is now handled server-side
    return currentVoices;
  }, [currentVoices]);

  // 🗡️ REMOVED: autoSelectProvider - Now handled by server-side selection
  // Provider selection moved to server APIs for consistency and accuracy

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // Core state
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,

    // Available options
    availableLanguages,
    availableRegions,
    availableAccents,
    availableProviders,

    // Voice data
    currentVoices,
    voiceCounts,

    // Loading state
    isLoading,

    // Helper flags
    hasRegions,
    hasAccents,

    // Actions
    setSelectedLanguage,
    setSelectedRegion,
    setSelectedAccent,
    setSelectedProvider,

    // Helper methods
    getFilteredVoices, // DEPRECATED: Legacy fallback only
    // autoSelectProvider - REMOVED: Now handled server-side
    loadVoices, // DEPRECATED: Legacy fallback only
  };
}
