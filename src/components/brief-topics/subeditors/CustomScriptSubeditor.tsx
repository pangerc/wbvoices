/**
 * CustomScriptSubeditor — verbatim user-supplied script. Rendered as the
 * "I have the script" alternate authoring mode of CreativeTopic; the
 * topic's GlassTabBar swaps the body between this and the brief-driven
 * fields. When this subeditor is mounted, the user has explicitly
 * chosen verbatim mode.
 */

import { GlassyTextarea } from "../../ui";

export interface CustomScriptSubeditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CustomScriptSubeditor({
  value,
  onChange,
  disabled,
}: CustomScriptSubeditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Provided script
        <span className="ml-2 text-xs text-gray-500">
          (used verbatim — agent only writes acting / music / SFX around it)
        </span>
      </label>
      <GlassyTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the exact script the agent should read…"
        rows={8}
        disabled={disabled}
      />
    </div>
  );
}
