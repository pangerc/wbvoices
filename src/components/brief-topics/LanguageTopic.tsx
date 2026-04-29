/**
 * LanguageTopic — single row of three pickers that respond to the
 * market choice in BrandTopic: language (defaults from market.language),
 * voice region (filtered by language), accent (filtered by region +
 * language).
 *
 * Voice provider sits in the heading row's right side as a small button
 * that opens the provider-selection modal. Format / pacing / CTA /
 * duration moved out to CreativeTopic per the v4 layout spec.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";
import {
  GlassyCombobox,
  GlassyListbox,
  ProviderSelectionModal,
} from "../ui";
import type { CampaignFormat, Provider } from "@/types";
import { getFlagCode, type Language } from "@/utils/language";
import { useBriefOptions, useLanguageOptions } from "@/hooks/useBriefOptions";

export interface LanguageTopicProps {
  selectedLanguage: Language;
  onSelectedLanguageChanged: (value: Language) => void;

  // Used downstream by useLanguageOptions to filter voiceCounts /
  // dialogReady — the value lives in CreativeTopic but the hook needs
  // it here too. Read-only from this topic's perspective.
  campaignFormat: CampaignFormat;

  selectedRegion: string | null;
  onSelectedRegionChanged: (value: string | null) => void;

  selectedAccent: string;
  onSelectedAccentChanged: (value: string) => void;

  selectedProvider: Provider;
  onSelectedProviderChanged: (value: Provider) => void;

  // Lift voiceCounts + dialogReady up — CreativeTopic also needs them
  // (provider-suggestion warning, dialog-format warning). The parent
  // computes them via useLanguageOptions and passes the same memo to
  // both topics. Wait — actually the hook is called here; we expose
  // the resolved values through a callback so the parent (BriefPanelV4)
  // can lift them to CreativeTopic too.
  onLanguageOptionsResolved?: (resolved: {
    voiceCounts: Record<Provider, number>;
    dialogReady: boolean;
  }) => void;

  disabled?: boolean;
}

export function LanguageTopic({
  selectedLanguage,
  onSelectedLanguageChanged,
  campaignFormat,
  selectedRegion,
  onSelectedRegionChanged,
  selectedAccent,
  onSelectedAccentChanged,
  selectedProvider,
  onSelectedProviderChanged,
  onLanguageOptionsResolved,
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
  const voiceCounts = useMemo(
    () =>
      languageOptions?.voiceCounts || {
        elevenlabs: 0,
        lovo: 0,
        openai: 0,
        qwen: 0,
        bytedance: 0,
        lahajati: 0,
        any: 0,
      },
    [languageOptions],
  );
  const hasRegions = languageOptions?.hasRegions ?? false;
  const hasAccents = languageOptions?.hasAccents ?? false;
  const dialogReady = languageOptions?.dialogReady ?? true;
  const isLoading = isLoadingLanguages || isLoadingOptions;
  const computedDisabled = disabled || isLoading;

  // Push voiceCounts + dialogReady up so CreativeTopic can render the
  // dialog-format warning + provider-suggestion warning. Stable
  // useMemo for voiceCounts means this fires only on actual change.
  useEffect(() => {
    onLanguageOptionsResolved?.({ voiceCounts, dialogReady });
  }, [voiceCounts, dialogReady, onLanguageOptionsResolved]);

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
  }, [
    selectedLanguage,
    languageOptions,
    onSelectedProviderChanged,
    onSelectedRegionChanged,
    onSelectedAccentChanged,
  ]);

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

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">
            Language &amp; Voice
          </h2>
          <p className="text-xs text-gray-500">
            Language, region, and accent — defaulted from the market.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 pt-2">
          <button
            onClick={() => setIsProviderModalOpen(true)}
            className="flex items-center gap-2 text-sm text-wb-blue hover:text-wb-blue/80 transition-colors"
          >
            <MicrophoneIcon className="h-3.5 w-3.5" />
            <span>
              {selectedProvider === "any"
                ? "Any"
                : selectedProvider.charAt(0).toUpperCase() +
                  selectedProvider.slice(1)}
              {" ("}
              {isLoading ? "…" : voiceCounts[selectedProvider] || 0}
              {")"}
            </span>
          </button>
          <a
            href="/admin/voice-manager"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span>Voice Manager</span>
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 items-start">
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
