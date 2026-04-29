/**
 * LanguageTopic — voice / market technicalities. Same content as v3.5
 * BriefPanelBase's language + format + duration rows; just regrouped
 * under a single topic shell so the brand-and-creative sections breathe.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";
import {
  DialogueIcon,
  GlassyCombobox,
  GlassyListbox,
  GlassySlider,
  ProviderSelectionModal,
  RabbitIcon,
  SingleVoiceIcon,
  TurtleIcon,
} from "../ui";
import type { CampaignFormat, Pacing, Provider } from "@/types";
import { getFlagCode, type Language } from "@/utils/language";
import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";
import { twMerge } from "tailwind-merge";

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

export interface LanguageTopicProps {
  selectedLanguage: Language;
  onSelectedLanguageChanged: (value: Language) => void;

  campaignFormat: CampaignFormat;
  onCampaignFormatChanged: (value: CampaignFormat) => void;

  selectedRegion: string | null;
  onSelectedRegionChanged: (value: string | null) => void;

  selectedAccent: string;
  onSelectedAccentChanged: (value: string) => void;

  selectedProvider: Provider;
  onSelectedProviderChanged: (value: Provider) => void;

  selectedPacing: Pacing | null;
  onSelectedPacingChanged: (value: Pacing | null) => void;

  adDuration: number;
  onAdDurationChanged: (value: number) => void;

  disabled?: boolean;
}

export function LanguageTopic({
  selectedLanguage,
  onSelectedLanguageChanged,
  campaignFormat,
  onCampaignFormatChanged,
  selectedRegion,
  onSelectedRegionChanged,
  selectedAccent,
  onSelectedAccentChanged,
  selectedProvider,
  onSelectedProviderChanged,
  selectedPacing,
  onSelectedPacingChanged,
  adDuration,
  onAdDurationChanged,
  disabled,
}: LanguageTopicProps) {
  const { languages: availableLanguages, isLoading: isLoadingLanguages } =
    useBriefOptions();

  const { options: languageOptions, isLoading: isLoadingOptions } =
    useLanguageOptions(
      selectedLanguage,
      campaignFormat,
      selectedRegion,
      selectedProvider,
      selectedAccent,
    );

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
  const computedDisabled = disabled || isLoading;

  const [languageQuery, setLanguageQuery] = useState("");
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

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

  // Auto-select suggested provider when language changes (preserves the
  // v3.5 V3 novice-UX behaviour). Tracks which language we last
  // auto-selected provider FOR so we don't loop on user re-picks.
  const lastAutoSelectedLanguageRef = useRef<string | null>(null);
  useEffect(() => {
    const optionsMatchLanguage =
      languageOptions?.language === selectedLanguage;
    const alreadyAutoSelected =
      lastAutoSelectedLanguageRef.current === selectedLanguage;

    if (
      optionsMatchLanguage &&
      languageOptions?.suggestedProvider &&
      !alreadyAutoSelected
    ) {
      lastAutoSelectedLanguageRef.current = selectedLanguage;
      onSelectedProviderChanged(languageOptions.suggestedProvider);
      onSelectedRegionChanged(null);
      onSelectedAccentChanged("neutral");
    }
  }, [selectedLanguage, languageOptions, onSelectedProviderChanged, onSelectedRegionChanged, onSelectedAccentChanged]);

  // Reset accent when region change makes the previous accent invalid.
  useEffect(() => {
    if (availableAccents.length > 0 && selectedAccent !== "neutral") {
      const accentStillAvailable = availableAccents.some(
        (a) => a.code === selectedAccent,
      );
      if (!accentStillAvailable) {
        onSelectedAccentChanged("neutral");
      }
    }
  }, [availableAccents, selectedAccent, onSelectedAccentChanged]);

  const shouldWarnAboutDialog = !dialogReady && campaignFormat === "dialog";
  const shouldSuggestProvider =
    voiceCounts && (voiceCounts[selectedProvider] || 0) === 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Language &amp; Voice</h2>
        <p className="text-xs text-gray-500">
          Voice provider, language, accent, format, pacing, duration.
        </p>
      </div>

      {/* Row 1: Language, Region, Accent */}
      <div className="grid grid-cols-3 gap-6">
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
                      (l) => l.code === selectedLanguage,
                    )!.name,
                    flag: getFlagCode(selectedLanguage),
                  }
                : null
            }
            onChange={(item) =>
              item && onSelectedLanguageChanged(item.value as Language)
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

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Voice region
          </label>
          {hasRegions ? (
            <GlassyListbox
              value={selectedRegion || "all"}
              onChange={(value) => onSelectedRegionChanged(value || null)}
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

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Accent
          </label>
          {hasAccents ? (
            <GlassyListbox
              value={selectedAccent}
              onChange={onSelectedAccentChanged}
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

      {/* Row 2: Format, Pacing, Provider */}
      <div className="grid grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Ad format
          </label>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2">
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
              Not enough voices for dialogue — need at least 2
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Pacing
          </label>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2">
            <div
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                selectedPacing === null
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onSelectedPacingChanged(null)}
              title="Normal — Standard delivery pace"
            >
              <TurtleIcon />
              <span className="text-xs">Normal</span>
            </div>
            <div
              className={twMerge(
                "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer transition-colors duration-200",
                selectedPacing === "fast"
                  ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                  : "bg-transparent hover:bg-white/10 text-gray-300",
                disabled ? "pointer-events-none" : "",
              )}
              onClick={() => onSelectedPacingChanged("fast")}
              title="Fast — Energetic, urgent delivery"
            >
              <RabbitIcon />
              <span className="text-xs">Fast</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Voice provider
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
                {isLoading ? "..." : voiceCounts[selectedProvider] || 0}
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
              Try another provider — {voiceCounts[selectedProvider] || 0} voices
            </p>
          )}
        </div>
      </div>

      {/* Row 3: Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Ad duration{" "}
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
        <div className="mt-3 text-xs text-gray-500">
          Spotify: Standard ads max 30s. Long-form (60s) in select markets only.
          {adDuration > 30 && (
            <span className="text-red-900 ml-1">
              Duration exceeds 30s standard.
            </span>
          )}
        </div>
      </div>

      <ProviderSelectionModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectedProviderChanged}
        voiceCounts={voiceCounts}
      />
    </section>
  );
}
