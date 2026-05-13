/**
 * CreativeTopic — what the spot is, how it sounds, and the campaign-
 * execution mechanics around it (format, pacing, CTA, duration).
 *
 * Layout (per the user's spec):
 *   Heading row: "Creative" h2 + subtitle on the left; tabbar
 *     ("Brief the agent" / "I have the script") inline on the right.
 *   Row 1: creativeBrief | creativeAngle | tone (each 1/3)
 *   Row 2: format | pacing | cta (each 1/3)
 *   Row 3: duration (full-width slider)
 *   Collapsibles row: instructions | references | forbidden — three
 *     collapsibles side-by-side, each in 1/3.
 *
 * In "I have the script" mode the entire body above swaps to a single
 * verbatim-script textarea — the brief save still carries both fields
 * so toggling preserves edits.
 *
 * Why creativeAngle is exposed (and never collapses): brand-anchoring
 * ladder rests on `brandVoice = constant, creativeAngle = per-spot
 * variance`. Hide the angle and Heineken Bulgaria reads the same in
 * every ad — measured regression in v3.5 production.
 */

import type { CampaignFormat, Pacing, Provider } from "@/types";
import { MicrophoneIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import {
  GlassTab,
  GlassTabBar,
  GlassyListbox,
  GlassySlider,
  GlassyTextarea,
  ProviderSelectionModal,
  RabbitIcon,
  ToneSelector,
  TurtleIcon,
} from "../ui";
import type { ToneOption } from "../ui/ToneSelector";
import { CollapsibleSection } from "./CollapsibleSection";
import { CustomScriptSubeditor } from "./subeditors/CustomScriptSubeditor";
import { ForbiddenWordsSubeditor } from "./subeditors/ForbiddenWordsSubeditor";
import { ReferenceUrlsSubeditor } from "./subeditors/ReferenceUrlsSubeditor";
import { VoiceInstructionsSubeditor } from "./subeditors/VoiceInstructionsSubeditor";

// Six campaign formats per the v3.5 prompting rewrite. Listbox surface
// (was a 2-button toggle in v3.5 BriefPanelBase, but the type union was
// always 6 — UI was lagging the prompt). Order: most-common first.
const FORMAT_OPTIONS: Array<{ value: CampaignFormat; label: string }> = [
  { value: "ad_read", label: "Ad read (single voice)" },
  { value: "dialog", label: "Dialogue (two voices)" },
  { value: "testimonial", label: "Testimonial (first-person)" },
  { value: "vox_pop", label: "Vox pop (street interviews)" },
  { value: "dramatized_scene", label: "Dramatized scene (characters)" },
  { value: "radio_skit", label: "Radio skit (comedic sketch)" },
];

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

const TONE_EMPTY_OPTION: ToneOption = {
  value: "none",
  title: "No specific tone",
  description: "Let the system decide based on the brief and target audience.",
};

const CUSTOM_TONE_OPTION: ToneOption = {
  value: "custom",
  title: "Custom…",
  description:
    "Describe the tone yourself in the Voice Instructions field below.",
};

export interface CreativeTopicProps {
  creativeBrief: string;
  onCreativeBriefChanged: (value: string) => void;

  creativeAngle: string;
  onCreativeAngleChanged: (value: string) => void;

  selectedTone: string | null;
  onSelectedToneChanged: (value: string | null) => void;

  voiceInstructions: string;
  onVoiceInstructionsChanged: (value: string) => void;

  toneOptions: ToneOption[];
  toneInstructions: Record<string, string>;

  // Campaign-execution axes — the user spec moved these into Creative.
  campaignFormat: CampaignFormat;
  onCampaignFormatChanged: (value: CampaignFormat) => void;

  selectedPacing: Pacing | null;
  onSelectedPacingChanged: (value: Pacing | null) => void;

  selectedCTA: string | null;
  onSelectedCTAChanged: (value: string | null) => void;

  adDuration: number;
  onAdDurationChanged: (value: number) => void;

  // Provider modal launcher (lifted in from LanguageTopic so the dialog
  // warning copy stays close to format / voiceCounts).
  selectedProvider: Provider;
  onSelectedProviderChanged: (value: Provider) => void;
  voiceCounts: Record<Provider, number>;
  dialogReady: boolean;

  referenceUrlsText: string;
  onReferenceUrlsChanged: (value: string) => void;

  forbiddenWords: string;
  onForbiddenWordsChanged: (value: string) => void;

  providedScript: string;
  onProvidedScriptChanged: (value: string) => void;

  showAngleNudge?: boolean;
  disabled?: boolean;
}

type CreativeMode = "brief" | "script";

export function CreativeTopic({
  creativeBrief,
  onCreativeBriefChanged,
  creativeAngle,
  onCreativeAngleChanged,
  selectedTone,
  onSelectedToneChanged,
  voiceInstructions,
  onVoiceInstructionsChanged,
  toneOptions,
  toneInstructions,
  campaignFormat,
  onCampaignFormatChanged,
  selectedPacing,
  onSelectedPacingChanged,
  selectedCTA,
  onSelectedCTAChanged,
  adDuration,
  onAdDurationChanged,
  selectedProvider,
  onSelectedProviderChanged,
  voiceCounts,
  dialogReady,
  referenceUrlsText,
  onReferenceUrlsChanged,
  forbiddenWords,
  onForbiddenWordsChanged,
  providedScript,
  onProvidedScriptChanged,
  showAngleNudge,
  disabled,
}: CreativeTopicProps) {
  const [creativeMode, setCreativeMode] = useState<CreativeMode>(() =>
    providedScript.trim().length > 0 ? "script" : "brief",
  );

  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

  // Tone preset → voiceInstructions seeding. Tone lives in Row 1
  // (exposed); voiceInstructions lives in the collapsible. The seeding
  // logic stays here so picking a preset auto-fills the instructions
  // textarea (when the user hasn't edited it). Same lastAppliedTemplateRef
  // pattern from v3.5 BriefPanelBase.
  const lastAppliedTemplateRef = useRef<string>("");

  const computedToneOptions = useMemo<ToneOption[]>(
    () => [...toneOptions, CUSTOM_TONE_OPTION],
    [toneOptions],
  );

  const handleToneChange = useCallback(
    (value: string | null) => {
      onSelectedToneChanged(value);
      if (value && value !== "custom" && toneInstructions[value]) {
        const template = toneInstructions[value];
        const untouched =
          voiceInstructions === "" ||
          voiceInstructions === lastAppliedTemplateRef.current;
        if (untouched) {
          onVoiceInstructionsChanged(template);
          lastAppliedTemplateRef.current = template;
        }
      } else {
        lastAppliedTemplateRef.current = "";
      }
    },
    [
      voiceInstructions,
      toneInstructions,
      onSelectedToneChanged,
      onVoiceInstructionsChanged,
    ],
  );

  const handleResetVoiceInstructions = useCallback(() => {
    if (
      selectedTone &&
      selectedTone !== "custom" &&
      toneInstructions[selectedTone]
    ) {
      const template = toneInstructions[selectedTone];
      onVoiceInstructionsChanged(template);
      lastAppliedTemplateRef.current = template;
    } else {
      onVoiceInstructionsChanged("");
      lastAppliedTemplateRef.current = "";
    }
  }, [selectedTone, toneInstructions, onVoiceInstructionsChanged]);

  // Auto-expand collapsibles only on first load when their fields carry
  // content. Avoid reacting to live edits.
  // Instructions stays closed always — picking a tone preset auto-seeds
  // voiceInstructions, and we don't want the section to pop open every
  // time the user picks a tone.
  const referencesDefaultOpen = referenceUrlsText.trim().length > 0;
  const forbiddenDefaultOpen = forbiddenWords.trim().length > 0;

  const shouldWarnAboutDialog = !dialogReady && campaignFormat === "dialog";
  const shouldSuggestProvider =
    voiceCounts && (voiceCounts[selectedProvider] || 0) === 0;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Creative</h2>
          <p className="text-xs text-gray-500">
            What the spot says, how the voice delivers it, the campaign
            mechanics around it.
          </p>
        </div>
        <GlassTabBar>
          <GlassTab
            isActive={creativeMode === "brief"}
            onClick={() => setCreativeMode("brief")}
          >
            <span className="px-2 text-xs">Brief the agent</span>
          </GlassTab>
          <GlassTab
            isActive={creativeMode === "script"}
            onClick={() => setCreativeMode("script")}
          >
            <span className="px-2 text-xs">I have the script</span>
          </GlassTab>
        </GlassTabBar>
      </div>

      {creativeMode === "script" ? (
        <CustomScriptSubeditor
          value={providedScript}
          onChange={onProvidedScriptChanged}
          disabled={disabled}
        />
      ) : (
        <>
          {/* Exposed row: Brief | Format | CTA */}
          <div className="grid grid-cols-3 gap-6 items-start">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Creative brief{" "}
                <span className="text-gray-500 font-normal text-xs">
                  (description of the ad — required)
                </span>
              </label>
              <GlassyTextarea
                value={creativeBrief}
                onChange={(e) => onCreativeBriefChanged(e.target.value)}
                placeholder="What this spot is about, who it's for, key messages…"
                rows={6}
                disabled={disabled}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Ad format
              </label>
              <GlassyListbox
                value={campaignFormat}
                onChange={(value) =>
                  onCampaignFormatChanged(value as CampaignFormat)
                }
                options={FORMAT_OPTIONS}
                disabled={disabled}
              />
              {shouldWarnAboutDialog && (
                <p className="text-xs text-yellow-400 mt-2">
                  Not enough voices for dialogue — need at least 2
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tone of voice{" "}
                <span className="text-gray-500 font-normal text-xs">
                  (how the line is read)
                </span>
              </label>
              <ToneSelector
                value={selectedTone}
                onChange={handleToneChange}
                options={computedToneOptions}
                emptyOption={TONE_EMPTY_OPTION}
                disabled={disabled}
              />
              {shouldSuggestProvider && (
                <button
                  type="button"
                  onClick={() => setIsProviderModalOpen(true)}
                  className="text-xs text-orange-400 hover:text-orange-300 mt-2 flex items-center gap-1 transition-colors"
                >
                  <MicrophoneIcon className="h-3 w-3" />
                  Try another provider — {voiceCounts[selectedProvider] ||
                    0}{" "}
                  voices
                </button>
              )}
            </div>
          </div>

          {/* Collapsibles row 1: Angle | Instructions | References */}
          <div className="grid grid-cols-3 gap-6 items-start pt-2">
            <CollapsibleSection
              title="Creative angle"
              description="per-spot variance"
              defaultOpen={creativeAngle.trim().length > 0}
            >
              <GlassyTextarea
                value={creativeAngle}
                onChange={(e) => onCreativeAngleChanged(e.target.value)}
                placeholder="What makes THIS ad different from every other ad for this brand? E.g. 'urgent 24h Black Friday push, hook drops at 0:03'."
                rows={4}
                disabled={disabled}
              />
              {showAngleNudge && (
                <p className="mt-2 text-xs text-amber-400">
                  Without an angle, the script will brand-anchor cleanly but
                  lose the per-spot edge.
                </p>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Instructions"
              description="voice delivery"
              defaultOpen={false}
            >
              <VoiceInstructionsSubeditor
                value={voiceInstructions}
                onChange={onVoiceInstructionsChanged}
                onReset={handleResetVoiceInstructions}
                disabled={disabled}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="References"
              description="brand sources / prior ads"
              defaultOpen={referencesDefaultOpen}
            >
              <ReferenceUrlsSubeditor
                value={referenceUrlsText}
                onChange={onReferenceUrlsChanged}
                disabled={disabled}
              />
            </CollapsibleSection>
          </div>

          {/* Collapsibles row 2: Forbidden | Pacing | Tone */}
          <div className="grid grid-cols-3 gap-6 items-start">
            <CollapsibleSection
              title="Forbidden"
              description="words / phrases to avoid"
              defaultOpen={forbiddenDefaultOpen}
            >
              <ForbiddenWordsSubeditor
                value={forbiddenWords}
                onChange={onForbiddenWordsChanged}
                disabled={disabled}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Pacing"
              badge={selectedPacing === "fast" ? "Fast" : "Normal"}
              defaultOpen={false}
            >
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Call to action"
              badge={
                selectedCTA
                  ? CTA_OPTIONS.find((o) => o.value === selectedCTA)?.label ||
                    selectedCTA
                  : undefined
              }
              defaultOpen={!!selectedCTA}
            >
              <GlassyListbox
                value={selectedCTA || "none"}
                onChange={(value) =>
                  onSelectedCTAChanged(value === "none" ? null : value)
                }
                options={CTA_OPTIONS}
                disabled={disabled}
              />
            </CollapsibleSection>
          </div>

          {/* Duration — last in the Creative block per the v4 spec */}
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Ad duration{" "}
              <span className="text-sm text-gray-400">
                {adDuration} seconds
              </span>
            </label>
            <GlassySlider
              disabled={disabled}
              label={null}
              value={adDuration}
              onChange={onAdDurationChanged}
              min={10}
              max={60}
              step={5}
              tickMarks={DURATION_TICK_MARKS}
            />
            <div className="mt-3 text-xs text-gray-500">
              Spotify: standard ads max 30s; long-form (60s) in select markets
              only.
              {adDuration > 30 && (
                <span className="text-red-900 ml-1">
                  Duration exceeds 30s standard.
                </span>
              )}
            </div>
          </div>
        </>
      )}

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
