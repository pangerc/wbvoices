import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  CampaignFormat,
  AIModel,
  SoundFxPrompt,
  Language,
  Voice,
  Provider,
  Pacing,
} from "@/types";
import { generateCreativeCopy } from "@/utils/ai-api-client";
import { parseCreativeJSON } from "@/utils/json-parser";
import { getFlagCode } from "@/utils/language";
import { VoiceManagerV2State } from "@/hooks/useVoiceManagerV2";
import { selectAIModelForLanguage } from "@/utils/aiModelSelection";
import {
  GlassyTextarea,
  GlassyListbox,
  GlassyOptionPicker,
  GlassySlider,
  GlassyCombobox,
  SplitGenerateButton,
} from "./ui";

/**
 * Small refresh button for updating the voice cache
 */
function RefreshVoiceCache() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/voice-cache", {
        method: "POST",
      });
      if (response.ok) {
        setLastRefresh(new Date());
        // Reload the page to get fresh voice data
        window.location.reload();
      } else {
        console.error("Failed to refresh voice cache");
      }
    } catch (error) {
      console.error("Error refreshing voice cache:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
    >
      <svg
        className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {isRefreshing ? "Refreshing..." : "Refresh voices database"}
      {lastRefresh && (
        <span className="text-gray-500">
          (updated {lastRefresh.toLocaleTimeString()})
        </span>
      )}
    </button>
  );
}

/**
 * 🔥 BRIEF PANEL - REDIS POWERED!
 * Language → Accent → Provider flow with voice counts!
 */
export type BriefPanelProps = {
  // Form state
  clientDescription: string;
  setClientDescription: (value: string) => void;
  creativeBrief: string;
  setCreativeBrief: (value: string) => void;
  campaignFormat: CampaignFormat;
  setCampaignFormat: (value: CampaignFormat) => void;
  adDuration: number;
  setAdDuration: (duration: number) => void;
  selectedAiModel: AIModel;
  setSelectedAiModel: (model: AIModel) => void;
  selectedCTA: string | null;
  setSelectedCTA: (cta: string | null) => void;
  selectedPacing: Pacing | null;
  setSelectedPacing: (pacing: Pacing | null) => void;

  // Voice manager (new interface!)
  voiceManager: VoiceManagerV2State;

  // Callbacks
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[],
    resolvedVoices?: Voice[] // Pass the actual voices used for generation
  ) => void;
  onGenerateCreativeAuto: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[],
    resolvedVoices?: Voice[] // Pass the actual voices used for generation
  ) => void;

  // New: shared creative generation state
  setIsGeneratingCreative: (generating: boolean) => void;
};

const campaignFormatOptions = [
  {
    value: "ad_read" as CampaignFormat,
    label: "Single Voice Ad Read",
    description: "One voice narrating the entire advertisement",
  },
  {
    value: "dialog" as CampaignFormat,
    label: "Dialogue",
    description:
      "Two voices having a conversation about the product or service",
  },
];

// SVG Icons for pacing control
const TurtleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="20" width="20">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M14.881 18h0.869c1.1935 0 2.3381 -0.4741 3.182 -1.318 0.8439 -0.8439 1.318 -1.9885 1.318 -3.182V9h1.5c0.3978 0 0.7794 -0.15804 1.0607 -0.43934S23.25 7.89782 23.25 7.5v-3c0 -0.79565 -0.3161 -1.55871 -0.8787 -2.12132C21.8087 1.81607 21.0457 1.5 20.25 1.5H16.5c-0.6501 0.18758 -1.2214 0.58188 -1.6274 1.12319 -0.406 0.54131 -0.6245 1.20017 -0.6226 1.87681V6" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M12.945 9.15101c-1.3302 -1.07096 -2.98726 -1.65367 -4.695 -1.651 -4.142 0 -6 3.35799 -6 7.49999v1.5" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M2.25 16.5c-0.39782 0 -0.77936 0.158 -1.06066 0.4393C0.908035 17.2206 0.75 17.6022 0.75 18c0 0.3978 0.158035 0.7793 0.43934 1.0607 0.2813 0.2813 0.66284 0.4393 1.06066 0.4393H12c3 0 3.75 -3 3.75 -4.5 0.0016 -1.1226 -0.2492 -2.2312 -0.7339 -3.2438S13.8253 9.85288 12.95 9.14999c0.3663 0.90541 0.5531 1.87331 0.55 2.85001 0 1.5 -0.75 4.5 -3.75 4.5h-7.5Z" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M11.518 8.24701 3.26501 16.5" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M5.75098 8.00101 12.678 14.928" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="m3.13599 10.636 5.863 5.863" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M6.74998 19.5V21c0 0.3978 -0.15804 0.7794 -0.43934 1.0607 -0.28131 0.2813 -0.66284 0.4393 -1.06066 0.4393h-2.362c-0.15546 0 -0.30706 -0.0483 -0.43385 -0.1383 -0.12679 -0.0899 -0.2225 -0.217 -0.2739 -0.3637 -0.05139 -0.1468 -0.05592 -0.3058 -0.01297 -0.4552 0.04294 -0.1494 0.13126 -0.2818 0.25272 -0.3788l2.08 -1.664h2.25Z" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M11.25 19.5V21c0 0.3978 0.158 0.7793 0.4393 1.0606 0.2813 0.2814 0.6629 0.4394 1.0607 0.4394h2.362c0.1555 0 0.3071 -0.0483 0.4338 -0.1383 0.1268 -0.0899 0.2225 -0.217 0.2739 -0.3638 0.0514 -0.1467 0.056 -0.3057 0.013 -0.4551 -0.0429 -0.1494 -0.1312 -0.2818 -0.2527 -0.3788L13.253 19.3" strokeWidth="1.5"></path>
    <path stroke="currentColor" d="M18.75 4.875c-0.2071 0 -0.375 -0.16789 -0.375 -0.375s0.1679 -0.375 0.375 -0.375" strokeWidth="1.5"></path>
    <path stroke="currentColor" d="M18.75 4.875c0.2071 0 0.375 -0.16789 0.375 -0.375s-0.1679 -0.375 -0.375 -0.375" strokeWidth="1.5"></path>
  </svg>
);

const RabbitIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="20" width="20">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M7.51172 12.036c0.69627 -0.0353 1.39194 0.0805 2.03924 0.3394 0.64734 0.2589 1.23094 0.6548 1.71074 1.1606 1.4293 1.9422 2.4675 4.1437 3.057 6.482" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M18.7342 23.25h-5.8826c-0.2507 0.0002 -0.4973 -0.0624 -0.7175 -0.1823 -0.2201 -0.1198 -0.4067 -0.293 -0.5425 -0.5036 -1.0113 -1.6024 -2.42199 -2.9143 -4.09347 -3.8069 -2.99522 -1.4976 -5.99044 -2.9953 -5.99044 -6.7393 0 -5.24162 3.74403 -5.99042 5.99044 -5.99042 3.74407 0 7.48807 3.74403 9.73447 4.49282 -1.4976 -2.2464 -4.5687 -9.2702 -2.2464 -9.734457C18.7302 0.0370377 20.9766 11.2691 20.9766 11.2691c0.7198 0.3097 1.324 0.8378 1.7271 1.5097s0.5848 1.4535 0.5193 2.2343c0 2.2465 -1.4976 2.2465 -3.744 2.2465 -2.2464 0 -2.9952 0.7488 -2.9952 0.7488" strokeWidth="1.5"></path>
    <path stroke="currentColor" d="M19.8867 14.2859c-0.2071 0 -0.375 -0.1679 -0.375 -0.375s0.1679 -0.375 0.375 -0.375" strokeWidth="1.5"></path>
    <path stroke="currentColor" d="M19.8867 14.2859c0.2071 0 0.375 -0.1679 0.375 -0.375s-0.1679 -0.375 -0.375 -0.375" strokeWidth="1.5"></path>
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M2.51173 8.22998c-0.42497 -0.0973 -0.81252 -0.31598 -1.11553 -0.62943 -0.30301 -0.31346 -0.508427 -0.70819 -0.591279 -1.13621 -0.082852 -0.42803 -0.03957 -0.8709 0.124583 -1.27478 0.164156 -0.40389 0.442106 -0.75138 0.800076 -1.00024 0.35796 -0.24886 0.78051 -0.38836 1.21628 -0.40155 0.43577 -0.01318 0.86598 0.10051 1.23834 0.32727 0.37236 0.22676 0.67081 0.55681 0.85909 0.95003 0.18827 0.39322 0.25826 0.83266 0.20144 1.26491" strokeWidth="1.5"></path>
  </svg>
);

const allAiModelOptions = [
  {
    value: "gpt4" as AIModel,
    label: "GPT 4.1",
    description: "Largest Open AI model for creative tasks",
  },
  {
    value: "gpt5" as AIModel,
    label: "GPT 5",
    description: "Latest model for advanced creative reasoning",
  },
  {
    value: "moonshot" as AIModel,
    label: "Moonshot KIMI",
    description: "Chinese LLM optimized for multilingual content",
  },
  {
    value: "qwen" as AIModel,
    label: "Qwen-Max",
    description: "Alibaba's multilingual AI model",
  },
];

export function BriefPanel({
  clientDescription,
  setClientDescription,
  creativeBrief,
  setCreativeBrief,
  campaignFormat,
  setCampaignFormat,
  adDuration,
  setAdDuration,
  selectedAiModel,
  setSelectedAiModel,
  selectedCTA,
  setSelectedCTA,
  selectedPacing,
  setSelectedPacing,
  voiceManager,
  onGenerateCreative,
  onGenerateCreativeAuto,
  setIsGeneratingCreative,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");

  // 🚀 AUTO Mode state - tracks which mode was last used (for button display)
  const [autoModeEnabled, setAutoModeEnabled] = useState(true);

  // 🔥 NEW: Server-filtered voices to replace client-side getFilteredVoices()
  const [serverFilteredVoices, setServerFilteredVoices] = useState<{
    voices: unknown[];
    count: number;
    selectedProvider?: Provider;
    dialogReady?: boolean;
    dialogWarning?: string;
  }>({
    voices: [],
    count: 0,
  });
  const [isLoadingFilteredVoices, setIsLoadingFilteredVoices] = useState(false);

  // Use all AI models without regional filtering
  const aiModelOptions = allAiModelOptions;

  const {
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    availableLanguages,
    availableRegions,
    availableAccents,
    availableProviders,
    isLoading,
    hasRegions,
    hasAccents,
    setSelectedLanguage,
    setSelectedRegion,
    setSelectedAccent,
    setSelectedProvider,
  } = voiceManager;

  // 🧪 DEMON DIAGNOSTIC: Component lifecycle tracking
  useEffect(() => {
    console.log("🏁 BRIEF PANEL MOUNTED");
    return () => console.log("💀 BRIEF PANEL UNMOUNTED");
  }, []);

  // 🔥 NEW: Load server-filtered voices when filter criteria change
  useEffect(() => {
    console.count("🔥 brief:filtered-voices"); // 🧪 DEMON DIAGNOSTIC
    const loadFilteredVoices = async () => {
      // Don't load if basic data isn't ready yet
      if (!selectedLanguage || availableLanguages.length === 0) {
        return;
      }

      setIsLoadingFilteredVoices(true);
      try {
        const url = new URL("/api/voice-catalogue", window.location.origin);
        url.searchParams.set("operation", "filtered-voices");
        url.searchParams.set("language", selectedLanguage);

        // Only set region if it's not "all" and has regions
        if (selectedRegion && selectedRegion !== "all" && hasRegions) {
          url.searchParams.set("region", selectedRegion);
        }

        // Set accent if not neutral
        if (selectedAccent && selectedAccent !== "neutral") {
          url.searchParams.set("accent", selectedAccent);
        }

        // 🔥 Send user's selected provider, or "any" for auto-selection
        // Respect user's explicit choice while allowing server auto-selection
        url.searchParams.set("provider", selectedProvider);

        // Add campaign format for dialog validation
        url.searchParams.set("campaignFormat", campaignFormat);

        // Exclude Lovo (poor quality)
        url.searchParams.set("exclude", "lovo");

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          console.error("❌ Failed to load filtered voices:", data.error);
          setServerFilteredVoices({ voices: [], count: 0 });
        } else {
          console.log(
            `✅ Loaded ${
              data.count
            } server-filtered voices for ${selectedLanguage}${
              data.selectedProvider
                ? ` (auto-selected: ${data.selectedProvider})`
                : ""
            }`
          );
          setServerFilteredVoices({
            voices: data.voices || [],
            count: data.count || 0,
            selectedProvider: data.selectedProvider,
            dialogReady: data.dialogReady,
            dialogWarning: data.dialogWarning,
          });

          // 🔥 Only update provider when user selected "any" (auto-selection)
          // Respect explicit user choice by not overriding it
          if (selectedProvider === "any" && data.selectedProvider) {
            console.log(
              `🎯 Server selected provider: ${data.selectedProvider}`
            );
            setSelectedProvider(data.selectedProvider);
          }
        }
      } catch (error) {
        console.error("Failed to load filtered voices:", error);
        setServerFilteredVoices({ voices: [], count: 0 });
      } finally {
        setIsLoadingFilteredVoices(false);
      }
    };

    loadFilteredVoices();
  }, [
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    campaignFormat, // 🎯 Campaign format IS in dependencies - good!
    availableLanguages.length,
    hasRegions,
    // setSelectedProvider is stable and doesn't need to be in dependencies
  ]);

  // 🔥 Provider reset on language/region/accent change - enables server auto-selection
  const previousLanguageRef = useRef(selectedLanguage);
  const previousRegionRef = useRef(selectedRegion);
  const previousAccentRef = useRef(selectedAccent);
  useEffect(() => {
    console.count("🔥 brief:provider-reset"); // 🧪 DEMON DIAGNOSTIC

    // Check what actually changed
    const languageChanged = previousLanguageRef.current !== selectedLanguage;
    const regionChanged = previousRegionRef.current !== selectedRegion;
    const accentChanged = previousAccentRef.current !== selectedAccent;

    // Only reset provider when filters ACTUALLY change, not on initial mount
    if (languageChanged || regionChanged || accentChanged) {
      console.log(
        `🔄 Filter changed: language(${previousLanguageRef.current} → ${selectedLanguage}) region(${previousRegionRef.current} → ${selectedRegion}) accent(${previousAccentRef.current} → ${selectedAccent}), resetting provider to "any"`
      );

      // Update refs
      previousLanguageRef.current = selectedLanguage;
      previousRegionRef.current = selectedRegion;
      previousAccentRef.current = selectedAccent;

      // Reset provider to trigger auto-selection
      if (selectedProvider !== "any") {
        setSelectedProvider("any");
      }
    }
  }, [
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    setSelectedProvider,
  ]);

  // 🎯 AI Model auto-selection for Chinese language - intelligent model matching
  useEffect(() => {
    console.count("🔥 brief:ai-model-selection"); // 🧪 DEMON DIAGNOSTIC

    const isChineseLanguage =
      selectedLanguage === "zh" || selectedLanguage.startsWith("zh-");

    // Check if we should auto-select for Chinese
    if (isChineseLanguage) {
      // Only switch if currently using a non-Chinese model
      const chineseModels = ["moonshot", "qwen"];
      const isUsingChineseModel = chineseModels.includes(selectedAiModel);

      if (!isUsingChineseModel) {
        const availableModels = aiModelOptions.map((option) => option.value);
        const suggestedModel = selectAIModelForLanguage(
          selectedLanguage,
          availableModels
        );

        if (suggestedModel && suggestedModel !== selectedAiModel) {
          console.log(
            `🎯 Auto-selecting AI model "${suggestedModel}" for Chinese language`
          );
          setSelectedAiModel(suggestedModel);
        }
      }
    } else {
      // For non-Chinese languages, switch away from Chinese models if needed
      const chineseModels = ["moonshot", "qwen"];
      const isUsingChineseModel = chineseModels.includes(selectedAiModel);

      if (isUsingChineseModel) {
        const availableModels = aiModelOptions.map((option) => option.value);
        const suggestedModel = selectAIModelForLanguage(
          selectedLanguage,
          availableModels
        );

        if (suggestedModel && suggestedModel !== selectedAiModel) {
          console.log(
            `🎯 Auto-selecting AI model "${suggestedModel}" for non-Chinese language`
          );
          setSelectedAiModel(suggestedModel);
        }
      }
    }
  }, [selectedLanguage, selectedAiModel, setSelectedAiModel, aiModelOptions]);

  // 🗡️ REMOVED: Client-side getFilteredVoices() - now using server-side filtering!

  // 🔍 DEBUG: Voice count math investigation
  useEffect(() => {
    console.count("🔥 brief:debug-counts"); // 🧪 DEMON DIAGNOSTIC
    if (availableProviders.length > 0) {
      const totalCount = availableProviders.reduce(
        (sum, p) => sum + p.count,
        0
      );
      console.log(`🔍 Available providers debug:`, {
        providers: availableProviders,
        totalCount,
        individualCounts: availableProviders
          .map((p) => `${p.provider}: ${p.count}`)
          .join(", "),
      });
    }
  }, [availableProviders]);

  // Only show helpful warnings, don't force changes - now using server data
  const shouldWarnAboutDialog =
    serverFilteredVoices.dialogWarning && campaignFormat === "dialog";
  const shouldSuggestProvider =
    availableProviders.length > 0 &&
    availableProviders.find((p) => p.provider === selectedProvider)?.count ===
      0;

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!availableLanguages || availableLanguages.length === 0) return [];
    if (languageQuery === "") return availableLanguages;
    return availableLanguages.filter(
      (lang) =>
        lang &&
        lang.name &&
        lang.name.toLowerCase().includes(languageQuery.toLowerCase())
    );
  }, [languageQuery, availableLanguages]);

  /**
   * 🔥 SURGICAL FIX: Just-in-time provider resolution
   * If user selected "any", resolve to actual provider before LLM generation
   * This prevents mixed providers and ensures clean project saving
   */
  const resolveProviderForGeneration = async (): Promise<{
    provider: Provider;
    voices: Voice[];
  }> => {
    if (selectedProvider !== "any") {
      // Already specific provider - use as-is
      return {
        provider: selectedProvider,
        voices: serverFilteredVoices.voices as Voice[],
      };
    }

    // Provider is "any" - need to resolve it server-side
    console.log("🎯 Resolving 'any' provider for generation...");

    try {
      const url = new URL("/api/voice-catalogue", window.location.origin);
      url.searchParams.set("operation", "filtered-voices");
      url.searchParams.set("language", selectedLanguage);
      url.searchParams.set("provider", "any"); // Explicitly send "any"
      url.searchParams.set("campaignFormat", campaignFormat);

      // Add region/accent if specified
      if (
        selectedRegion &&
        selectedRegion !== "all" &&
        availableRegions.length > 0
      ) {
        url.searchParams.set("region", selectedRegion);
      }
      if (selectedAccent && selectedAccent !== "neutral") {
        url.searchParams.set("accent", selectedAccent);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to resolve provider: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.selectedProvider) {
        console.log(
          `🎯 Resolved provider: ${data.selectedProvider} (${data.count} voices)`
        );

        // Update UI state so user sees which provider was chosen
        setSelectedProvider(data.selectedProvider);

        return {
          provider: data.selectedProvider,
          voices: data.voices as Voice[],
        };
      } else {
        // Fallback - should not happen with current server logic
        console.warn(
          "Server did not auto-select provider, falling back to current state"
        );
        return {
          provider: selectedProvider,
          voices: serverFilteredVoices.voices as Voice[],
        };
      }
    } catch (error) {
      console.error("Error resolving provider:", error);
      // Fallback to current state
      return {
        provider: selectedProvider,
        voices: serverFilteredVoices.voices as Voice[],
      };
    }
  };

  // 🚀 Validation helper for both generation modes
  const validateInputs = () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return false;
    }
    return true;
  };

  const handleGenerateCreativeAuto = async () => {
    if (!validateInputs()) return;
    return handleGenerateCreativeAutoMode();
  };

  const handleGenerateCreativeManual = async () => {
    if (!validateInputs()) return;
    return handleGenerateCreativeManualMode();
  };

  const handleGenerateCreativeManualMode = async () => {
    setIsGenerating(true);
    setIsGeneratingCreative(true);
    setError(null);

    try {
      // 🔥 SURGICAL FIX: Resolve provider just-in-time before generation
      const { provider: providerToUse, voices: voicesToUse } =
        await resolveProviderForGeneration();

      console.log(
        `🎯 Sending ${voicesToUse.length} ${providerToUse} voices to LLM`
      );

      const jsonResponse = await generateCreativeCopy(
        selectedAiModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        voicesToUse,
        adDuration,
        providerToUse,
        selectedRegion || undefined,
        selectedAccent || undefined,
        selectedCTA,
        selectedPacing
      );

      const { voiceSegments, musicPrompt, soundFxPrompts } =
        parseCreativeJSON(jsonResponse);

      if (voiceSegments.length === 0) {
        throw new Error("No voice segments found in response");
      }

      const segments = voiceSegments.map((segment) => ({
        voiceId: segment.voice?.id || "",
        text: segment.text,
        style: segment.style,
        useCase: segment.useCase,
        voiceInstructions: segment.voiceInstructions,
      }));

      onGenerateCreative(segments, musicPrompt || "", soundFxPrompts, voicesToUse);
    } catch (error) {
      console.error("Error generating creative:", error);
      setError(
        error instanceof Error ? error.message : "Failed to generate creative"
      );
    } finally {
      setIsGenerating(false);
      setIsGeneratingCreative(false);
    }
  };

  // 🚀 AUTO MODE: Generate creative + trigger parallel voice/music/soundfx generation
  const handleGenerateCreativeAutoMode = async () => {
    setIsGenerating(true);
    setIsGeneratingCreative(true);
    setError(null);

    try {
      // 🔥 SURGICAL FIX: Resolve provider just-in-time before generation
      const { provider: providerToUse, voices: voicesToUse } =
        await resolveProviderForGeneration();

      console.log(
        `🚀 AUTO MODE: Sending ${voicesToUse.length} ${providerToUse} voices to LLM`
      );

      const jsonResponse = await generateCreativeCopy(
        selectedAiModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        voicesToUse,
        adDuration,
        providerToUse,
        selectedRegion || undefined,
        selectedAccent || undefined,
        selectedCTA,
        selectedPacing
      );

      const { voiceSegments, musicPrompt, soundFxPrompts } =
        parseCreativeJSON(jsonResponse);

      if (voiceSegments.length === 0) {
        throw new Error("No voice segments found in response");
      }

      const segments = voiceSegments.map((segment) => ({
        voiceId: segment.voice?.id || "",
        text: segment.text,
        style: segment.style,
        useCase: segment.useCase,
        voiceInstructions: segment.voiceInstructions,
      }));

      // Step 2: Trigger AUTO mode with parallel generation
      console.log(
        "🚀 AUTO MODE: Triggering parallel voice + music + soundfx generation"
      );
      onGenerateCreativeAuto(segments, musicPrompt || "", soundFxPrompts, voicesToUse);
    } catch (error) {
      console.error("Error in AUTO mode generation:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to generate creative in AUTO mode"
      );
    } finally {
      setIsGenerating(false);
      setIsGeneratingCreative(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 text-white">
      {/* Header with Generate button */}
      <div className="flex justify-between items-start mt-8 mb-16">
        <div>
          <h1 className="text-4xl font-black mb-2">Let&apos;s Start Cooking</h1>
          <p>
            Describe your client, audience, and message. This helps us craft the
            perfect voice for your campaign.
          </p>
        </div>
        <SplitGenerateButton
          onAutoGenerate={handleGenerateCreativeAuto}
          onManualGenerate={handleGenerateCreativeManual}
          disabled={
            !clientDescription ||
            !creativeBrief ||
            serverFilteredVoices.count === 0 ||
            isLoadingFilteredVoices
          }
          isGenerating={isGenerating}
          autoMode={autoModeEnabled}
          onAutoModeChange={setAutoModeEnabled}
        />
      </div>

      {/* Row 1: Client Description and Creative Brief */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Column 1: Client Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            What are we promoting (brand name, product, service)?
          </label>
          <GlassyTextarea
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            placeholder="Describe the client, product, or service..."
            rows={6}
          />
        </div>

        {/* Column 2: Creative Brief */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Creative Brief (description of the ad)
          </label>
          <GlassyTextarea
            value={creativeBrief}
            onChange={(e) => setCreativeBrief(e.target.value)}
            placeholder="Describe the creative direction, key messages, and target audience..."
            rows={6}
          />
        </div>
      </div>

      {/* Row 2: Voice Selection */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Column 1: Language, Region, Accent */}
        <div className="space-y-4">
          {/* Language */}
          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              Language
              <span className="text-ml text-gray-600 pr-6">
                {getFlagCode(selectedLanguage)}
              </span>
            </label>
            <GlassyCombobox
              value={
                availableLanguages.find((l) => l.code === selectedLanguage)
                  ? {
                      value: selectedLanguage,
                      label: availableLanguages.find(
                        (l) => l.code === selectedLanguage
                      )!.name,
                      flag: getFlagCode(selectedLanguage),
                    }
                  : null
              }
              onChange={(item) =>
                item && setSelectedLanguage(item.value as Language)
              }
              options={filteredLanguages
                .filter((lang) => lang && lang.code && lang.name)
                .map((lang) => ({
                  value: lang.code,
                  label: lang.name,
                  flag: getFlagCode(lang.code),
                }))}
              onQueryChange={setLanguageQuery}
              disabled={isLoading}
            />
          </div>

          {/* Region - only shown for languages with regional variations */}
          {hasRegions && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Region
              </label>
              <GlassyListbox
                value={selectedRegion || "all"}
                onChange={(value) => setSelectedRegion(value || null)}
                options={availableRegions.map((r) => ({
                  value: r.code,
                  label: r.displayName,
                }))}
                disabled={isLoading || availableRegions.length === 0}
              />
            </div>
          )}

          {/* Accent - only shown when there are multiple accents available */}
          {hasAccents && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Accent
              </label>
              <GlassyListbox
                value={selectedAccent}
                onChange={setSelectedAccent}
                options={availableAccents.map((a) => ({
                  value: a.code,
                  label: a.displayName,
                }))}
                disabled={isLoading || availableAccents.length === 0}
              />
            </div>
          )}

          {/* Voice Cache Refresh */}
          <RefreshVoiceCache />
        </div>

        {/* Column 2: Ad Format */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Ad Format
            </label>
            <GlassyOptionPicker
              options={campaignFormatOptions}
              value={campaignFormat}
              onChange={setCampaignFormat}
            />
            {shouldWarnAboutDialog && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠️ {serverFilteredVoices.dialogWarning}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: CTA and Duration */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Column 1: Call to Action */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Call to Action (CTA)
          </label>
          <GlassyListbox
            value={selectedCTA || "none"}
            onChange={(value) => setSelectedCTA(value === "none" ? null : value)}
            options={[
              { value: "none", label: "No specific CTA" },
              { value: "apply-now", label: "Apply now" },
              { value: "book-now", label: "Book now" },
              { value: "buy-now", label: "Buy now" },
              { value: "buy-tickets", label: "Buy tickets" },
              { value: "click-now", label: "Click now" },
              { value: "download", label: "Download" },
              { value: "find-stores", label: "Find stores" },
              { value: "get-coupon", label: "Get coupon" },
              { value: "get-info", label: "Get info" },
              { value: "learn-more", label: "Learn more" },
              { value: "listen-now", label: "Listen now" },
              { value: "more-info", label: "More info" },
              { value: "order-now", label: "Order now" },
              { value: "pre-save", label: "Pre-save" },
              { value: "save-now", label: "Save now" },
              { value: "share", label: "Share" },
              { value: "shop-now", label: "Shop now" },
              { value: "sign-up", label: "Sign up" },
              { value: "visit-profile", label: "Visit profile" },
              { value: "visit-site", label: "Visit site" },
              { value: "watch-now", label: "Watch now" },
            ]}
            disabled={isLoading}
          />
        </div>

        {/* Column 2: Duration and Pacing (split) */}
        <div className="grid grid-cols-3 gap-6">
          {/* Duration (2/3 width) */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Ad Duration{" "}
              <span className="text-sm text-gray-400">
                {adDuration} seconds
              </span>
            </label>
            <GlassySlider
              label={null}
              value={adDuration}
              onChange={setAdDuration}
              min={10}
              max={60}
              step={5}
              tickMarks={[
                { value: 10, label: "10s" },
                { value: 15, label: "15s" },
                { value: 20, label: "20s" },
                { value: 25, label: "25s" },
                { value: 30, label: "30s" },
                { value: 35, label: "35s" },
                { value: 40, label: "40s" },
                { value: 45, label: "45s" },
                { value: 50, label: "50s" },
                { value: 55, label: "55s" },
                { value: 60, label: "60s" },
              ]}
            />

            {/* Spotify Compliance Warning */}
            <div className="mt-3 text-xs text-gray-500">
              Spotify: Standard ads max 30s. Long-form (60s) in select markets only.
              {adDuration > 30 && (
                <span className="text-red-900 ml-1">
                  Duration exceeds 30s standard.
                </span>
              )}
            </div>
          </div>

          {/* Pacing (1/3 width) */}
          <div className="col-span-1">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Pacing
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedPacing(selectedPacing === "slow" ? null : "slow")}
                className={`flex-1 flex items-center justify-center px-3 py-2 rounded-lg border transition-all ${
                  selectedPacing === "slow"
                    ? "bg-white/10 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/8 hover:border-white/20"
                }`}
                title="Slow pacing - Deliberate, thoughtful delivery"
              >
                <TurtleIcon />
              </button>
              <button
                type="button"
                onClick={() => setSelectedPacing(selectedPacing === "fast" ? null : "fast")}
                className={`flex-1 flex items-center justify-center px-3 py-2 rounded-lg border transition-all ${
                  selectedPacing === "fast"
                    ? "bg-white/10 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/8 hover:border-white/20"
                }`}
                title="Fast pacing - Energetic, urgent delivery"
              >
                <RabbitIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Voice Provider and AI Model */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Column 1: Voice Provider */}
        <div>
          <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
            Voice Provider
            <span className="text-xs text-gray-500 pt-2">
              {isLoadingFilteredVoices
                ? "Loading..."
                : selectedProvider === "any"
                ? `${
                    availableProviders.find((p) => p.provider === "any")
                      ?.count || 0
                  } voices available`
                : `${serverFilteredVoices.count} voices available`}
              {hasRegions && selectedRegion && selectedRegion !== "all" && (
                <>
                  {" "}
                  •{" "}
                  {availableRegions.find((r) => r.code === selectedRegion)
                    ?.displayName || selectedRegion}
                </>
              )}
              {hasAccents && <> • {selectedAccent} accent</>}
            </span>
          </label>
          <GlassyListbox
            value={selectedProvider}
            onChange={setSelectedProvider}
            options={[
              {
                value: "any",
                label: "Any Provider - We will pick the best option for you",
              },
              {
                value: "elevenlabs",
                label: "ElevenLabs - Good quality of real actor voices",
              },
              {
                value: "openai",
                label: "OpenAI - Natural sounding voices with good accents",
              },
              {
                value: "lovo",
                label: "Lovo - Broad coverage but robotic quality",
              },
              {
                value: "qwen",
                label: "Qwen - Chinese AI voices optimized for Mandarin",
              },
              {
                value: "bytedance",
                label: "ByteDance - Chinese TTS with Cantonese support",
              },
            ]
              .filter((option) =>
                availableProviders.some((p) => p.provider === option.value)
              )
              .map((option) => {
                const providerData = availableProviders.find(
                  (p) => p.provider === option.value
                );
                const voiceCount = providerData?.count || 0;

                return {
                  ...option,
                  value: option.value as Provider,
                  label:
                    option.value === "any"
                      ? `${option.label} (${
                          availableProviders.find((p) => p.provider === "any")
                            ?.count || 0
                        } voices)`
                      : `${option.label} (${voiceCount} voices)`,
                  disabled: voiceCount === 0 && option.value !== "any",
                };
              })}
            disabled={isLoading}
          />
          {shouldSuggestProvider && (
            <p className="text-xs text-orange-400 mt-1">
              💡 Try{" "}
              {availableProviders.find((p) => p.count > 0)?.provider ||
                "another provider"}{" "}
              -{" "}
              {availableProviders.find((p) => p.provider === selectedProvider)
                ?.count || 0}{" "}
              voices for this region
            </p>
          )}
          {/* Error message */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Column 2: AI Model */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            AI Model Used for Generation of Creatives
          </label>
          <GlassyListbox
            value={selectedAiModel}
            onChange={setSelectedAiModel}
            options={aiModelOptions.map((option) => ({
              value: option.value,
              label: `${option.label}${
                option.description ? ` - ${option.description}` : ""
              }`,
            }))}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
