import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";
import { CampaignFormat, Pacing, Provider } from "@/types";
import { getFlagCode, Language } from "@/utils/language";
import {
  ArrowTopRightOnSquareIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DialogueIcon,
  GlassyCombobox,
  GlassyListbox,
  GlassySlider,
  GlassyTextarea,
  ProviderSelectionModal,
  RabbitIcon,
  SingleVoiceIcon,
  ToneSelector,
  TurtleIcon,
} from "./ui";
import type { ToneOption } from "./ui/ToneSelector";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { twMerge } from "tailwind-merge";

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

// Each preset = short title + one-line description, shown in the tone card and the dropdown.
const TONE_EMPTY_OPTION: ToneOption = {
  value: "none",
  title: "No specific tone",
  description: "Let the system decide based on the brief and target audience.",
};

// Sentinel option so users can ignore presets and write instructions freehand.
const CUSTOM_TONE_OPTION: ToneOption = {
  value: "custom",
  title: "Custom…",
  description:
    "Describe the tone yourself in the Voice Instructions field below.",
};

// Fallback used before the API responds or if it errors. Also covers legacy
// briefs that saved the slug-style tone value (e.g. "professional").
const FALLBACK_TONE_OPTIONS: ToneOption[] = [
  {
    value: "Professional",
    title: "Professional",
    description:
      "Polished, measured, and trustworthy — for brands that want to sound like experts.",
  },
  {
    value: "Energetic",
    title: "Energetic",
    description:
      "High-octane and enthusiastic — perfect for time-sensitive offers and exciting launches.",
  },
  {
    value: "Warm",
    title: "Warm",
    description:
      "Soft, inviting, and sincere — like a friendly recommendation from someone you trust.",
  },
  {
    value: "Authoritative",
    title: "Authoritative",
    description:
      "Confident, deep, and commanding — for brands that speak from a position of expertise.",
  },
  {
    value: "Sarcastic",
    title: "Sarcastic",
    description:
      "Dry and tongue-in-cheek — for irreverent brands that aren’t afraid to wink at their audience.",
  },
];

export type BriefPanelBaseProps = {
  disabled?: boolean;

  clientDescription: string;
  onClientDescriptionChanged: (value: string) => void;

  creativeBrief: string;
  onCreativeBriefChanged: (value: string) => void;

  language: Language;
  onLanguageChanged: (value: Language) => void;

  campaignFormat: CampaignFormat;
  onCampaignFormatChanged: (value: CampaignFormat) => void;

  region: string | null;
  onRegionChanged: (value: string | null) => void;

  provider: Provider;
  onProviderChanged: (value: Provider) => void;

  accent: string;
  onAccentChanged: (value: string) => void;

  cta: string | null;
  onCTAChanged: (value: string | null) => void;

  pacing: Pacing | null;
  onPacingChanged: (value: Pacing | null) => void;

  toneOfVoiceList: Record<string, string>;
  toneOfVoiceOptions: ToneOption[];

  toneOfVoice: string | null;
  onToneOfVoiceChanged: (value: string | null) => void;

  voiceInstructions: string;
  onVoiceInstructionsChanged: (value: string) => void;

  adDuration: number;
  onAdDurationChanged: (value: number) => void;

  error: string | null;
};

export const BriefPanelBase = ({
  disabled,
  clientDescription,
  onClientDescriptionChanged,
  creativeBrief,
  onCreativeBriefChanged,
  language,
  onLanguageChanged,
  campaignFormat,
  onCampaignFormatChanged,
  region,
  onRegionChanged,
  provider,
  onProviderChanged,
  accent,
  onAccentChanged,
  cta,
  onCTAChanged,
  pacing,
  onPacingChanged,
  toneOfVoice,
  toneOfVoiceList,
  toneOfVoiceOptions,
  onToneOfVoiceChanged,
  voiceInstructions,
  onVoiceInstructionsChanged,
  adDuration,
  onAdDurationChanged,
  error,
}: BriefPanelBaseProps) => {
  // Tracks the last template string we auto-applied, so we can detect whether the user has edited it.
  const lastAppliedTemplateRef = useRef<string>("");

  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

  // Static data (loaded once on mount)
  const { languages: availableLanguages, isLoading: isLoadingLanguages } =
    useBriefOptions();

  // Language-dependent options (single API call when language/format/region/provider/accent changes)
  // Region filters accents, provider/accent determine dialogReady
  const { options: languageOptions, isLoading: isLoadingOptions } =
    useLanguageOptions(language, campaignFormat, region, provider, accent);

  const availableRegions = languageOptions?.regions || [];
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
  const hasRegions = languageOptions?.hasRegions ?? false;
  const hasAccents = languageOptions?.hasAccents ?? false;
  const dialogReady = languageOptions?.dialogReady ?? true;
  const isLoading = isLoadingLanguages || isLoadingOptions;

  const [languageQuery, setLanguageQuery] = useState("");

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!availableLanguages || availableLanguages.length === 0) return [];
    if (languageQuery === "") return availableLanguages;
    return availableLanguages.filter(
      (lang) =>
        lang &&
        lang.name &&
        lang.name.toLowerCase().includes(languageQuery.toLowerCase()),
    );
  }, [languageQuery, availableLanguages]);

  // Warnings
  const shouldWarnAboutDialog = !dialogReady && campaignFormat === "dialog";
  const shouldSuggestProvider =
    voiceCounts && (voiceCounts[provider] || 0) === 0;

  // Seed voiceInstructions from the preset template when the user hasn't edited.
  // If the current textarea equals the last template we applied (or is empty),
  // overwrite with the new preset's template. Otherwise, preserve user edits.
  // "custom" and "none" clear the last-template tracker so any future preset pick seeds again.
  const handleToneChange = useCallback(
    (value: string | null) => {
      onToneOfVoiceChanged(value);
      if (value && value !== "custom" && toneOfVoiceList[value]) {
        const template = toneOfVoiceList[value];
        const untouched =
          voiceInstructions === "" ||
          voiceInstructions === lastAppliedTemplateRef.current;
        if (untouched) {
          onVoiceInstructionsChanged(template);
          lastAppliedTemplateRef.current = template;
        }
      } else {
        // "custom" or null — stop tracking a template so further preset picks can seed again
        lastAppliedTemplateRef.current = "";
      }
    },
    [voiceInstructions, toneOfVoiceList],
  );

  // Restore Voice Instructions to the current preset's template (or empty for none/custom)
  // and re-enable future preset-driven seeding.
  const handleResetVoiceInstructions = useCallback(() => {
    if (
      toneOfVoice &&
      toneOfVoice !== "custom" &&
      toneOfVoiceList[toneOfVoice]
    ) {
      const template = toneOfVoiceList[toneOfVoice];
      onToneOfVoiceChanged(template);
      lastAppliedTemplateRef.current = template;
    } else {
      onToneOfVoiceChanged("");
      lastAppliedTemplateRef.current = "";
    }
  }, [toneOfVoice, toneOfVoiceList]);

  // Full tone list shown in the ToneSelector = admin presets + the custom sentinel.
  const computedToneOptions = useMemo<ToneOption[]>(
    () => [
      ...(toneOfVoiceOptions.length
        ? toneOfVoiceOptions
        : FALLBACK_TONE_OPTIONS),
      CUSTOM_TONE_OPTION,
    ],
    [toneOfVoiceOptions],
  );

  const computedDisabled = disabled || isLoading;

  return (
    <>
      {/* Row 1: Client Description and Creative Brief */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Column 1: Client Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            What are we promoting (brand name, product, service)?
          </label>
          <GlassyTextarea
            disabled={computedDisabled}
            value={clientDescription}
            onChange={(e) => onClientDescriptionChanged(e.target.value)}
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
            disabled={computedDisabled}
            value={creativeBrief}
            onChange={(e) => onCreativeBriefChanged(e.target.value)}
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
              {getFlagCode(language)}
            </span>
          </label>
          <GlassyCombobox
            value={
              availableLanguages.find((l) => l.code === language)
                ? {
                    value: language,
                    label: availableLanguages.find((l) => l.code === language)!
                      .name,
                    flag: getFlagCode(language),
                  }
                : null
            }
            onChange={(item) =>
              item && onLanguageChanged(item.value as Language)
            }
            options={filteredLanguages
              .filter((lang) => lang && lang.code && lang.name)
              .map((lang) => ({
                value: lang.code,
                label: lang.name,
                flag: getFlagCode(lang.code),
              }))}
            onQueryChange={setLanguageQuery}
            disabled={computedDisabled}
          />
        </div>

        {/* Column 2: Region */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Region
          </label>
          {hasRegions ? (
            <GlassyListbox
              value={region || "all"}
              onChange={(value) => onRegionChanged(value || null)}
              options={availableRegions.map((r) => ({
                value: r.code,
                label: r.displayName,
              }))}
              disabled={availableRegions.length === 0 || computedDisabled}
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
              value={accent}
              onChange={onAccentChanged}
              options={availableAccents.map((a) => ({
                value: a.code,
                label: a.displayName,
              }))}
              disabled={availableAccents.length === 0 || computedDisabled}
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
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                campaignFormat === "ad_read"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onCampaignFormatChanged("ad_read")}
              title="Single Voice Ad Read"
            >
              <SingleVoiceIcon />
              <span className="text-xs">Single</span>
            </div>

            {/* Dialogue option */}
            <div
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                campaignFormat === "dialog"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onCampaignFormatChanged("dialog")}
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
            value={cta || "none"}
            onChange={(value) => onCTAChanged(value === "none" ? null : value)}
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
                {provider === "any"
                  ? "Any"
                  : provider.charAt(0).toUpperCase() + provider.slice(1)}
                {" ("}
                {isLoading ? "..." : voiceCounts[provider] || 0}
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
              💡 Try another provider - {voiceCounts[provider] || 0} voices
            </p>
          )}
        </div>
      </div>

      {/* Row 3.5: Pacing (col 1) + Tone of Voice (cols 2-3) */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Pacing
          </label>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2">
            <div
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                pacing === null
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onPacingChanged(null)}
              title="Normal - Standard delivery pace"
            >
              <TurtleIcon />
              <span className="text-xs">Normal</span>
            </div>
            <div
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                pacing === "fast"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onPacingChanged("fast")}
              title="Fast - Energetic, urgent delivery"
            >
              <RabbitIcon />
              <span className="text-xs">Fast</span>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tone of Voice{" "}
            <span className="text-gray-500 font-normal">
              (choose how your ad should sound)
            </span>
          </label>
          <ToneSelector
            value={toneOfVoice}
            onChange={handleToneChange}
            options={computedToneOptions}
            emptyOption={TONE_EMPTY_OPTION}
            disabled={isLoading || computedDisabled}
          />
        </div>
      </div>

      {/* Row 3.6: Voice Instructions (cols 2-3) with Reset to Default below the textarea */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div />
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Voice Instructions{" "}
            <span className="text-gray-500 font-normal">
              — fine-tune how this voice is delivered. You can edit or rewrite
              these instructions.
            </span>
          </label>
          <GlassyTextarea
            value={voiceInstructions}
            onChange={(e) => onVoiceInstructionsChanged(e.target.value)}
            placeholder="e.g. Deliver with a polished, measured cadence. Crisp consonants and confident pacing…"
            rows={4}
            disabled={computedDisabled}
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={handleResetVoiceInstructions}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs px-4 py-2 transition-colors"
              disabled={computedDisabled}
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              <span>Reset to Default</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 4: Pacing and Duration */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div />
        {/* Column 2-3: Duration (spans 2 columns) */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Ad Duration{" "}
            <span className="text-sm text-gray-400">{adDuration} seconds</span>
          </label>
          <GlassySlider
            disabled={computedDisabled}
            label={null}
            value={adDuration}
            onChange={onAdDurationChanged}
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
        selectedProvider={provider}
        onSelectProvider={onProviderChanged}
        voiceCounts={voiceCounts}
      />
    </>
  );
};
