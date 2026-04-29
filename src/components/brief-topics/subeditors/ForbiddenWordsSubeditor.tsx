/**
 * ForbiddenWordsSubeditor — collapsed subeditor for the forbidden-words
 * list in the Creative topic. Renders into the prompt as `## Avoid` so
 * the LLM steers around regulator / brand-policy phrasing.
 */

import { GlassyTextarea } from "../../ui";

export interface ForbiddenWordsSubeditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ForbiddenWordsSubeditor({
  value,
  onChange,
  disabled,
}: ForbiddenWordsSubeditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Forbidden words / phrases
        <span className="ml-2 text-xs text-gray-500">
          (comma- or newline-separated; the LLM will avoid these)
        </span>
      </label>
      <GlassyTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="cheap, discount, free… or trademarked competitor names"
        rows={3}
        disabled={disabled}
      />
    </div>
  );
}
