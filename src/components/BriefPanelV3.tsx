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
} from "./ui";

// SVG Icons for Ad Format
const DialogueIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    height="20"
    width="20"
  >
    <g>
      <path
        d="m6.5 5.5 11 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="m6.5 8.5 6.5 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="m13.5 14.5 6 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="m13.5 17.5 6 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="m6.5 11.5 2.5 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="m8 18.67 -6.64 3.08L4 16.58a8.6 8.6 0 0 1 -3.5 -6.7C0.5 4.7 5.65 0.5 12 0.5s11.5 4.2 11.5 9.38"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
      <path
        d="M9.7 16.38c0 3.11 3.09 5.63 6.9 5.63a8.28 8.28 0 0 0 2.4 -0.36l4 1.85 -1.55 -3.1a5.16 5.16 0 0 0 2.07 -4c0 -3.11 -3.09 -5.63 -6.9 -5.63s-6.92 2.5 -6.92 5.61Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </g>
  </svg>
);

const SingleVoiceIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    height="20"
    width="20"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M0.552307 23.45c0.013353 -1.1373 0.250113 -2.2609 0.696813 -3.3069 0.48778 -0.9765 2.52746 -1.6534 5.08776 -2.6011 0.69184 -0.2568 0.57836 -2.0646 0.27176 -2.402 -0.48843 -0.5289 -0.85944 -1.1552 -1.08865 -1.8377 -0.22921 -0.6825 -0.31144 -1.4057 -0.24127 -2.1222 -0.04387 -0.4561 0.0066 -0.9163 0.14824 -1.35196 0.14165 -0.4357 0.37145 -0.83758 0.67511 -1.18064 0.30365 -0.34306 0.67466 -0.61995 1.08994 -0.81345 0.41527 -0.1935 0.86593 -0.29946 1.32392 -0.31128 0.45833 0.01129 0.90942 0.11685 1.32517 0.31011 0.4157 0.19326 0.7872 0.47008 1.0913 0.8132 0.3041 0.34311 0.5342 0.74518 0.6761 1.18114 0.1419 0.43598 0.1925 0.89648 0.1486 1.35288 0.0702 0.7165 -0.012 1.4397 -0.2412 2.1222 -0.2293 0.6825 -0.6003 1.3088 -1.0887 1.8377 -0.3066 0.3374 -0.4201 2.1452 0.2718 2.402 2.5603 0.9477 4.5999 1.6246 5.0877 2.6011 0.4467 1.046 0.6835 2.1696 0.6968 3.3069H0.552307Z"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.9701 12.0361c0.4876 0.1906 0.9957 0.3243 1.514 0.3982l0 3.0561c0.4978 -0.4978 3.4841 -2.9864 3.9819 -3.4453 1.1446 -0.4067 2.1385 -1.1519 2.8497 -2.13667 0.7112 -0.98482 1.106 -2.16265 1.1321 -3.37714 -0.0676 -1.64985 -0.7867 -3.20557 -1.9997 -4.32598 -1.213 -1.1204 -2.8207 -1.714036 -4.4708 -1.650715 -1.5447 -0.050572 -3.0541 0.468435 -4.2411 1.458295 -1.187 0.98986 -1.9687 2.3815 -2.1965 3.91018"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      d="M14.2398 6.77617c-0.1375 0 -0.2489 -0.11142 -0.2489 -0.24886 0 -0.13745 0.1114 -0.24887 0.2489 -0.24887"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      d="M14.2398 6.77617c0.1374 0 0.2488 -0.11142 0.2488 -0.24886 0 -0.13745 -0.1114 -0.24887 -0.2488 -0.24887"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      d="M16.9773 6.77617c-0.1375 0 -0.2489 -0.11142 -0.2489 -0.24886 0 -0.13745 0.1114 -0.24887 0.2489 -0.24887"
      strokeWidth="1"
    />
    <path
      stroke="currentColor"
      d="M16.9773 6.77617c0.1374 0 0.2488 -0.11142 0.2488 -0.24886 0 -0.13745 -0.1114 -0.24887 -0.2488 -0.24887"
      strokeWidth="1"
    />
    <g>
      <path
        stroke="currentColor"
        d="M19.7147 6.77617c-0.1374 0 -0.2488 -0.11142 -0.2488 -0.24886 0 -0.13745 0.1114 -0.24887 0.2488 -0.24887"
        strokeWidth="1"
      />
      <path
        stroke="currentColor"
        d="M19.7148 6.77617c0.1374 0 0.2488 -0.11142 0.2488 -0.24886 0 -0.13745 -0.1114 -0.24887 -0.2488 -0.24887"
        strokeWidth="1"
      />
    </g>
  </svg>
);

// SVG Icons for pacing control
const TurtleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    height="20"
    width="20"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.881 18h0.869c1.1935 0 2.3381 -0.4741 3.182 -1.318 0.8439 -0.8439 1.318 -1.9885 1.318 -3.182V9h1.5c0.3978 0 0.7794 -0.15804 1.0607 -0.43934S23.25 7.89782 23.25 7.5v-3c0 -0.79565 -0.3161 -1.55871 -0.8787 -2.12132C21.8087 1.81607 21.0457 1.5 20.25 1.5H16.5c-0.6501 0.18758 -1.2214 0.58188 -1.6274 1.12319 -0.406 0.54131 -0.6245 1.20017 -0.6226 1.87681V6"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12.945 9.15101c-1.3302 -1.07096 -2.98726 -1.65367 -4.695 -1.651 -4.142 0 -6 3.35799 -6 7.49999v1.5"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 16.5c-0.39782 0 -0.77936 0.158 -1.06066 0.4393C0.908035 17.2206 0.75 17.6022 0.75 18c0 0.3978 0.158035 0.7793 0.43934 1.0607 0.2813 0.2813 0.66284 0.4393 1.06066 0.4393H12c3 0 3.75 -3 3.75 -4.5 0.0016 -1.1226 -0.2492 -2.2312 -0.7339 -3.2438S13.8253 9.85288 12.95 9.14999c0.3663 0.90541 0.5531 1.87331 0.55 2.85001 0 1.5 -0.75 4.5 -3.75 4.5h-7.5Z"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.518 8.24701 3.26501 16.5"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5.75098 8.00101 12.678 14.928"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m3.13599 10.636 5.863 5.863"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.74998 19.5V21c0 0.3978 -0.15804 0.7794 -0.43934 1.0607 -0.28131 0.2813 -0.66284 0.4393 -1.06066 0.4393h-2.362c-0.15546 0 -0.30706 -0.0483 -0.43385 -0.1383 -0.12679 -0.0899 -0.2225 -0.217 -0.2739 -0.3637 -0.05139 -0.1468 -0.05592 -0.3058 -0.01297 -0.4552 0.04294 -0.1494 0.13126 -0.2818 0.25272 -0.3788l2.08 -1.664h2.25Z"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.25 19.5V21c0 0.3978 0.158 0.7793 0.4393 1.0606 0.2813 0.2814 0.6629 0.4394 1.0607 0.4394h2.362c0.1555 0 0.3071 -0.0483 0.4338 -0.1383 0.1268 -0.0899 0.2225 -0.217 0.2739 -0.3638 0.0514 -0.1467 0.056 -0.3057 0.013 -0.4551 -0.0429 -0.1494 -0.1312 -0.2818 -0.2527 -0.3788L13.253 19.3"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      d="M18.75 4.875c-0.2071 0 -0.375 -0.16789 -0.375 -0.375s0.1679 -0.375 0.375 -0.375"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      d="M18.75 4.875c0.2071 0 0.375 -0.16789 0.375 -0.375s-0.1679 -0.375 -0.375 -0.375"
      strokeWidth="1.5"
    ></path>
  </svg>
);

const RabbitIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    height="20"
    width="20"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.51172 12.036c0.69627 -0.0353 1.39194 0.0805 2.03924 0.3394 0.64734 0.2589 1.23094 0.6548 1.71074 1.1606 1.4293 1.9422 2.4675 4.1437 3.057 6.482"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M18.7342 23.25h-5.8826c-0.2507 0.0002 -0.4973 -0.0624 -0.7175 -0.1823 -0.2201 -0.1198 -0.4067 -0.293 -0.5425 -0.5036 -1.0113 -1.6024 -2.42199 -2.9143 -4.09347 -3.8069 -2.99522 -1.4976 -5.99044 -2.9953 -5.99044 -6.7393 0 -5.24162 3.74403 -5.99042 5.99044 -5.99042 3.74407 0 7.48807 3.74403 9.73447 4.49282 -1.4976 -2.2464 -4.5687 -9.2702 -2.2464 -9.734457C18.7302 0.0370377 20.9766 11.2691 20.9766 11.2691c0.7198 0.3097 1.324 0.8378 1.7271 1.5097s0.5848 1.4535 0.5193 2.2343c0 2.2465 -1.4976 2.2465 -3.744 2.2465 -2.2464 0 -2.9952 0.7488 -2.9952 0.7488"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      d="M19.8867 14.2859c-0.2071 0 -0.375 -0.1679 -0.375 -0.375s0.1679 -0.375 0.375 -0.375"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      d="M19.8867 14.2859c0.2071 0 0.375 -0.1679 0.375 -0.375s-0.1679 -0.375 -0.375 -0.375"
      strokeWidth="1.5"
    ></path>
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.51173 8.22998c-0.42497 -0.0973 -0.81252 -0.31598 -1.11553 -0.62943 -0.30301 -0.31346 -0.508427 -0.70819 -0.591279 -1.13621 -0.082852 -0.42803 -0.03957 -0.8709 0.124583 -1.27478 0.164156 -0.40389 0.442106 -0.75138 0.800076 -1.00024 0.35796 -0.24886 0.78051 -0.38836 1.21628 -0.40155 0.43577 -0.01318 0.86598 0.10051 1.23834 0.32727 0.37236 0.22676 0.67081 0.55681 0.85909 0.95003 0.18827 0.39322 0.25826 0.83266 0.20144 1.26491"
      strokeWidth="1.5"
    ></path>
  </svg>
);

// SVG Icons for settings (Voice Provider)
const VoiceMailIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 10 10"
    height="12"
    width="12"
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M6.414 5.914A2 2 0 0 1 3 4.5V2a2 2 0 1 1 4 0v2.5a2 2 0 0 1 -0.586 1.414Zm1.644 -2.106a0.625 0.625 0 0 1 1.067 0.442v0.5a4.132 4.132 0 0 1 -3.5 4.078v0.547a0.625 0.625 0 0 1 -1.25 0v-0.547a4.132 4.132 0 0 1 -3.5 -4.078v-0.5a0.625 0.625 0 1 1 1.25 0v0.5a2.875 2.875 0 1 0 5.75 0v-0.5c0 -0.166 0.066 -0.325 0.183 -0.442Z"
      clipRule="evenodd"
      strokeWidth="1"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    height="12"
    width="12"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

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
};

export function BriefPanelV3({
  adId,
  initialBrief,
  onDraftsCreated,
  onGeneratingChange,
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
   * Main generation flow - V3 Tool-Calling API
   *
   * Calls /api/ai/generate which runs the agent loop.
   * LLM uses tools (search_voices, create_voice_draft, etc.) to create drafts directly.
   * No JSON parsing needed - tools write to Redis directly.
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
      console.log(`🚀 Starting V3 agentic generation for ad ${adId}`);

      // Get sessionId for lazy ad creation
      const sessionId = localStorage.getItem('universal-session') || 'default-session';

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId,                              // Required! Tools need this to write drafts
          sessionId,                         // Required for lazy ad creation
          language: selectedLanguage,
          clientDescription,
          creativeBrief,
          campaignFormat,
          duration: adDuration,
          region: selectedRegion || undefined,
          accent: selectedAccent || undefined,
          cta: selectedCTA,
          pacing: selectedPacing,
          selectedProvider: selectedProvider,  // Voice provider for search_voices tool
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate creative");
      }

      const result = await response.json();
      // result = { conversationId, drafts, message, provider, toolCalls, usage }

      console.log(`✅ V3 generation complete:`, {
        conversationId: result.conversationId,
        drafts: result.drafts,
        toolCalls: result.toolCalls,
        provider: result.provider,
        adName: result.adName,
      });

      // Notify parent to reload version streams and update ad name
      onDraftsCreated?.({ ...result.drafts, adName: result.adName });

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
              <VoiceMailIcon />
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
              <ExternalLinkIcon />
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
