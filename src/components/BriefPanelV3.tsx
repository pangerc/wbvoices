import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  CampaignFormat,
  Language,
  Provider,
  Pacing,
  ProjectBrief,
} from "@/types";
import { getFlagCode } from "@/utils/language";
import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";
import {
  GlassyTextarea,
  GlassyListbox,
  GlassySlider,
  GlassyCombobox,
  ProviderSelectionModal,
  DialogueIcon,
  SingleVoiceIcon,
  TurtleIcon,
  RabbitIcon,
} from "./ui";
import { ArrowTopRightOnSquareIcon, MicrophoneIcon } from "@heroicons/react/24/outline";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";

// Constants extracted from JSX for better readability
const CTA_OPTIONS = [
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
];

const DURATION_TICK_MARKS = [
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
];

/**
 * BRIEF PANEL V3 - REDIS-FIRST!
 *
 * Clean, minimal component that writes directly to Redis version streams.
 * No FormManager, no debounced saves, no dual state management.
 *
 * Flow:
 * 1. User fills form
 * 2. Click Generate → Call LLM
 * 3. Parse JSON response
 * 4. POST drafts directly to Redis via APIs
 * 5. Notify parent via callback
 */

// SSE event types for stream updates
export type StreamUpdateEvent =
  | { stream: "drafts"; drafts: { voices?: string; music?: string; sfx?: string }; adName: string }
  | { stream: "voices"; status: "generating" | "ready" | "failed"; index: number; total?: number; url?: string; error?: string }
  | { stream: "music"; status: "generating" | "ready" | "failed"; url?: string; error?: string }
  | { stream: "sfx"; status: "generating" | "ready" | "failed"; index: number; total?: number; url?: string; error?: string }
  | { stream: "complete"; success: boolean };

export type BriefPanelV3Props = {
  // Required: which ad are we creating drafts for?
  adId: string;

  // Initial brief data from Redis (for persistence)
  initialBrief?: ProjectBrief | null;

  // Optional callback when drafts are created
  onDraftsCreated?: (result: {
    voices?: string;
    music?: string;
    sfx?: string;
    adName?: string;
  }) => void;

  // Optional callback when generation state changes (for MatrixBackground animation)
  onGeneratingChange?: (isGenerating: boolean) => void;

  // Auto-generate audio after LLM creates drafts (uses SSE streaming endpoint)
  autoGenerateAudio?: boolean;

  // Progressive update callback - called as each stream updates
  // Use this to invalidate SWR caches for immediate UI feedback
  onStreamUpdate?: (event: StreamUpdateEvent) => void;
};

export function BriefPanelV3({
  adId,
  initialBrief,
  onDraftsCreated,
  onGeneratingChange,
  autoGenerateAudio = false,
  onStreamUpdate,
}: BriefPanelV3Props) {
  // Form state - initialized from initialBrief if provided
  const [clientDescription, setClientDescription] = useState(initialBrief?.clientDescription || "");
  const [creativeBrief, setCreativeBrief] = useState(initialBrief?.creativeBrief || "");
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(initialBrief?.campaignFormat || "ad_read");
  const [adDuration, setAdDuration] = useState(initialBrief?.adDuration || 30);
  const [selectedCTA, setSelectedCTA] = useState<string | null>(initialBrief?.selectedCTA || null);
  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(initialBrief?.selectedPacing || null);

  // Voice selection state (local - replaces voiceManager)
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(initialBrief?.selectedLanguage || "en");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(initialBrief?.selectedRegion || null);
  const [selectedAccent, setSelectedAccent] = useState<string>(initialBrief?.selectedAccent || "neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>(initialBrief?.selectedProvider || "any");

  // Static data (loaded once on mount)
  const { languages: availableLanguages, isLoading: isLoadingLanguages } = useBriefOptions();

  // Language-dependent options (single API call when language/format/region/provider/accent changes)
  // Region filters accents, provider/accent determine dialogReady
  const { options: languageOptions, isLoading: isLoadingOptions } = useLanguageOptions(
    selectedLanguage,
    campaignFormat,
    selectedRegion,
    selectedProvider,
    selectedAccent
  );

  // Derived state from languageOptions
  const availableRegions = languageOptions?.regions || [];
  const availableAccents = languageOptions?.accents || [];
  const voiceCounts = languageOptions?.voiceCounts || { elevenlabs: 0, lovo: 0, openai: 0, qwen: 0, bytedance: 0, lahajati: 0, any: 0 };
  const hasRegions = languageOptions?.hasRegions ?? false;
  const hasAccents = languageOptions?.hasAccents ?? false;
  const dialogReady = languageOptions?.dialogReady ?? true;
  const isLoading = isLoadingLanguages || isLoadingOptions;

  // Track if initialBrief has been loaded (for auto-save skip on first render)
  const initialBriefLoadedRef = useRef(false);

  // Update form state when initialBrief loads or changes (e.g., after generation)
  useEffect(() => {
    if (initialBrief) {
      // Mark as loaded for auto-save logic
      initialBriefLoadedRef.current = true;

      // Update all form fields from initialBrief
      if (initialBrief.clientDescription) setClientDescription(initialBrief.clientDescription);
      if (initialBrief.creativeBrief) setCreativeBrief(initialBrief.creativeBrief);
      if (initialBrief.campaignFormat) setCampaignFormat(initialBrief.campaignFormat);
      if (initialBrief.adDuration) setAdDuration(initialBrief.adDuration);
      if (initialBrief.selectedCTA !== undefined) setSelectedCTA(initialBrief.selectedCTA);
      if (initialBrief.selectedPacing !== undefined) setSelectedPacing(initialBrief.selectedPacing);
      // Voice selection state
      if (initialBrief.selectedLanguage) setSelectedLanguage(initialBrief.selectedLanguage);
      if (initialBrief.selectedRegion) setSelectedRegion(initialBrief.selectedRegion);
      if (initialBrief.selectedAccent) setSelectedAccent(initialBrief.selectedAccent);
      // NOTE: Don't restore selectedProvider from initialBrief - let it auto-select based on language availability
    }
  }, [initialBrief]);

  // Debounced save to Redis
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveBriefToRedis = useCallback(async () => {
    try {
      const briefData: ProjectBrief = {
        clientDescription,
        creativeBrief,
        campaignFormat,
        adDuration,
        selectedCTA: selectedCTA || null,
        selectedPacing: selectedPacing || null,
        selectedLanguage,
        selectedRegion: selectedRegion || null,
        selectedAccent,
        selectedProvider,
      };

      const response = await fetch(`/api/ads/${adId}/brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefData }),
      });

      // 404 is expected for unpersisted ads (lazy creation)
      // Brief will be persisted when Generate is clicked
      if (!response.ok && response.status !== 404) {
        console.error("Failed to save brief:", response.status);
      }
    } catch (error) {
      console.error("Failed to save brief:", error);
    }
  }, [
    adId, clientDescription, creativeBrief, campaignFormat, adDuration,
    selectedCTA, selectedPacing,
    selectedLanguage, selectedRegion, selectedAccent, selectedProvider
  ]);

  // Auto-save brief when form values change (debounced)
  useEffect(() => {
    // CRITICAL: Don't save until we know the initial state
    // undefined = still loading from parent, null = no existing brief, object = brief loaded
    if (initialBrief === undefined) {
      return; // Still loading, don't overwrite Redis with defaults
    }

    // Skip if no content and we haven't loaded anything yet
    if (!initialBriefLoadedRef.current && !clientDescription && !creativeBrief) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveBriefToRedis();
    }, 1000); // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    initialBrief, // Add to deps so we re-evaluate when it loads
    clientDescription, creativeBrief, campaignFormat, adDuration,
    selectedCTA, selectedPacing,
    selectedLanguage, selectedRegion, selectedAccent, selectedProvider,
    saveBriefToRedis
  ]);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");

  // Modal state
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

  // Auto-select suggested provider when language changes (novice UX)
  // Track which language we last auto-selected provider FOR (not the previous value)
  const lastAutoSelectedLanguageRef = useRef<string | null>(null);
  useEffect(() => {
    // Only auto-select when:
    // 1. We have options that match the current language (not stale data)
    // 2. We haven't already auto-selected for this language
    const optionsMatchLanguage = languageOptions?.language === selectedLanguage;
    const alreadyAutoSelected = lastAutoSelectedLanguageRef.current === selectedLanguage;

    if (optionsMatchLanguage && languageOptions?.suggestedProvider && !alreadyAutoSelected) {
      // Mark as auto-selected FIRST to prevent re-runs during state updates
      lastAutoSelectedLanguageRef.current = selectedLanguage;

      // Batch state updates to prevent cascading re-renders and refetches
      // React 18 batches these automatically, but being explicit helps
      setSelectedProvider(languageOptions.suggestedProvider);
      setSelectedRegion(null);
      setSelectedAccent("neutral");
    }
  }, [selectedLanguage, languageOptions]);

  // Reset accent when region changes and selected accent is no longer available
  useEffect(() => {
    if (availableAccents.length > 0 && selectedAccent !== "neutral") {
      const accentStillAvailable = availableAccents.some(a => a.code === selectedAccent);
      if (!accentStillAvailable) {
        setSelectedAccent("neutral");
      }
    }
  }, [availableAccents, selectedAccent]);

  // Warnings
  const shouldWarnAboutDialog = !dialogReady && campaignFormat === "dialog";
  const shouldSuggestProvider =
    voiceCounts && (voiceCounts[selectedProvider] || 0) === 0;

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
   * Parse SSE events from text chunk
   */
  const parseSSEEvents = (text: string): Array<{ type: string; data: Record<string, unknown> }> => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const lines = text.split("\n");
    let currentEvent: { type?: string; data?: string } = {};

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent.type = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentEvent.data = line.slice(6);
      } else if (line === "" && currentEvent.type && currentEvent.data) {
        try {
          events.push({
            type: currentEvent.type,
            data: JSON.parse(currentEvent.data),
          });
        } catch {
          console.warn("Failed to parse SSE data:", currentEvent.data);
        }
        currentEvent = {};
      }
    }

    return events;
  };

  /**
   * Handle SSE event from generate-stream endpoint
   * Updates audioPlaybackStore and notifies parent
   */
  const handleGenerationEvent = (event: { type: string; data: Record<string, unknown> }) => {
    const {
      setGeneratingCreative,
      setGeneratingVoice,
      setGeneratingMusic,
      setGeneratingSfx,
    } = useAudioPlaybackStore.getState();

    switch (event.type) {
      case "llm-thinking":
        // LLM agent loop is starting
        setGeneratingCreative(true);
        break;

      case "drafts-created": {
        const { drafts, adName } = event.data as { drafts: { voices?: string; music?: string; sfx?: string }; adName: string };
        // LLM is done, now generating audio
        setGeneratingCreative(false);
        // Notify parent to invalidate SWR and update UI
        onDraftsCreated?.({ ...drafts, adName });
        onStreamUpdate?.({ stream: "drafts", drafts, adName });
        break;
      }

      case "voice-generating": {
        const { index, total, versionId } = event.data as { index: number; total: number; versionId: string };
        setGeneratingVoice(true, index, versionId);
        onStreamUpdate?.({ stream: "voices", status: "generating", index, total });
        break;
      }

      case "voice-ready": {
        const { index, url } = event.data as { index: number; url: string };
        setGeneratingVoice(false);
        onStreamUpdate?.({ stream: "voices", status: "ready", index, url });
        break;
      }

      case "voice-failed": {
        const { index, error } = event.data as { index: number; error: string };
        setGeneratingVoice(false);
        onStreamUpdate?.({ stream: "voices", status: "failed", index, error });
        break;
      }

      case "music-generating":
        setGeneratingMusic(true);
        onStreamUpdate?.({ stream: "music", status: "generating" });
        break;

      case "music-ready": {
        const { url } = event.data as { url: string };
        setGeneratingMusic(false);
        onStreamUpdate?.({ stream: "music", status: "ready", url });
        break;
      }

      case "music-failed": {
        const { error } = event.data as { error: string };
        setGeneratingMusic(false);
        onStreamUpdate?.({ stream: "music", status: "failed", error });
        break;
      }

      case "sfx-generating": {
        const { index, total } = event.data as { index: number; total: number };
        setGeneratingSfx(true);
        onStreamUpdate?.({ stream: "sfx", status: "generating", index, total });
        break;
      }

      case "sfx-ready": {
        const { index, url } = event.data as { index: number; url: string };
        // Only clear sfx generating if this is the last one (check via total in prior event)
        onStreamUpdate?.({ stream: "sfx", status: "ready", index, url });
        break;
      }

      case "sfx-failed": {
        const { index, error } = event.data as { index: number; error: string };
        onStreamUpdate?.({ stream: "sfx", status: "failed", index, error });
        break;
      }

      case "complete": {
        const { success } = event.data as { success: boolean };
        // Clear all generation states
        setGeneratingCreative(false);
        setGeneratingVoice(false);
        setGeneratingMusic(false);
        setGeneratingSfx(false);
        onStreamUpdate?.({ stream: "complete", success });
        break;
      }

      case "error": {
        const { message } = event.data as { message: string };
        setError(message);
        setGeneratingCreative(false);
        setGeneratingVoice(false);
        setGeneratingMusic(false);
        setGeneratingSfx(false);
        break;
      }
    }
  };

  /**
   * Main generation flow - V3 Tool-Calling API
   *
   * When autoGenerateAudio is false (default):
   *   Calls /api/ai/generate which runs the agent loop.
   *   LLM uses tools (search_voices, create_voice_draft, etc.) to create drafts directly.
   *
   * When autoGenerateAudio is true:
   *   Calls /api/ai/generate-stream (SSE) which creates drafts AND generates audio.
   *   Streams events for progressive UI feedback.
   */
  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    setIsGenerating(true);
    onGeneratingChange?.(true);
    setError(null);

    try {
      console.log(`🚀 Starting V3 generation for ad ${adId} (autoGenerateAudio: ${autoGenerateAudio})`);

      // Get sessionId for lazy ad creation
      const sessionId = localStorage.getItem('universal-session') || 'default-session';

      const requestBody = {
        adId,
        sessionId,
        language: selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        duration: adDuration,
        region: selectedRegion || undefined,
        accent: selectedAccent || undefined,
        cta: selectedCTA,
        pacing: selectedPacing,
        selectedProvider: selectedProvider,
        autoGenerateAudio,
      };

      if (autoGenerateAudio) {
        // SSE streaming mode
        const response = await fetch("/api/ai/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start generation");
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse complete events from buffer
          const events = parseSSEEvents(buffer);
          for (const event of events) {
            handleGenerationEvent(event);
          }

          // Keep any partial event in buffer
          const lastNewline = buffer.lastIndexOf("\n\n");
          if (lastNewline !== -1) {
            buffer = buffer.slice(lastNewline + 2);
          }
        }

        console.log(`✅ SSE generation complete for ad ${adId}`);
      } else {
        // Regular API mode (drafts only, no audio)
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate creative");
        }

        const result = await response.json();

        console.log(`✅ V3 generation complete:`, {
          conversationId: result.conversationId,
          drafts: result.drafts,
          toolCalls: result.toolCalls,
          provider: result.provider,
          adName: result.adName,
        });

        // Notify parent to reload version streams and update ad name
        onDraftsCreated?.({ ...result.drafts, adName: result.adName });
      }
    } catch (error) {
      console.error("Error generating creative:", error);
      setError(
        error instanceof Error ? error.message : "Failed to generate creative"
      );
    } finally {
      setIsGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 text-white">
      {/* Header with Generate button */}
      <div className="flex justify-between items-start mt-8 mb-16">
        <div>
          <h1 className="text-4xl font-black mb-2">Create Your Campaign</h1>
          <p>
            Describe your client, audience, and message. This helps us craft the
            perfect voice for your ads.
          </p>
        </div>
        <button
          onClick={handleGenerateCreative}
          disabled={
            !clientDescription ||
            !creativeBrief ||
            (voiceCounts.any || 0) === 0 ||
            isLoading ||
            isGenerating
          }
          className="px-6 py-3 bg-wb-blue hover:bg-wb-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {isGenerating ? "Generating..." : "Generate Creative"}
        </button>
      </div>

      {/* Row 1: Client Description and Creative Brief */}
      <div className="grid grid-cols-3 gap-6 mb-6">
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

        {/* Column 2-3: Creative Brief (spans 2 columns) */}
        <div className="col-span-2">
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

      {/* Row 2: Language, Region, Accent */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Column 1: Language */}
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

        {/* Column 2: Region */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Region
          </label>
          {hasRegions ? (
            <GlassyListbox
              value={selectedRegion || "all"}
              onChange={(value) => setSelectedRegion(value || null)}
              options={availableRegions.map((r) => ({
                value: r.code,
                label: r.displayName,
              }))}
              disabled={isLoading || availableRegions.length === 0}
              loading={isLoadingOptions}
            />
          ) : (
            <div className="bg-white/5 backdrop-blur-sm rounded-xl py-3 px-4 text-sm text-gray-400">
              No regional variations
            </div>
          )}
        </div>

        {/* Column 3: Accent */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Accent
          </label>
          {hasAccents ? (
            <GlassyListbox
              value={selectedAccent}
              onChange={setSelectedAccent}
              options={availableAccents.map((a) => ({
                value: a.code,
                label: a.displayName,
              }))}
              disabled={isLoading || availableAccents.length === 0}
              loading={isLoadingOptions}
            />
          ) : (
            <div className="bg-white/5 backdrop-blur-sm rounded-xl py-3 px-4 text-sm text-gray-400">
              No accent variations
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Ad Format, CTA, and Voice Provider */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Column 1: Ad Format */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Ad Format
          </label>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2">
            {/* Single Voice option */}
            <div
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200 ${
                campaignFormat === "ad_read"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300"
              }`}
              onClick={() => setCampaignFormat("ad_read")}
              title="Single Voice Ad Read"
            >
              <SingleVoiceIcon />
              <span className="text-xs">Single</span>
            </div>

            {/* Dialogue option */}
            <div
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200 ${
                campaignFormat === "dialog"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300"
              }`}
              onClick={() => setCampaignFormat("dialog")}
              title="Dialogue"
            >
              <DialogueIcon />
              <span className="text-xs">Dialogue</span>
            </div>
          </div>
          {shouldWarnAboutDialog && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠️ Not enough voices for dialogue - need at least 2
            </p>
          )}
        </div>

        {/* Column 2: Call to Action */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Call to Action (CTA)
          </label>
          <GlassyListbox
            value={selectedCTA || "none"}
            onChange={(value) =>
              setSelectedCTA(value === "none" ? null : value)
            }
            options={CTA_OPTIONS}
            disabled={isLoading}
          />
        </div>

        {/* Column 3: Voice Provider link */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Voice Provider
          </label>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsProviderModalOpen(true)}
              className="flex items-center gap-2 text-sm text-wb-blue hover:text-wb-blue/80 transition-colors"
            >
              <MicrophoneIcon className="h-3 w-3" />
              <span>
                {selectedProvider === "any"
                  ? "Any"
                  : selectedProvider.charAt(0).toUpperCase() +
                    selectedProvider.slice(1)}
                {" ("}
                {isLoading
                  ? "..."
                  : voiceCounts[selectedProvider] || 0}
                {")"}
              </span>
            </button>
            <a
              href="/admin/voice-manager"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              <span>Voice Manager</span>
              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          </div>
          {shouldSuggestProvider && (
            <p className="text-xs text-orange-400 mt-2">
              💡 Try another provider - {voiceCounts[selectedProvider] || 0} voices
            </p>
          )}
        </div>
      </div>

      {/* Row 4: Pacing and Duration */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Column 1: Pacing */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Pacing
          </label>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2">
            {/* Normal option */}
            <div
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200 ${
                selectedPacing === null
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300"
              }`}
              onClick={() => setSelectedPacing(null)}
              title="Normal - Standard delivery pace"
            >
              <TurtleIcon />
              <span className="text-xs">Normal</span>
            </div>

            {/* Fast option */}
            <div
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200 ${
                selectedPacing === "fast"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300"
              }`}
              onClick={() => setSelectedPacing("fast")}
              title="Fast - Energetic, urgent delivery"
            >
              <RabbitIcon />
              <span className="text-xs">Fast</span>
            </div>
          </div>
        </div>

        {/* Column 2-3: Duration (spans 2 columns) */}
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
            tickMarks={DURATION_TICK_MARKS}
          />

          {/* Spotify Compliance Warning */}
          <div className="mt-3 text-xs text-gray-500">
            Spotify: Standard ads max 30s. Long-form (60s) in select markets
            only.
            {adDuration > 30 && (
              <span className="text-red-900 ml-1">
                Duration exceeds 30s standard.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Modals */}
      <ProviderSelectionModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
        voiceCounts={voiceCounts}
      />
    </div>
  );
}
