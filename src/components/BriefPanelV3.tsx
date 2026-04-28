import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  BrandRef,
  CampaignFormat,
  Language,
  Provider,
  Pacing,
  ProjectBrief,
  ToneOfVoiceTag,
} from "@/types";
import { getFlagCode } from "@/utils/language";
import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";
import {
  GlassyTextarea,
  GlassyListbox,
  GlassySlider,
  GlassyCombobox,
  ProviderSelectionModal,
  TurtleIcon,
  RabbitIcon,
} from "./ui";
import { ArrowTopRightOnSquareIcon, MicrophoneIcon, ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
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

// Stage-3 brief expansion: 6 creative formats. The 2-button toggle is
// replaced with a select to accommodate the longer list. Order matters for
// UI display — most-common first.
const CREATIVE_FORMAT_OPTIONS: Array<{ value: CampaignFormat; label: string }> = [
  { value: "ad_read", label: "Single voice (ad read)" },
  { value: "dialog", label: "Dialogue (two voices)" },
  { value: "testimonial", label: "Testimonial (first-person customer)" },
  { value: "vox_pop", label: "Vox pop (street interviews)" },
  { value: "dramatized_scene", label: "Dramatized scene (characters)" },
  { value: "radio_skit", label: "Radio skit (comedic sketch)" },
];

// Brand register multi-select. Distinct from per-voice acting tone — this
// is how the BRAND should feel, not how a single line should be performed.
const TONE_OF_VOICE_OPTIONS: Array<{ value: ToneOfVoiceTag; label: string }> = [
  { value: "warm", label: "Warm" },
  { value: "urgent", label: "Urgent" },
  { value: "playful", label: "Playful" },
  { value: "authoritative", label: "Authoritative" },
  { value: "conversational", label: "Conversational" },
  { value: "earnest", label: "Earnest" },
  { value: "sardonic", label: "Sardonic" },
  { value: "tender", label: "Tender" },
  { value: "confident", label: "Confident" },
  { value: "intimate", label: "Intimate" },
  { value: "irreverent", label: "Irreverent" },
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

/**
 * Header for one of the brief sub-sections (Brand & market / Creative
 * brief / References). Collapsible — clicking toggles the section
 * body. The chrome reductions from v4 stay: no emoji icons, no
 * populated-count pills (just title + 1-line purpose blurb + chevron).
 */
function BriefSectionHeader({
  title,
  blurb,
  isOpen,
  onToggle,
}: {
  title: string;
  blurb: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
    >
      <ChevronDownIcon
        className={`h-4 w-4 transition-transform duration-200 ${
          isOpen ? "rotate-0" : "-rotate-90"
        }`}
      />
      <span className="font-medium">{title}</span>
      <span className="text-xs text-gray-500">{blurb}</span>
    </button>
  );
}


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

  // Stage-3 brief expansion state — all optional, all default empty.
  const [toneOfVoice, setToneOfVoice] = useState<ToneOfVoiceTag[]>(initialBrief?.toneOfVoice || []);
  const [brandVoice, setBrandVoice] = useState(initialBrief?.brandVoice || "");
  const [referenceUrlsText, setReferenceUrlsText] = useState(
    (initialBrief?.referenceUrls || []).join("\n")
  );
  const [forbiddenWords, setForbiddenWords] = useState(initialBrief?.forbiddenWords || "");
  const [providedScript, setProvidedScript] = useState(initialBrief?.providedScript || "");

  // v2 Stage H — unified Brand identity. Replaces the v1 SF-only picker
  // state. The brand carries `name` (canonical recents key) plus an
  // optional SF backing. v1 ads with only salesforceAccountId hydrate
  // into a brand-with-no-snapshot — picker badge will be empty until the
  // user re-picks (or until lazy backfill on save sets brand.name).
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
  const [creativeAngle, setCreativeAngle] = useState(initialBrief?.creativeAngle || "");


  // Voice selection state (local - replaces voiceManager)
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(initialBrief?.selectedLanguage || "en");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(initialBrief?.selectedRegion || null);
  const [selectedAccent, setSelectedAccent] = useState<string>(initialBrief?.selectedAccent || "neutral");
  const [selectedProvider, setSelectedProvider] = useState<Provider>(initialBrief?.selectedProvider || "any");

  // Three independently-collapsible sub-sections. Each defaults to open
  // when at least one of its own fields is populated, so reload-and-edit
  // doesn't hide the user's existing work; otherwise closed (cleaner
  // first impression on a fresh ad).
  const [showBrandMarket, setShowBrandMarket] = useState(
    !!(initialBrief?.salesforceAccountId || initialBrief?.brand)
  );
  const [showCreativeBrief, setShowCreativeBrief] = useState(
    !!(
      initialBrief?.creativeAngle ||
      initialBrief?.toneOfVoice?.length ||
      initialBrief?.brandVoice
    )
  );
  const [showReferences, setShowReferences] = useState(
    !!(
      initialBrief?.referenceUrls?.length ||
      initialBrief?.forbiddenWords ||
      initialBrief?.providedScript
    )
  );

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

      // Stage-3 brief expansion fields
      if (initialBrief.toneOfVoice) setToneOfVoice(initialBrief.toneOfVoice);
      if (initialBrief.brandVoice !== undefined) setBrandVoice(initialBrief.brandVoice || "");
      if (initialBrief.referenceUrls)
        setReferenceUrlsText(initialBrief.referenceUrls.join("\n"));
      if (initialBrief.forbiddenWords !== undefined)
        setForbiddenWords(initialBrief.forbiddenWords || "");
      if (initialBrief.providedScript !== undefined)
        setProvidedScript(initialBrief.providedScript || "");

      // v2 Stage H — Brand. Prefer the unified brand field; fall back to
      // legacy salesforceAccountId for v1 ads.
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
      if (initialBrief.creativeAngle !== undefined) setCreativeAngle(initialBrief.creativeAngle || "");
    }
  }, [initialBrief]);

  // SF picker — debounced autocomplete state. Browser cannot sign HMAC
  // requests directly so we proxy through ACA's /api/sf-accounts/search,
  // which signs server-side with the shared alaric secret.
  const [sfQuery, setSfQuery] = useState("");
  const [sfHits, setSfHits] = useState<Array<{ id: string; name: string; industry: string | null; website: string | null }>>([]);
  const [sfSearching, setSfSearching] = useState(false);
  const [sfDropdownOpen, setSfDropdownOpen] = useState(false);
  const [sfError, setSfError] = useState<string | null>(null);
  // Spotify-only filter is the picker's default — ACA is a Spotify
  // creative tool, so surfacing non-Spotify SF accounts wastes picker
  // slots. When the filter returns zero hits, the search auto-retries
  // unfiltered (a global brand like Red Bull may not be tagged Spotify
  // in alaric yet, but the user still wants to find it without
  // clicking). `sfFallbackUsed` flags those results so the dropdown
  // can surface a small "No Spotify match — showing all" notice.
  const [spotifyClientsOnly, setSpotifyClientsOnly] = useState(true);
  const [sfFallbackUsed, setSfFallbackUsed] = useState(false);

  // v2 Stage H — Recents row. Fetched once per mount from
  // /api/brands/recent. Each row carries the SF snapshot (when present)
  // and the latest inheritable brief defaults — so picking a recent
  // brand needs zero extra roundtrips.
  type RecentBrandRow = {
    name: string;
    salesforceAccountId?: string | null;
    salesforceAccountSnapshot?: BrandRef["salesforceAccountSnapshot"];
    lastUsedAt: number;
    adCount: number;
    inheritable: {
      toneOfVoice?: ToneOfVoiceTag[];
      brandVoice?: string | null;
      selectedLanguage?: Language;
      selectedRegion?: string | null;
      selectedAccent?: string | null;
      forbiddenWords?: string | null;
    };
  };
  const [recentBrands, setRecentBrands] = useState<RecentBrandRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/brands/recent", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { brands: [] }))
      .then((data) => {
        if (Array.isArray(data?.brands)) setRecentBrands(data.brands);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[BriefPanelV3] failed to load recent brands:", err);
        }
      });
    return () => controller.abort();
  }, []);

  // v2 Stage I — pending inheritance prompt. When the user picks a
  // recent brand AND the current brief already has content, we don't
  // overwrite — instead we surface this as an inline "Use last settings
  // for {brand}?" button. Cleared on apply or on brand change.
  const [pendingInheritance, setPendingInheritance] = useState<RecentBrandRow | null>(null);

  function applyInheritable(row: RecentBrandRow) {
    const inh = row.inheritable;
    if (inh.toneOfVoice) setToneOfVoice(inh.toneOfVoice);
    if (inh.brandVoice !== undefined && inh.brandVoice !== null) setBrandVoice(inh.brandVoice);
    if (inh.selectedLanguage) setSelectedLanguage(inh.selectedLanguage);
    if (inh.selectedRegion !== undefined) setSelectedRegion(inh.selectedRegion ?? null);
    if (inh.selectedAccent) setSelectedAccent(inh.selectedAccent);
    if (inh.forbiddenWords !== undefined && inh.forbiddenWords !== null) {
      setForbiddenWords(inh.forbiddenWords);
    }
    setPendingInheritance(null);
  }

  /**
   * Pick a brand — either from Recents (row supplied) or from the SF
   * search dropdown (constructed inline). Handles three paths:
   *   - SF-backed pick: brand carries id + snapshot
   *   - Standalone pick: brand carries name only
   *   - Recent pick: same as above but also triggers Stage I inheritance
   *     (silent on empty briefs, prompted via pendingInheritance otherwise)
   */
  function pickBrand(next: BrandRef, source: "search" | "standalone" | "recent", row?: RecentBrandRow) {
    setBrand(next);
    setSfQuery("");
    setSfHits([]);
    setSfDropdownOpen(false);

    // Find matching recent row to pull inheritable from. If the user
    // searched their way to a brand they've used before, inherit anyway.
    const recentMatch =
      row ??
      recentBrands.find((r) => r.name.toLowerCase() === next.name.toLowerCase());

    if (!recentMatch) {
      setPendingInheritance(null);
      return;
    }

    const briefIsEmpty = !clientDescription.trim() && !creativeBrief.trim();
    if (briefIsEmpty) {
      // Silent auto-fill on empty briefs — the common "starting from
      // scratch" case. No surprise; nothing to clobber.
      applyInheritable(recentMatch);
    } else {
      // Brief has content — surface as a button instead of overwriting.
      setPendingInheritance(recentMatch);
    }
  }

  function clearBrand() {
    setBrand(null);
    setSfQuery("");
    setSfHits([]);
    setSfDropdownOpen(false);
    setPendingInheritance(null);
  }

  useEffect(() => {
    const q = sfQuery.trim();
    if (q.length < 2) {
      setSfHits([]);
      setSfError(null);
      return;
    }
    setSfSearching(true);
    setSfError(null);
    setSfFallbackUsed(false);
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        // First pass: respect the Spotify-only toggle.
        const primaryParams = new URLSearchParams({ q });
        if (spotifyClientsOnly) primaryParams.set("clientPlatforms", "spotify");
        const primary = await fetch(`/api/sf-accounts/search?${primaryParams.toString()}`, {
          signal: controller.signal,
        });
        if (!primary.ok) {
          const body = await primary.json().catch(() => ({}));
          throw new Error(body?.error || `search failed (${primary.status})`);
        }
        const primaryData = await primary.json();
        const primaryHits = Array.isArray(primaryData?.hits) ? primaryData.hits : [];

        // Auto-fallback: when Spotify-only returns zero, retry unfiltered.
        // Global brands (Red Bull, Heineken, etc.) may not be tagged
        // `clientPlatforms ∋ "spotify"` in alaric yet — making the user
        // click "Show all" to find them is a 100% predictable next step
        // that we can save by retrying inline.
        if (spotifyClientsOnly && primaryHits.length === 0) {
          const fallback = await fetch(
            `/api/sf-accounts/search?${new URLSearchParams({ q }).toString()}`,
            { signal: controller.signal }
          );
          if (fallback.ok) {
            const fallbackData = await fallback.json();
            const fallbackHits = Array.isArray(fallbackData?.hits) ? fallbackData.hits : [];
            if (fallbackHits.length > 0) {
              setSfHits(fallbackHits);
              setSfFallbackUsed(true);
              return;
            }
          }
        }

        setSfHits(primaryHits);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setSfError(err.message);
          setSfHits([]);
        }
      } finally {
        setSfSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [sfQuery, spotifyClientsOnly]);

  // Parsed reference URLs (one per line, trimmed, empties dropped).
  const parsedReferenceUrls = useMemo(
    () =>
      referenceUrlsText
        .split(/\n+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
    [referenceUrlsText]
  );

  // Soft warning: when alaric/SF or referenceUrls are populated but the
  // creative-angle field is empty, the script will brand-anchor cleanly
  // but lose the per-spot edge that distinguishes one ad from another.
  // Visible nudge, never blocks Generate.
  const showAngleNudge =
    !creativeAngle.trim() &&
    !!(brand?.salesforceAccountId || brand?.name || parsedReferenceUrls.length > 0);

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
        ...(toneOfVoice.length ? { toneOfVoice } : {}),
        ...(brandVoice.trim() ? { brandVoice: brandVoice.trim() } : {}),
        ...(parsedReferenceUrls.length ? { referenceUrls: parsedReferenceUrls } : {}),
        ...(forbiddenWords.trim() ? { forbiddenWords: forbiddenWords.trim() } : {}),
        ...(providedScript.trim() ? { providedScript: providedScript.trim() } : {}),
        // v2: persist both the unified brand AND mirror the SF id at the
        // top level for backwards compat (v1 readers ignore brand.*).
        ...(brand?.salesforceAccountId
          ? { salesforceAccountId: brand.salesforceAccountId }
          : {}),
        ...(brand ? { brand } : {}),
        ...(creativeAngle.trim() ? { creativeAngle: creativeAngle.trim() } : {}),
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
    selectedLanguage, selectedRegion, selectedAccent, selectedProvider,
    toneOfVoice, brandVoice, parsedReferenceUrls, forbiddenWords,
    providedScript,
    brand, creativeAngle,
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
    toneOfVoice, brandVoice, parsedReferenceUrls, forbiddenWords,
    providedScript,
    brand, creativeAngle,
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
        selectedProvider: selectedProvider,
        autoGenerateAudio,
        // Stage-3 brief expansion fields. Send only when populated so legacy
        // consumers don't see noise.
        ...(toneOfVoice.length ? { toneOfVoice } : {}),
        ...(brandVoice.trim() ? { brandVoice: brandVoice.trim() } : {}),
        ...(parsedReferenceUrls.length ? { referenceUrls: parsedReferenceUrls } : {}),
        ...(forbiddenWords.trim() ? { forbiddenWords: forbiddenWords.trim() } : {}),
        ...(providedScript.trim() ? { providedScript: providedScript.trim() } : {}),
        // Stage C — alaric/SFDC integration fields
        // v2 Stage H — unified brand + back-compat sfId mirror
        ...(brand?.salesforceAccountId
          ? { salesforceAccountId: brand.salesforceAccountId }
          : {}),
        ...(brand ? { brand } : {}),
        ...(creativeAngle.trim() ? { creativeAngle: creativeAngle.trim() } : {}),
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
        {/* Column 1: Ad Format — 6-option select (Stage-3 expansion) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Ad Format
          </label>
          <GlassyListbox
            value={campaignFormat}
            onChange={(value) => setCampaignFormat(value as CampaignFormat)}
            options={CREATIVE_FORMAT_OPTIONS}
            disabled={isLoading}
          />
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

      {/* Section 1 — Brand & market. Identity layer: who is the ad for,
          and what does Aleph already know about them? Stage W will add
          the dossier card + Run-deep-enrichment CTA inside this section. */}
      <div className="mb-6">
        <BriefSectionHeader
          title="Brand & market"
          blurb="(who the ad is for — Salesforce link, recent brands)"
          isOpen={showBrandMarket}
          onToggle={() => setShowBrandMarket((v) => !v)}
        />

        {showBrandMarket && (
        <div className="mt-4 space-y-6 p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            {/* v2 Stage H — Unified Brand picker. Salesforce-backed when
                the brand exists in CRM (~80%); standalone when not (APAC
                pitch tools, prospect briefs the sales team brings to
                pitch). Recents row above gives single-click access for
                clients the user has worked with before. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Brand
                <span className="ml-2 text-xs text-gray-500">
                  (Salesforce-backed clients link to alaric for brand voice + intelligence injection; standalone brands work too)
                </span>
              </label>

              {/* Recents row — only when there's something to show AND no brand picked */}
              {!brand && recentBrands.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-2">Recent brands</p>
                  <div className="flex flex-wrap gap-2">
                    {recentBrands.map((row) => {
                      const sfBacked = !!row.salesforceAccountId;
                      return (
                        <button
                          key={`${row.name}-${row.salesforceAccountId ?? "standalone"}`}
                          type="button"
                          onClick={() => {
                            const next: BrandRef = {
                              name: row.name,
                              salesforceAccountId: row.salesforceAccountId ?? null,
                              salesforceAccountSnapshot: row.salesforceAccountSnapshot ?? null,
                            };
                            pickBrand(next, "recent", row);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
                          title={`${row.adCount} ad${row.adCount === 1 ? "" : "s"} for this brand`}
                        >
                          {sfBacked && (
                            <svg
                              className="h-3 w-3 text-wb-blue"
                              viewBox="0 0 16 16"
                              fill="currentColor"
                              aria-label="Salesforce-backed"
                            >
                              <circle cx="8" cy="8" r="6" />
                            </svg>
                          )}
                          <span>{row.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {brand ? (
                // Selected state — unified badge. Renders synchronously from
                // the cached snapshot when SF-backed; otherwise just shows
                // the brand name with a "(no Salesforce link)" tag.
                <div className="flex items-center justify-between p-3 bg-wb-blue/10 border border-wb-blue/30 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-sm text-white font-medium">
                      {brand.salesforceAccountSnapshot?.name || brand.name || "(brand not yet named)"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {brand.salesforceAccountId ? (
                        <>
                          {brand.salesforceAccountSnapshot?.industry || "Industry: —"}
                          <span className="ml-2 text-gray-500">
                            SF Id: {brand.salesforceAccountId}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-500">Standalone brand (no Salesforce link)</span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearBrand}
                    className="ml-4 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Clear brand"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                // Unselected state — debounced autocomplete with standalone fallback.
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                    <MagnifyingGlassIcon className="h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      value={sfQuery}
                      onChange={(e) => {
                        setSfQuery(e.target.value);
                        setSfDropdownOpen(true);
                      }}
                      onFocus={() => setSfDropdownOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setSfDropdownOpen(false), 150);
                      }}
                      placeholder="Type the brand name (Salesforce search starts at 2 chars)…"
                      className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
                    />
                    {sfSearching && (
                      <span className="text-xs text-gray-500">searching…</span>
                    )}
                  </div>

                  {sfError && (
                    <p className="mt-2 text-xs text-orange-400">
                      ⚠️ {sfError}
                    </p>
                  )}

                  {sfDropdownOpen && sfQuery.trim().length >= 2 && (sfHits.length > 0 || !sfSearching) && (
                    <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-gray-900 border border-white/10 rounded-xl shadow-lg">
                      {/* Filter pill — Spotify-only is the default. Auto-falls
                          back to unfiltered when zero Spotify clients match
                          (sfFallbackUsed flag), with an inline notice. */}
                      <li className="sticky top-0 z-10 border-b border-white/10 bg-gray-900 px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400">
                          {sfFallbackUsed
                            ? "No Spotify match — showing all Salesforce accounts"
                            : spotifyClientsOnly
                              ? "Showing Spotify clients only"
                              : "Showing all Salesforce accounts"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSpotifyClientsOnly((v) => !v)}
                          onMouseDown={(e) => e.preventDefault()}
                          className="text-xs text-wb-blue hover:underline"
                        >
                          {spotifyClientsOnly ? "Show all" : "Spotify only"}
                        </button>
                      </li>

                      {/* Truly-empty state — both Spotify-only AND the
                          unfiltered fallback returned zero. Just say so. */}
                      {sfHits.length === 0 && !sfSearching && (
                        <li className="px-3 py-3 text-xs text-gray-500">
                          No matching Salesforce accounts.
                        </li>
                      )}

                      {sfHits.map((hit) => (
                        <li key={hit.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const next: BrandRef = {
                                name: hit.name,
                                salesforceAccountId: hit.id,
                                salesforceAccountSnapshot: {
                                  id: hit.id,
                                  name: hit.name,
                                  industry: hit.industry,
                                },
                              };
                              pickBrand(next, "search");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <svg className="h-3 w-3 text-wb-blue flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="8" cy="8" r="6" />
                              </svg>
                              <div className="text-sm text-white">{hit.name}</div>
                            </div>
                            <div className="text-xs text-gray-400 ml-5">
                              {hit.industry || "—"}
                              {hit.website && (
                                <span className="ml-2 text-gray-500">
                                  {hit.website.replace(/^https?:\/\//, "")}
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}

                      {/* Standalone fallback — always offered when query is long
                          enough. Lets the APAC pitch-tool flow work without
                          forcing the user to wait for SF to confirm a no-match. */}
                      {sfQuery.trim().length >= 2 && (
                        <li className="border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              const next: BrandRef = {
                                name: sfQuery.trim(),
                                salesforceAccountId: null,
                                salesforceAccountSnapshot: null,
                              };
                              pickBrand(next, "standalone");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors"
                          >
                            <div className="text-sm text-gray-300">
                              Use as standalone brand:{" "}
                              <span className="text-white font-medium">&quot;{sfQuery.trim()}&quot;</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              No Salesforce link (pitch-tool / prospect mode)
                            </div>
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* Stage I — pending inheritance prompt. Only shows when the
                  current brief had content at pick time (silent path took
                  effect on empty briefs). */}
              {pendingInheritance && (
                <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-xs text-amber-200">
                    You&apos;ve briefed <span className="font-medium">{pendingInheritance.name}</span> before.
                    Apply last settings (tone, brand voice, language, region, accent, forbidden words)?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyInheritable(pendingInheritance)}
                      className="px-3 py-1.5 text-xs rounded-md bg-wb-blue/20 text-wb-blue border border-wb-blue/30 hover:bg-wb-blue/30 transition-colors"
                    >
                      Use last settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingInheritance(null)}
                      className="px-2 py-1 text-xs rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      aria-label="Dismiss"
                    >
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>


        </div>
        )}
      </div>

      {/* Section 2 — Creative brief. Variance layer: what makes this ad
          different from every other ad for this brand. Brand voice = the
          constant; creative angle = the per-spot edge. */}
      <div className="mb-6">
        <BriefSectionHeader
          title="Creative brief"
          blurb="(angle for this spot, tone of voice, brand voice)"
          isOpen={showCreativeBrief}
          onToggle={() => setShowCreativeBrief((v) => !v)}
        />

        {showCreativeBrief && (
        <div className="mt-4 space-y-6 p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            {/* Campaign-specific creative angle (Stage C — irreducible) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Creative angle
                <span className="ml-2 text-xs text-gray-500">
                  (the variance — what makes this ad different from every other ad for this brand)
                </span>
              </label>
              <GlassyTextarea
                value={creativeAngle}
                onChange={(e) => setCreativeAngle(e.target.value)}
                placeholder="What is THIS ad asking the listener to feel or do that no other ad for this brand would? E.g. 'urgent 24h Black Friday push, dancers as the protagonist, hook drops at 0:03' — one or two sentences specific to this spot."
                rows={3}
              />
              {showAngleNudge && (
                <p className="mt-2 text-xs text-amber-400">
                  ⚠️ Without an angle, the script will brand-anchor cleanly but lose the per-spot edge — type one sentence specific to THIS spot.
                </p>
              )}
            </div>

            {/* Tone of voice multi-select chips */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Brand register / Tone of voice
                <span className="ml-2 text-xs text-gray-500">
                  (multi-select — distinct from per-voice acting tone)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {TONE_OF_VOICE_OPTIONS.map((opt) => {
                  const selected = toneOfVoice.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setToneOfVoice((prev) =>
                          prev.includes(opt.value)
                            ? prev.filter((v) => v !== opt.value)
                            : [...prev, opt.value]
                        )
                      }
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        selected
                          ? "bg-wb-blue/30 text-white border-wb-blue/50"
                          : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand voice (full width) — the brand archetype constant. The
                spot-specific variance lives in `creativeAngle` above. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Brand voice (free-text)
                <span className="ml-2 text-xs text-gray-500">(optional)</span>
              </label>
              <GlassyTextarea
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="One-paragraph brand archetype / character. Examples: 'underdog with quiet confidence — never claims authority, earns it through specifics' or 'luxury brand told from the artisan's perspective, not the marketing team's'."
                rows={4}
              />
            </div>
        </div>
        )}
      </div>

      {/* Section 3 — References. Targeted external context + rules the
          agent should consider while drafting. Reference URLs are
          alaric-prefetched; forbidden words and provided script are
          constraints applied during generation. */}
      <div className="mb-6">
        <BriefSectionHeader
          title="References"
          blurb="(reference URLs, forbidden words, provided script)"
          isOpen={showReferences}
          onToggle={() => setShowReferences((v) => !v)}
        />

        {showReferences && (
        <div className="mt-4 space-y-6 p-5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
            {/* Reference URLs — alaric's tiered fetch cascade (T0/T1/T3)
                pulls each URL at brief-prefetch time and injects the
                extracted readable text into the agent's user message under
                `## Reference Page Content`. Targeted: paste specific
                campaign minisites, brand pages, or competitor references. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reference URLs
                <span className="ml-2 text-xs text-gray-500">
                  (one per line — existing ads, brand pages, campaign minisites)
                </span>
              </label>
              <GlassyTextarea
                value={referenceUrlsText}
                onChange={(e) => setReferenceUrlsText(e.target.value)}
                placeholder={"https://example.com/our-best-ad\nhttps://brand-site.com/about"}
                rows={4}
              />
            </div>

            {/* Forbidden words (full width) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Forbidden words / phrases
                <span className="ml-2 text-xs text-gray-500">
                  (regulatory / brand / cliché bans)
                </span>
              </label>
              <GlassyTextarea
                value={forbiddenWords}
                onChange={(e) => setForbiddenWords(e.target.value)}
                placeholder="e.g. 'cheap', 'discount', any competitor names, regulatory triggers"
                rows={3}
              />
            </div>

            {/* Provided script (full width) */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Provided script
                <span className="ml-2 text-xs text-gray-500">
                  (use verbatim — agent only writes acting / music / SFX around it)
                </span>
              </label>
              <GlassyTextarea
                value={providedScript}
                onChange={(e) => setProvidedScript(e.target.value)}
                placeholder="Paste the exact script text you want used. Leave empty for the agent to write the script from the brief."
                rows={6}
              />
            </div>
        </div>
        )}
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
