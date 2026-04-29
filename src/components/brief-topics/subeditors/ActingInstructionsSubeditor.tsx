/**
 * ActingInstructionsSubeditor — packaged tone + voice-delivery instructions
 * pair, rendered inside Creative topic's "Acting instructions" collapsible.
 *
 * Internal layout mirrors BriefPanelBase Row 3.5 / 3.6 verbatim: Tone in
 * column 1, voiceInstructions textarea spanning columns 2-3 with the
 * Reset-to-default chip below it.
 *
 * Owns the template-seeding logic that auto-populates `voiceInstructions`
 * from the picked tone preset's template (only when the user hasn't typed
 * anything yet) — same `lastAppliedTemplateRef` pattern from main's
 * BriefPanelBase + V3 thin wrapper.
 */

import { useCallback, useMemo, useRef } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import type { ToneOption } from "../../ui/ToneSelector";
import { GlassyTextarea, ToneSelector } from "../../ui";

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

export interface ActingInstructionsSubeditorProps {
  selectedTone: string | null;
  onSelectedToneChanged: (value: string | null) => void;

  voiceInstructions: string;
  onVoiceInstructionsChanged: (value: string) => void;

  toneOptions: ToneOption[];
  toneInstructions: Record<string, string>;

  disabled?: boolean;
}

export function ActingInstructionsSubeditor({
  selectedTone,
  onSelectedToneChanged,
  voiceInstructions,
  onVoiceInstructionsChanged,
  toneOptions,
  toneInstructions,
  disabled,
}: ActingInstructionsSubeditorProps) {
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
    [
      voiceInstructions,
      toneInstructions,
      onSelectedToneChanged,
      onVoiceInstructionsChanged,
    ]
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
    <div className="grid grid-cols-3 gap-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Tone
        </label>
        <ToneSelector
          value={selectedTone}
          onChange={handleToneChange}
          options={computedToneOptions}
          emptyOption={TONE_EMPTY_OPTION}
          disabled={disabled}
        />
      </div>
      <div className="col-span-2">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Voice instructions{" "}
          <span className="text-gray-500 font-normal">
            — fine-tune how the voice is delivered. Edit or rewrite freely.
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
    </div>
  );
}
