/**
 * VoiceInstructionsSubeditor — voice-delivery prose body, rendered as
 * the "Instructions" collapsible inside Creative topic. Tone now lives
 * exposed in Creative Row 1; the auto-seeding logic that fills this
 * textarea from the picked tone preset is owned by CreativeTopic and
 * pushed into this subeditor via props (resetSignal triggers re-apply
 * of the active template).
 */

import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { GlassyTextarea } from "../../ui";

export interface VoiceInstructionsSubeditorProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  disabled?: boolean;
}

export function VoiceInstructionsSubeditor({
  value,
  onChange,
  onReset,
  disabled,
}: VoiceInstructionsSubeditorProps) {
  return (
    <div>
      <GlassyTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Polished, measured cadence. Crisp consonants, confident pacing…"
        rows={5}
        disabled={disabled}
      />
      <div className="mt-3">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs px-4 py-2 transition-colors"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" />
          <span>Reset to default</span>
        </button>
      </div>
    </div>
  );
}
