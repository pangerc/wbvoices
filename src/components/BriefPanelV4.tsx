/**
 * BriefPanelV4 — three-topic brief panel.
 *
 * Replaces `BriefPanelV3` (deleted in this PR). Uses the same outer
 * orchestration shape — owns brief state, debounced Redis save, SSE
 * stream handling, generate trigger — but the form body is split into
 * three composable topics: Brand, Creative, Language.
 *
 * What v4 changes:
 *   - Brand topic uses /api/brand-context for SF search + greenfield
 *     recents. Implicit-on-save: picking an SF account fetches the
 *     dossier and surfaces a small "Dossier loaded" badge under the
 *     picker. No manual "Enrich" button.
 *   - Markets come from alaric's /api/markets (canonical 86-market
 *     list); the selectedRegion field is repurposed to carry alpha-2
 *     codes. Legacy non-alpha-2 values render with "(legacy)" suffix.
 *   - `creativeAngle` is exposed in the Creative topic alongside the
 *     brief — never collapsed (regression risk per project memory).
 *   - `brandVoice` retires from the form. Legacy briefs render the
 *     value read-only inside a `<details>` block at the top of Brand
 *     topic; the field is no longer sent to generation.
 *   - `enrichWithWebSearch` is dropped entirely (deprecated, no readers).
 *
 * State remains in plain useState hooks — useReducer would be marginal
 * complexity for the field count we have. Auto-save still debounces.
 */

import { useCreativeTemplates } from "@/hooks/useCreativeTemplates";
import { useToneOfVoice } from "@/hooks/useToneOfVoice";
import type { BrandDossier, MarketRow } from "@/lib/alaric-client";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import type {
  BrandRef,
  CampaignFormat,
  Pacing,
  ProjectBrief,
  Provider,
} from "@/types";
import type { Language } from "@/utils/language";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefPanelBase } from "./BriefPanelBase";

// ============================================================
// SSE event types — preserved verbatim from V3 so onStreamUpdate
// callers (ad/[id]/page.tsx) don't need to change.
// ============================================================

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

export type BriefPanelV4Props = {
  autoGenerate: boolean;
  adId: string;
  initialBrief?: ProjectBrief | null;
  onDraftsCreated?: (result: {
    voices?: string;
    music?: string;
    sfx?: string;
    adName?: string;
  }) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
  autoGenerateAudio?: boolean;
  onStreamUpdate?: (event: StreamUpdateEvent) => void;
};

export function BriefPanelV4({
  autoGenerate,
  adId,
  initialBrief,
  onDraftsCreated,
  onGeneratingChange,
  autoGenerateAudio = false,
  onStreamUpdate,
}: BriefPanelV4Props) {
  // ============================================================
  // Brief state — every field on ProjectBrief except retirements.
  // ============================================================

  const [creativeBrief, setCreativeBrief] = useState(
    initialBrief?.creativeBrief || "",
  );
  const [creativeAngle, setCreativeAngle] = useState(
    initialBrief?.creativeAngle || "",
  );
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(
    initialBrief?.campaignFormat || "ad_read",
  );
  const [adDuration, setAdDuration] = useState(initialBrief?.adDuration || 30);
  const [selectedCTA, setSelectedCTA] = useState<string | null>(
    initialBrief?.selectedCTA || null,
  );
  // Default to "fast" for new briefs (most Spotify spots run hot).
  // `??` preserves explicit `null` from existing briefs where the user
  // picked Normal — only undefined (field missing) falls through to fast.
  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(
    initialBrief?.selectedPacing ?? "fast",
  );
  const [selectedTone, setSelectedTone] = useState<string | null>(
    initialBrief?.selectedTone || null,
  );
  const [voiceInstructions, setVoiceInstructions] = useState<string>(
    initialBrief?.voiceInstructions || "",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialBrief?.selectedTemplateId || null,
  );
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
  const [referenceUrlsText, setReferenceUrlsText] = useState(
    (initialBrief?.referenceUrls || []).join("\n"),
  );
  const [forbiddenWords, setForbiddenWords] = useState(
    initialBrief?.forbiddenWords || "",
  );
  const [providedScript, setProvidedScript] = useState(
    initialBrief?.providedScript || "",
  );
  const [brand, setBrand] = useState<BrandRef | null>(() => {
    if (initialBrief?.brand) return initialBrief.brand;
    if (initialBrief?.salesforceAccountId) {
      return {
        name: "",
        salesforceAccountId: initialBrief.salesforceAccountId,
        salesforceAccountSnapshot: null,
      };
    }
    return null;
  });

  // Legacy `brandVoice` text from pre-v4 briefs — surfaced read-only.
  const legacyBrandVoice = initialBrief?.brandVoice ?? null;

  // ============================================================
  // Alaric dossier state — fetched implicit-on-save when brand picks.
  // ============================================================

  const [dossier, setDossier] = useState<BrandDossier | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState(false);
  const [enrichmentSummary, setEnrichmentSummary] = useState<
    { slotCount: number; lastEnrichedAt?: number } | undefined
  >(undefined);

  // Track which sf account id we last fetched the dossier for. Avoids
  // refetching when state churns from other field edits.
  const lastFetchedSfIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sfId = brand?.salesforceAccountId ?? null;

    if (!sfId) {
      setDossier(null);
      setEnrichmentSummary(undefined);
      lastFetchedSfIdRef.current = null;
      return;
    }

    if (lastFetchedSfIdRef.current === sfId) return;
    lastFetchedSfIdRef.current = sfId;

    const controller = new AbortController();
    setIsLoadingDossier(true);
    fetch("/api/brand-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "sf-account",
        accountId: sfId,
        ...(selectedRegion ? { marketAlpha2: selectedRegion } : {}),
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          setDossier(null);
          setEnrichmentSummary(undefined);
          return;
        }
        setDossier(data.dossier ?? null);
        setEnrichmentSummary(data.enrichmentSummary);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[BriefPanelV4] dossier fetch failed:", err);
          setDossier(null);
          setEnrichmentSummary(undefined);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDossier(false);
      });
    return () => controller.abort();
  }, [brand?.salesforceAccountId, selectedRegion]);

  // Hydrate brief state from initialBrief when it loads / changes.
  const initialBriefLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialBrief) return;
    initialBriefLoadedRef.current = true;

    if (initialBrief.creativeBrief)
      setCreativeBrief(initialBrief.creativeBrief);
    if (initialBrief.creativeAngle !== undefined)
      setCreativeAngle(initialBrief.creativeAngle || "");
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
    if (initialBrief.selectedTemplateId !== undefined)
      setSelectedTemplateId(initialBrief.selectedTemplateId);
    if (initialBrief.selectedLanguage)
      setSelectedLanguage(initialBrief.selectedLanguage);
    if (initialBrief.selectedRegion)
      setSelectedRegion(initialBrief.selectedRegion);
    if (initialBrief.selectedAccent)
      setSelectedAccent(initialBrief.selectedAccent);
    // selectedProvider is auto-derived per language — don't restore from brief.

    if (initialBrief.referenceUrls)
      setReferenceUrlsText(initialBrief.referenceUrls.join("\n"));
    if (initialBrief.forbiddenWords !== undefined)
      setForbiddenWords(initialBrief.forbiddenWords || "");
    if (initialBrief.providedScript !== undefined)
      setProvidedScript(initialBrief.providedScript || "");

    if (initialBrief.brand) {
      setBrand(initialBrief.brand);
    } else if (initialBrief.salesforceAccountId) {
      setBrand({
        name: "",
        salesforceAccountId: initialBrief.salesforceAccountId,
        salesforceAccountSnapshot: null,
      });
    } else {
      setBrand(null);
    }
  }, [initialBrief]);

  // ============================================================
  // Derived
  // ============================================================

  const parsedReferenceUrls = useMemo(
    () =>
      referenceUrlsText
        .split(/\n+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
    [referenceUrlsText],
  );

  const showAngleNudge =
    !creativeAngle.trim() &&
    !!(
      brand?.salesforceAccountId ||
      brand?.name ||
      parsedReferenceUrls.length > 0
    );

  // Tone presets from /api/tone-of-voice (admin-managed) — fall back to
  // built-in presets when the fetch fails.
  const { toneOptions, toneInstructions } = useToneOfVoice();

  const { templates: creativeTemplates, isLoading: creativeTemplatesLoading } =
    useCreativeTemplates();

  // Only non-null template defaults are applied — admin ships partial
  // guidance and we don't want to clobber brief fields with undefineds.
  // id=null is the deliberate reset path; we don't touch state on reset.
  const handleTemplateChanged = useCallback(
    (id: string | null) => {
      setSelectedTemplateId(id);
      if (!id) return;
      const template = creativeTemplates.find((t) => t.id === id);
      if (!template) return;
      if (
        template.defaultPacing === "fast" ||
        template.defaultPacing === "normal"
      ) {
        setSelectedPacing(template.defaultPacing);
      }
      if (template.defaultCta != null && template.defaultCta.trim()) {
        setSelectedCTA(template.defaultCta.trim());
      }
      if (
        typeof template.defaultDurationSeconds === "number" &&
        template.defaultDurationSeconds > 0
      ) {
        setAdDuration(template.defaultDurationSeconds);
      }
    },
    [creativeTemplates],
  );

  // ============================================================
  // Brand picker callback — sets brand AND triggers market default
  // when the picked brand carries a reportingTerritory we recognise.
  // ============================================================

  const handleBrandChanged = useCallback((next: BrandRef | null) => {
    setBrand(next);
  }, []);

  const handleMarketChanged = useCallback(
    (alpha2: string | null, market: MarketRow | null) => {
      setSelectedRegion(alpha2);
      // Default language from market.language.code IFF the user hasn't
      // already chosen a language (don't clobber). The "default" check is
      // the current `selectedLanguage` matching its initial "en" default.
      if (market && selectedLanguage === "en" && market.language.code) {
        setSelectedLanguage(market.language.code as Language);
      }
    },
    [selectedLanguage],
  );

  // useLanguageOptions lives inside LanguageTopic (it owns the language
  // pickers) but CreativeTopic also needs voiceCounts + dialogReady for
  // its provider-suggestion / dialog-format warnings. LanguageTopic
  // pushes the resolved values up via a callback; we cache them here
  // and forward to CreativeTopic.
  const [voiceCounts, setVoiceCounts] = useState<Record<Provider, number>>({
    elevenlabs: 0,
    lovo: 0,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    lahajati: 0,
    any: 0,
  });
  const [dialogReady, setDialogReady] = useState(true);
  const handleLanguageOptionsResolved = useCallback(
    (resolved: {
      voiceCounts: Record<Provider, number>;
      dialogReady: boolean;
    }) => {
      setVoiceCounts(resolved.voiceCounts);
      setDialogReady(resolved.dialogReady);
    },
    [],
  );

  // ============================================================
  // Debounced Redis save
  // ============================================================

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveBriefToRedis = useCallback(async () => {
    try {
      const briefData: ProjectBrief = {
        // clientDescription is required on the type but v4 has no UI for
        // it — derive from brand name so legacy readers don't blow up.
        // The LLM also reads creativeBrief which carries the actual content.
        clientDescription: brand?.name || "",
        creativeBrief,
        campaignFormat,
        adDuration,
        selectedCTA: selectedCTA || null,
        selectedPacing: selectedPacing || null,
        selectedTone: selectedTone || null,
        voiceInstructions: voiceInstructions.trim() || null,
        selectedTemplateId: selectedTemplateId || null,
        selectedLanguage,
        selectedRegion: selectedRegion || null,
        selectedAccent,
        selectedProvider,
        ...(parsedReferenceUrls.length
          ? { referenceUrls: parsedReferenceUrls }
          : {}),
        ...(forbiddenWords.trim()
          ? { forbiddenWords: forbiddenWords.trim() }
          : {}),
        ...(providedScript.trim()
          ? { providedScript: providedScript.trim() }
          : {}),
        ...(creativeAngle.trim()
          ? { creativeAngle: creativeAngle.trim() }
          : {}),
        ...(brand?.salesforceAccountId
          ? { salesforceAccountId: brand.salesforceAccountId }
          : {}),
        ...(brand ? { brand } : {}),
        // Preserve legacy brandVoice on round-trip so display stays stable.
        ...(legacyBrandVoice ? { brandVoice: legacyBrandVoice } : {}),
      };

      const response = await fetch(`/api/ads/${adId}/brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefData }),
      });

      if (!response.ok && response.status !== 404) {
        console.error("Failed to save brief:", response.status);
      }
    } catch (error) {
      console.error("Failed to save brief:", error);
    }
  }, [
    adId,
    brand,
    creativeBrief,
    creativeAngle,
    campaignFormat,
    adDuration,
    selectedCTA,
    selectedPacing,
    selectedTone,
    voiceInstructions,
    selectedTemplateId,
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    parsedReferenceUrls,
    forbiddenWords,
    providedScript,
    legacyBrandVoice,
  ]);

  useEffect(() => {
    if (initialBrief === undefined) return;
    if (!initialBriefLoadedRef.current && !creativeBrief && !brand) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveBriefToRedis();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    initialBrief,
    brand,
    creativeBrief,
    creativeAngle,
    campaignFormat,
    adDuration,
    selectedCTA,
    selectedPacing,
    selectedTone,
    voiceInstructions,
    selectedTemplateId,
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    selectedProvider,
    parsedReferenceUrls,
    forbiddenWords,
    providedScript,
    saveBriefToRedis,
  ]);

  // ============================================================
  // Generate flow + SSE handling — same shape as V3.
  // ============================================================

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setGeneratingCreative(true);
        break;
      case "drafts-created": {
        const { drafts, adName } = event.data as {
          drafts: { voices?: string; music?: string; sfx?: string };
          adName: string;
        };
        setGeneratingCreative(false);
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
        const { index, error: errMsg } = event.data as {
          index: number;
          error: string;
        };
        setGeneratingVoice(false);
        onStreamUpdate?.({
          stream: "voices",
          status: "failed",
          index,
          error: errMsg,
        });
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
        const { error: errMsg } = event.data as { error: string };
        setGeneratingMusic(false);
        onStreamUpdate?.({ stream: "music", status: "failed", error: errMsg });
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
        onStreamUpdate?.({ stream: "sfx", status: "ready", index, url });
        break;
      }
      case "sfx-failed": {
        const { index, error: errMsg } = event.data as {
          index: number;
          error: string;
        };
        onStreamUpdate?.({
          stream: "sfx",
          status: "failed",
          index,
          error: errMsg,
        });
        break;
      }
      case "complete": {
        const { success } = event.data as { success: boolean };
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

  const handleGenerateCreative = async () => {
    if (!creativeBrief.trim()) {
      setError("Creative brief is required.");
      return;
    }

    setIsGenerating(true);
    onGeneratingChange?.(true);
    setError(null);

    try {
      const requestBody = {
        adId,
        language: selectedLanguage,
        // Generate routes still expect `clientDescription` — derive from
        // the picked brand's name (or empty if greenfield+blank). The
        // creative content lives in creativeBrief and creativeAngle.
        clientDescription: brand?.name || "",
        creativeBrief,
        campaignFormat,
        duration: adDuration,
        region: selectedRegion || undefined,
        accent: selectedAccent || undefined,
        cta: selectedCTA,
        pacing: selectedPacing,
        tone: selectedTone,
        voiceInstructions: voiceInstructions.trim() || null,
        selectedTemplateId: selectedTemplateId || null,
        selectedProvider,
        autoGenerateAudio,
        ...(parsedReferenceUrls.length
          ? { referenceUrls: parsedReferenceUrls }
          : {}),
        ...(forbiddenWords.trim()
          ? { forbiddenWords: forbiddenWords.trim() }
          : {}),
        ...(providedScript.trim()
          ? { providedScript: providedScript.trim() }
          : {}),
        ...(creativeAngle.trim()
          ? { creativeAngle: creativeAngle.trim() }
          : {}),
        ...(brand?.salesforceAccountId
          ? { salesforceAccountId: brand.salesforceAccountId }
          : {}),
        ...(brand ? { brand } : {}),
      };

      if (autoGenerateAudio) {
        const response = await fetch("/api/ai/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start generation");
        }
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = parseSSEEvents(buffer);
          for (const event of events) handleGenerationEvent(event);
          const lastNewline = buffer.lastIndexOf("\n\n");
          if (lastNewline !== -1) buffer = buffer.slice(lastNewline + 2);
        }
      } else {
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
        onDraftsCreated?.({ ...result.drafts, adName: result.adName });
      }
    } catch (err) {
      console.error("Error generating creative:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate creative",
      );
    } finally {
      setIsGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  // The auto-generate path mounts with `autoGenerate=true` from the
  // `?auto_generate=1` query param. Without this ref-guard, React's
  // StrictMode double-invokes effects in dev and fires two parallel
  // POSTs to /api/ai/generate-stream — producing v1+v2 for every stream.
  // Same guard the manual button gets implicitly via `disabled={isGenerating}`.
  const autoGenFiredRef = useRef(false);
  useEffect(() => {
    if (autoGenerate && !autoGenFiredRef.current) {
      autoGenFiredRef.current = true;
      handleGenerateCreative();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  // We cannot generate a new project if we do not have the
  // - creative brief
  // - brand (via the name)
  // or when we are already generating
  const canTriggerGeneration =
    !creativeBrief.trim() || !brand?.name || isGenerating;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 text-white">
      <div className="flex justify-between items-start mt-8 mb-12">
        <div>
          <h1 className="text-4xl font-black mb-2">Create Your Campaign</h1>
          <p className="text-gray-400">
            Brand &amp; market, then creative direction, then voice
            technicalities.
          </p>
        </div>
        <button
          onClick={handleGenerateCreative}
          disabled={canTriggerGeneration}
          className="px-6 py-3 bg-wb-blue hover:bg-wb-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
        >
          {isGenerating ? "Generating…" : "Generate Creative"}
        </button>
      </div>

      <BriefPanelBase
        brand={brand}
        onBrandChanged={handleBrandChanged}
        region={selectedRegion}
        onRegionChanged={setSelectedRegion}
        onMarketChanged={handleMarketChanged}
        dossier={dossier}
        isLoadingDossier={isLoadingDossier}
        enrichmentSummary={enrichmentSummary}
        legacyBrandVoice={legacyBrandVoice}
        isGenerating={isGenerating}
        creativeBrief={creativeBrief}
        onCreativeBriefChanged={setCreativeBrief}
        creativeAngle={creativeAngle}
        onCreativeAngleChanged={setCreativeAngle}
        tone={selectedTone}
        onToneChanged={setSelectedTone}
        toneOptions={toneOptions}
        toneInstructions={toneInstructions}
        voiceInstructions={voiceInstructions}
        onVoiceInstructionsChanged={setVoiceInstructions}
        campaignFormat={campaignFormat}
        onCampaignFormatChanged={setCampaignFormat}
        pacing={selectedPacing}
        onPacingChanged={setSelectedPacing}
        cta={selectedCTA}
        onCTAChanged={setSelectedCTA}
        adDuration={adDuration}
        onAdDurationChanged={setAdDuration}
        provider={selectedProvider}
        onProviderChanged={setSelectedProvider}
        voiceCounts={voiceCounts}
        dialogReady={dialogReady}
        referenceUrlsText={referenceUrlsText}
        onReferenceUrlsTextChanged={setReferenceUrlsText}
        forbiddenWords={forbiddenWords}
        onForbiddenWordsChanged={setForbiddenWords}
        providedScript={providedScript}
        onProvidedScriptChanged={setProvidedScript}
        showAngleNudge={showAngleNudge}
        language={selectedLanguage}
        onLanguageChanged={setSelectedLanguage}
        accent={selectedAccent}
        onAccentChanged={setSelectedAccent}
        onLanguageOptionsResolved={handleLanguageOptionsResolved}
        error={error}
        selectedTemplateId={selectedTemplateId}
        onTemplateChanged={handleTemplateChanged}
        creativeTemplates={creativeTemplates}
        creativeTemplatesLoading={creativeTemplatesLoading}
      />
    </div>
  );
}
