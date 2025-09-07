import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  CampaignFormat,
  AIModel,
  SoundFxPrompt,
  Language,
  Voice,
  Provider,
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

  // Voice manager (new interface!)
  voiceManager: VoiceManagerV2State;

  // Callbacks
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[]
  ) => void;
  onGenerateCreativeAuto: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[]
  ) => void;
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
  voiceManager,
  onGenerateCreative,
  onGenerateCreativeAuto,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");

  // 🚀 AUTO Mode state - enabled by default for B2B users
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
    console.log('🏁 BRIEF PANEL MOUNTED');
    return () => console.log('💀 BRIEF PANEL UNMOUNTED');
  }, []);

  // 🔥 NEW: Load server-filtered voices when filter criteria change
  useEffect(() => {
    console.count('🔥 brief:filtered-voices'); // 🧪 DEMON DIAGNOSTIC
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
            console.log(`🎯 Server selected provider: ${data.selectedProvider}`);
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
    console.count('🔥 brief:provider-reset'); // 🧪 DEMON DIAGNOSTIC
    
    // Check what actually changed
    const languageChanged = previousLanguageRef.current !== selectedLanguage;
    const regionChanged = previousRegionRef.current !== selectedRegion;
    const accentChanged = previousAccentRef.current !== selectedAccent;
    
    // Only reset provider when filters ACTUALLY change, not on initial mount
    if (languageChanged || regionChanged || accentChanged) {
      console.log(`🔄 Filter changed: language(${previousLanguageRef.current} → ${selectedLanguage}) region(${previousRegionRef.current} → ${selectedRegion}) accent(${previousAccentRef.current} → ${selectedAccent}), resetting provider to "any"`);
      
      // Update refs
      previousLanguageRef.current = selectedLanguage;
      previousRegionRef.current = selectedRegion;
      previousAccentRef.current = selectedAccent;
      
      // Reset provider to trigger auto-selection
      if (selectedProvider !== "any") {
        setSelectedProvider("any");
      }
    }
  }, [selectedLanguage, selectedRegion, selectedAccent, selectedProvider, setSelectedProvider]);

  // 🎯 AI Model auto-selection for Chinese language - intelligent model matching  
  useEffect(() => {
    console.count('🔥 brief:ai-model-selection'); // 🧪 DEMON DIAGNOSTIC
    
    const isChineseLanguage = selectedLanguage === 'zh' || selectedLanguage.startsWith('zh-');
    
    // Check if we should auto-select for Chinese
    if (isChineseLanguage) {
      // Only switch if currently using a non-Chinese model
      const chineseModels = ['moonshot', 'qwen'];
      const isUsingChineseModel = chineseModels.includes(selectedAiModel);
      
      if (!isUsingChineseModel) {
        const availableModels = aiModelOptions.map(option => option.value);
        const suggestedModel = selectAIModelForLanguage(selectedLanguage, availableModels);
        
        if (suggestedModel && suggestedModel !== selectedAiModel) {
          console.log(`🎯 Auto-selecting AI model "${suggestedModel}" for Chinese language`);
          setSelectedAiModel(suggestedModel);
        }
      }
    } else {
      // For non-Chinese languages, switch away from Chinese models if needed
      const chineseModels = ['moonshot', 'qwen'];
      const isUsingChineseModel = chineseModels.includes(selectedAiModel);
      
      if (isUsingChineseModel) {
        const availableModels = aiModelOptions.map(option => option.value);
        const suggestedModel = selectAIModelForLanguage(selectedLanguage, availableModels);
        
        if (suggestedModel && suggestedModel !== selectedAiModel) {
          console.log(`🎯 Auto-selecting AI model "${suggestedModel}" for non-Chinese language`);
          setSelectedAiModel(suggestedModel);
        }
      }
    }
  }, [selectedLanguage, selectedAiModel, setSelectedAiModel, aiModelOptions]);

  // 🗡️ REMOVED: Client-side getFilteredVoices() - now using server-side filtering!

  // 🔍 DEBUG: Voice count math investigation
  useEffect(() => {
    console.count('🔥 brief:debug-counts'); // 🧪 DEMON DIAGNOSTIC
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

  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    // 🚀 AUTO MODE: Choose between auto and manual generation
    if (autoModeEnabled) {
      return handleGenerateCreativeAutoMode();
    }

    // MANUAL MODE: Original behavior - just generate creative
    return handleGenerateCreativeManual();
  };

  const handleGenerateCreativeManual = async () => {
    setIsGenerating(true);
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
        selectedAccent || undefined
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

      onGenerateCreative(segments, musicPrompt || "", soundFxPrompts);
    } catch (error) {
      console.error("Error generating creative:", error);
      setError(
        error instanceof Error ? error.message : "Failed to generate creative"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // 🚀 AUTO MODE: Generate creative + trigger parallel voice/music/soundfx generation
  const handleGenerateCreativeAutoMode = async () => {
    setIsGenerating(true);
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
        selectedAccent || undefined
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
      onGenerateCreativeAuto(segments, musicPrompt || "", soundFxPrompts);
    } catch (error) {
      console.error("Error in AUTO mode generation:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to generate creative in AUTO mode"
      );
    } finally {
      setIsGenerating(false);
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
          onClick={handleGenerateCreative}
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

        {/* Column 2: Ad Format + Duration */}
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

          {/* Duration slider */}
          <div>
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
              max={90}
              step={5}
              tickMarks={[
                { value: 10, label: "10s" },
                { value: 20, label: "20s" },
                { value: 30, label: "30s" },
                { value: 40, label: "40s" },
                { value: 50, label: "50s" },
                { value: 60, label: "60s" },
                { value: 70, label: "70s" },
                { value: 80, label: "80s" },
                { value: 90, label: "90s" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Row 3: Voice Provider and AI Model */}
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
