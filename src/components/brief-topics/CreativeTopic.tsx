/**
 * CreativeTopic — what the spot is and how it sounds. Exposes the load-
 * bearing creative fields (brief, angle, tone, voice instructions, CTA)
 * inline; advanced options (reference URLs, forbidden words, custom
 * script) sit behind collapsibles.
 *
 * Why creativeAngle is exposed (and never collapses): brand-anchoring
 * ladder rests on `brandVoice = constant, creativeAngle = per-spot
 * variance`. Hide the angle and Heineken Bulgaria reads the same in
 * every ad — measured regression in v3.5 production.
 */

import { useCallback, useMemo, useRef } from "react";
import type { ToneOption } from "../ui/ToneSelector";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { GlassyTextarea, GlassyListbox, ToneSelector } from "../ui";
import { CollapsibleSection } from "./CollapsibleSection";
import { ReferenceUrlsSubeditor } from "./subeditors/ReferenceUrlsSubeditor";
import { ForbiddenWordsSubeditor } from "./subeditors/ForbiddenWordsSubeditor";
import { CustomScriptSubeditor } from "./subeditors/CustomScriptSubeditor";

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

  selectedCTA: string | null;
  onSelectedCTAChanged: (value: string | null) => void;

  referenceUrlsText: string;
  onReferenceUrlsChanged: (value: string) => void;

  forbiddenWords: string;
  onForbiddenWordsChanged: (value: string) => void;

  providedScript: string;
  onProvidedScriptChanged: (value: string) => void;

  showAngleNudge?: boolean;
  disabled?: boolean;
}

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
  selectedCTA,
  onSelectedCTAChanged,
  referenceUrlsText,
  onReferenceUrlsChanged,
  forbiddenWords,
  onForbiddenWordsChanged,
  providedScript,
  onProvidedScriptChanged,
  showAngleNudge,
  disabled,
}: CreativeTopicProps) {
  // Tracks the last template string we auto-applied, so we can detect
  // whether the user has edited it. Mirrors BriefPanelBase's pattern.
  const lastAppliedTemplateRef = useRef<string>("");

  const computedToneOptions = useMemo<ToneOption[]>(
    () => [...toneOptions, CUSTOM_TONE_OPTION],
    [toneOptions]
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
    [voiceInstructions, toneInstructions, onSelectedToneChanged, onVoiceInstructionsChanged]
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

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Creative</h2>
        <p className="text-xs text-gray-500">
          What the spot says, how the voice delivers it.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Creative brief{" "}
          <span className="text-gray-500 font-normal">
            (description of the ad — required)
          </span>
        </label>
        <GlassyTextarea
          value={creativeBrief}
          onChange={(e) => onCreativeBriefChanged(e.target.value)}
          placeholder="Describe the creative direction, key messages, and target audience…"
          rows={5}
          disabled={disabled}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Creative angle
          <span className="ml-2 text-xs text-gray-500">
            (the variance — what makes THIS ad different from every other
            ad for this brand)
          </span>
        </label>
        <GlassyTextarea
          value={creativeAngle}
          onChange={(e) => onCreativeAngleChanged(e.target.value)}
          placeholder="What is THIS ad asking the listener to feel or do that no other ad for this brand would? E.g. 'urgent 24h Black Friday push, hook drops at 0:03' — one or two sentences specific to this spot."
          rows={3}
          disabled={disabled}
        />
        {showAngleNudge && (
          <p className="mt-2 text-xs text-amber-400">
            Without an angle, the script will brand-anchor cleanly but lose
            the per-spot edge — type one sentence specific to THIS spot.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Tone of voice{" "}
          <span className="text-gray-500 font-normal">
            (choose how your ad should sound)
          </span>
        </label>
        <ToneSelector
          value={selectedTone}
          onChange={handleToneChange}
          options={computedToneOptions}
          emptyOption={TONE_EMPTY_OPTION}
          disabled={disabled}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Voice instructions{" "}
          <span className="text-gray-500 font-normal">
            — fine-tune how this voice is delivered. Edit or rewrite freely.
          </span>
        </label>
        <GlassyTextarea
          value={voiceInstructions}
          onChange={(e) => onVoiceInstructionsChanged(e.target.value)}
          placeholder="e.g. Deliver with a polished, measured cadence. Crisp consonants and confident pacing…"
          rows={4}
          disabled={disabled}
        />
        <div className="mt-3">
          <button
            type="button"
            onClick={handleResetVoiceInstructions}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs px-4 py-2 transition-colors"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            <span>Reset to default</span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Call to action (CTA)
        </label>
        <GlassyListbox
          value={selectedCTA || "none"}
          onChange={(value) =>
            onSelectedCTAChanged(value === "none" ? null : value)
          }
          options={CTA_OPTIONS}
          disabled={disabled}
        />
      </div>

      <div className="space-y-3 pt-2">
        <CollapsibleSection
          title="Reference URLs"
          description="brand sources, prior ads to inherit voice from"
          defaultOpen={referenceUrlsText.trim().length > 0}
        >
          <ReferenceUrlsSubeditor
            value={referenceUrlsText}
            onChange={onReferenceUrlsChanged}
            disabled={disabled}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Forbidden words"
          description="phrases the LLM should avoid"
          defaultOpen={forbiddenWords.trim().length > 0}
        >
          <ForbiddenWordsSubeditor
            value={forbiddenWords}
            onChange={onForbiddenWordsChanged}
            disabled={disabled}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Custom script"
          description="provide verbatim copy instead of letting the agent write"
          defaultOpen={providedScript.trim().length > 0}
        >
          <CustomScriptSubeditor
            value={providedScript}
            onChange={onProvidedScriptChanged}
            disabled={disabled}
          />
        </CollapsibleSection>
      </div>
    </section>
  );
}
