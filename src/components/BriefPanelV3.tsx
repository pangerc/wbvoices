import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import {
  CampaignFormat,
  Language,
  Pacing,
  ProjectBrief,
  Provider,
} from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefPanelBase } from "./BriefPanelBase";
import { ProviderSelectionModal } from "./ui";
import type { ToneOption } from "./ui/ToneSelector";
import { useToneOfVoice } from "@/hooks/useToneOfVoice";

/**
 * BRIEF PANEL V3 - REDIS-FIRST!
 *
 * Clean, minimal component that writes directly to Redis version streams.
 * No FormManager, no debounced saves, no dual state management.
 *
 * Flow:
 * 1. User fills form
 * 2. Click Generate â†’ Call LLM
 * 3. Parse JSON response
 * 4. POST drafts directly to Redis via APIs
 * 5. Notify parent via callback
 */

// SSE event types for stream updates
export type StreamUpdateEvent =
  | {
      stream: "drafts";
      drafts: { voices?: string; music?: string; sfx?: string };
      adName: string;
    }
  | {
      stream: "voices";
      status: "generating" | "ready" | "failed";
      index: number;
      total?: number;
      url?: string;
      error?: string;
    }
  | {
      stream: "music";
      status: "generating" | "ready" | "failed";
      url?: string;
      error?: string;
    }
  | {
      stream: "sfx";
      status: "generating" | "ready" | "failed";
      index: number;
      total?: number;
      url?: string;
      error?: string;
    }
  | { stream: "complete"; success: boolean };

export type BriefPanelV3Props = {
  // Trigger ad auto-generation. Used when duplicating the ad
  autoGenerate: boolean;

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
  autoGenerate,
  adId,
  initialBrief,
  onDraftsCreated,
  onGeneratingChange,
  autoGenerateAudio = false,
  onStreamUpdate,
}: BriefPanelV3Props) {
  // Form state - initialized from initialBrief if provided
  const [clientDescription, setClientDescription] = useState(
    initialBrief?.clientDescription || "",
  );
  const [creativeBrief, setCreativeBrief] = useState(
    initialBrief?.creativeBrief || "",
  );
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(
    initialBrief?.campaignFormat || "ad_read",
  );
  const [adDuration, setAdDuration] = useState(initialBrief?.adDuration || 30);
  const [selectedCTA, setSelectedCTA] = useState<string | null>(
    initialBrief?.selectedCTA || null,
  );
  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(
    initialBrief?.selectedPacing || null,
  );
  const [selectedTone, setSelectedTone] = useState<string | null>(
    initialBrief?.selectedTone || null,
  );
  const [voiceInstructions, setVoiceInstructions] = useState<string>(
    initialBrief?.voiceInstructions || "",
  );

  const { dbToneOptions, dbToneInstructions } = useToneOfVoice();

  // Voice selection state (local - replaces voiceManager)
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    initialBrief?.selectedLanguage || "en",
  );
  const [selectedRegion, setSelectedRegion] = useState<string | null>(
    initialBrief?.selectedRegion || null,
  );
  const [selectedAccent, setSelectedAccent] = useState<string>(
    initialBrief?.selectedAccent || "neutral",
  );
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    initialBrief?.selectedProvider || "any",
  );

  // Static data (loaded once on mount)
  const { languages: availableLanguages, isLoading: isLoadingLanguages } =
    useBriefOptions();

  // Language-dependent options (single API call when language/format/region/provider/accent changes)
  // Region filters accents, provider/accent determine dialogReady
  const { options: languageOptions, isLoading: isLoadingOptions } =
    useLanguageOptions(
      selectedLanguage,
      campaignFormat,
      selectedRegion,
      selectedProvider,
      selectedAccent,
    );

  // Derived state from languageOptions
  const availableAccents = languageOptions?.accents || [];
  const voiceCounts = languageOptions?.voiceCounts || {
    elevenlabs: 0,
    lovo: 0,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    lahajati: 0,
    any: 0,
  };
  const isLoading = isLoadingLanguages || isLoadingOptions;

  // Track if initialBrief has been loaded (for auto-save skip on first render)
  const initialBriefLoadedRef = useRef(false);

  // Update form state when initialBrief loads or changes (e.g., after generation)
  useEffect(() => {
    if (initialBrief) {
      // Mark as loaded for auto-save logic
      initialBriefLoadedRef.current = true;

      // Update all form fields from initialBrief
      if (initialBrief.clientDescription)
        setClientDescription(initialBrief.clientDescription);
      if (initialBrief.creativeBrief)
        setCreativeBrief(initialBrief.creativeBrief);
      if (initialBrief.campaignFormat)
        setCampaignFormat(initialBrief.campaignFormat);
      if (initialBrief.adDuration) setAdDuration(initialBrief.adDuration);
      if (initialBrief.selectedCTA !== undefined)
        setSelectedCTA(initialBrief.selectedCTA);
      if (initialBrief.selectedPacing !== undefined)
        setSelectedPacing(initialBrief.selectedPacing);
      if (initialBrief.selectedTone !== undefined)
        setSelectedTone(initialBrief.selectedTone);
      if (initialBrief.voiceInstructions !== undefined) {
        setVoiceInstructions(initialBrief.voiceInstructions || "");
      }
      // Voice selection state
      if (initialBrief.selectedLanguage)
        setSelectedLanguage(initialBrief.selectedLanguage);
      if (initialBrief.selectedRegion)
        setSelectedRegion(initialBrief.selectedRegion);
      if (initialBrief.selectedAccent)
        setSelectedAccent(initialBrief.selectedAccent);
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
        selectedTone: selectedTone || null,
        voiceInstructions: voiceInstructions.trim() || null,
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
    adId,
    clientDescription,
    creativeBrief,
    campaignFormat,
    adDuration,
    selectedCTA,
    selectedPacing,
    selectedTone,
    voiceInstructions,
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
  ]);

  // Auto-save brief when form values change (debounced)
  useEffect(() => {
    // CRITICAL: Don't save until we know the initial state
    // undefined = still loading from parent, null = no existing brief, object = brief loaded
    if (initialBrief === undefined) {
      return; // Still loading, don't overwrite Redis with defaults
    }

    // Skip if no content and we haven't loaded anything yet
    if (
      !initialBriefLoadedRef.current &&
      !clientDescription &&
      !creativeBrief
    ) {
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
    clientDescription,
    creativeBrief,
    campaignFormat,
    adDuration,
    selectedCTA,
    selectedPacing,
    selectedTone,
    voiceInstructions,
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    saveBriefToRedis,
  ]);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const alreadyAutoSelected =
      lastAutoSelectedLanguageRef.current === selectedLanguage;

    if (
      optionsMatchLanguage &&
      languageOptions?.suggestedProvider &&
      !alreadyAutoSelected
    ) {
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
      const accentStillAvailable = availableAccents.some(
        (a) => a.code === selectedAccent,
      );
      if (!accentStillAvailable) {
        setSelectedAccent("neutral");
      }
    }
  }, [availableAccents, selectedAccent]);

  /**
   * Parse SSE events from text chunk
   */
  const parseSSEEvents = (
    text: string,
  ): Array<{ type: string; data: Record<string, unknown> }> => {
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
  const handleGenerationEvent = (event: {
    type: string;
    data: Record<string, unknown>;
  }) => {
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
        const { drafts, adName } = event.data as {
          drafts: { voices?: string; music?: string; sfx?: string };
          adName: string;
        };
        // LLM is done, now generating audio
        setGeneratingCreative(false);
        // Notify parent to invalidate SWR and update UI
        onDraftsCreated?.({ ...drafts, adName });
        onStreamUpdate?.({ stream: "drafts", drafts, adName });
        break;
      }

      case "voice-generating": {
        const { index, total, versionId } = event.data as {
          index: number;
          total: number;
          versionId: string;
        };
        setGeneratingVoice(true, index, versionId);
        onStreamUpdate?.({
          stream: "voices",
          status: "generating",
          index,
          total,
        });
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
      console.log(
        `🚀 Starting V3 generation for ad ${adId} (autoGenerateAudio: ${autoGenerateAudio})`,
      );

      const requestBody = {
        adId,
        language: selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        duration: adDuration,
        region: selectedRegion || undefined,
        accent: selectedAccent || undefined,
        cta: selectedCTA,
        pacing: selectedPacing,
        tone: selectedTone,
        voiceInstructions: voiceInstructions.trim() || null,
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

        console.log(`âœ… SSE generation complete for ad ${adId}`);
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
        error instanceof Error ? error.message : "Failed to generate creative",
      );
    } finally {
      setIsGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  useEffect(() => {
    if (autoGenerate) {
      handleGenerateCreative();
    }
  }, [autoGenerate]);

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

      <BriefPanelBase
        clientDescription={clientDescription}
        onClientDescriptionChanged={setClientDescription}
        creativeBrief={creativeBrief}
        onCreativeBriefChanged={setCreativeBrief}
        language={selectedLanguage}
        onLanguageChanged={setSelectedLanguage}
        campaignFormat={campaignFormat}
        onCampaignFormatChanged={setCampaignFormat}
        region={selectedRegion}
        onRegionChanged={setSelectedRegion}
        provider={selectedProvider}
        onProviderChanged={setSelectedProvider}
        accent={selectedAccent}
        onAccentChanged={setSelectedAccent}
        cta={selectedCTA}
        onCTAChanged={setSelectedCTA}
        pacing={selectedPacing}
        onPacingChanged={setSelectedPacing}
        toneOfVoice={selectedTone}
        onToneOfVoiceChanged={setSelectedTone}
        toneOfVoiceOptions={dbToneOptions}
        toneOfVoiceList={dbToneInstructions}
        voiceInstructions={voiceInstructions}
        onVoiceInstructionsChanged={setVoiceInstructions}
        adDuration={adDuration}
        onAdDurationChanged={setAdDuration}
        error={error}
      />

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
