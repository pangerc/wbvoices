import React, { useState, useMemo, useEffect } from "react";
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
import { useRegionConfig } from "@/hooks/useRegionConfig";
import {
  GlassyTextarea,
  GlassyListbox,
  GlassyOptionPicker,
  GlassySlider,
  GlassyCombobox,
  GenerateButton,
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
    label: "GPT-4.1",
    description: "Largest GPT model for creative tasks",
    badge: "Recommended",
  },
  {
    value: "gpt5" as AIModel,
    label: "GPT-5",
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
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");

  // 🔥 NEW: Server-filtered voices to replace client-side getFilteredVoices()
  const [serverFilteredVoices, setServerFilteredVoices] = useState<{
    voices: unknown[];
    count: number;
    dialogReady?: boolean;
    dialogWarning?: string;
  }>({
    voices: [],
    count: 0,
  });
  const [isLoadingFilteredVoices, setIsLoadingFilteredVoices] = useState(false);

  // Get region configuration
  const regionConfig = useRegionConfig();

  // Filter AI models based on region
  const aiModelOptions = useMemo(() => {
    if (!regionConfig.config) {
      // Default to all models while loading
      return allAiModelOptions;
    }

    const { availableAIModels } = regionConfig.config;
    return allAiModelOptions.filter((option) =>
      availableAIModels.includes(option.value)
    );
  }, [regionConfig.config]);

  const {
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    availableLanguages,
    availableRegions,
    availableAccents,
    availableProviders,
    currentVoices,
    isLoading,
    hasRegions,
    hasAccents,
    setSelectedLanguage,
    setSelectedRegion,
    setSelectedAccent,
    setSelectedProvider,
  } = voiceManager;

  // 🔥 NEW: Load server-filtered voices when filter criteria change
  useEffect(() => {
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

        // Set provider if not "any"
        if (selectedProvider && selectedProvider !== "any") {
          url.searchParams.set("provider", selectedProvider);
        }

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
            `✅ Loaded ${data.count} server-filtered voices for ${selectedLanguage}`
          );
          setServerFilteredVoices({
            voices: data.voices || [],
            count: data.count || 0,
            dialogReady: data.dialogReady,
            dialogWarning: data.dialogWarning,
          });
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
    campaignFormat,
    availableLanguages.length,
    hasRegions,
  ]);

  // 🗡️ REMOVED: Client-side getFilteredVoices() - now using server-side filtering!

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

  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    // Auto-select provider if still set to "any" BEFORE generating
    let providerToUse = selectedProvider;

    if (selectedProvider === "any" && currentVoices.length > 0) {
      providerToUse = voiceManager.autoSelectProvider(campaignFormat);
    }

    // 🔥 NEW: Use server-filtered voices instead of client-side filtering
    const voicesToUse = serverFilteredVoices.voices as Voice[];

    setIsGenerating(true);
    setError(null);

    try {
      // Use the correct voices for the selected provider
      const filteredVoices = voicesToUse;

      console.log(
        `🎯 Sending ${filteredVoices.length} ${providerToUse} voices to LLM`
      );

      const jsonResponse = await generateCreativeCopy(
        selectedAiModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        filteredVoices,
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

  return (
    <div className="flex-1 overflow-y-auto p-8 text-white">
      {/* Header with Generate button */}
      <div className="flex justify-between items-start mt-8 mb-16">
        <div>
          <h1 className="text-4xl font-black mb-2">Let&apos;s Start Cooking</h1>
          <p>
            Describe your client, audience, and message. This helps us craft the
            perfect voice for your campaign.
          </p>
        </div>
        <GenerateButton
          onClick={handleGenerateCreative}
          disabled={
            !clientDescription ||
            !creativeBrief ||
            serverFilteredVoices.count === 0 ||
            isLoadingFilteredVoices
          }
          isGenerating={isGenerating}
          text="Generate"
          generatingText="Generating..."
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
        </div>

        {/* Column 2: Voice Provider - now expanded selection panel */}
        <div className="space-y-4">
          <div>
            <label className="flex justify-between text-sm font-medium text-gray-300 mb-2">
              Voice Provider
              <span className="text-xs text-gray-500 pt-2">
                {isLoadingFilteredVoices
                  ? "Loading..."
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
            <GlassyOptionPicker
              options={[
                {
                  value: "any",
                  label: "Any Provider",
                  description: "We will pick the best option for you",
                },
                {
                  value: "elevenlabs",
                  label: "ElevenLabs",
                  description:
                    "Good quality of real actor voices with accents, but speakers need to be handpicked on the ElevenLabs platform",
                },
                {
                  value: "openai",
                  label: "OpenAI",
                  description:
                    "Natural sounding voices with good accent simulation",
                },
                {
                  value: "lovo",
                  label: "Lovo",
                  description:
                    "Broad accent coverage, but poor robotic sounding voice quality",
                },
                {
                  value: "qwen",
                  label: "Qwen",
                  description:
                    "Chinese AI voices optimized for Mandarin and regional dialects",
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
                    badge:
                      option.value === "any"
                        ? `${serverFilteredVoices.count} voices` // 🔥 FIX: Use filtered count for consistency
                        : `${voiceCount} voices`,
                    disabled: voiceCount === 0 && option.value !== "any",
                  };
                })}
              value={selectedProvider}
              onChange={setSelectedProvider}
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
          </div>

          {/* Voice Cache Refresh */}
          <RefreshVoiceCache />

          {shouldWarnAboutDialog && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠️ {serverFilteredVoices.dialogWarning}
            </p>
          )}
        </div>
      </div>

      {/* Row 3: Campaign Format and AI Model */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Column 1: Campaign Format */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Campaign Format
          </label>
          <GlassyOptionPicker
            options={campaignFormatOptions}
            value={campaignFormat}
            onChange={setCampaignFormat}
          />
          {/* Error message */}
          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Column 2: AI Model and Duration */}
        <div className="space-y-8">
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
                  option.badge ? ` (${option.badge})` : ""
                }${option.description ? ` - ${option.description}` : ""}`,
              }))}
              disabled={isLoading}
            />
          </div>

          {/* Duration slider - now in column */}
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
    </div>
  );
}
