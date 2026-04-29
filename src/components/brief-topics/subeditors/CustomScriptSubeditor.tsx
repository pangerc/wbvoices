/**
 * CustomScriptSubeditor — collapsed subeditor for verbatim user-supplied
 * scripts. Mirrors the music-panel tab pattern: the user picks between
 * "Brief the agent" (LLM writes the script from creativeBrief) and "I
 * have the script" (LLM only writes acting/music/SFX around the verbatim
 * text). When verbatim is selected, the providedScript field becomes
 * exposed; otherwise it stays null.
 */

import { GlassyTextarea } from "../../ui";
import { twMerge } from "tailwind-merge";

export interface CustomScriptSubeditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

type Mode = "agent" | "verbatim";

export function CustomScriptSubeditor({
  value,
  onChange,
  disabled,
}: CustomScriptSubeditorProps) {
  // Derive mode from value — non-empty providedScript → verbatim. Letting
  // the user toggle without losing their text means we treat clearing as
  // "switching back to agent mode".
  const mode: Mode = value.trim().length > 0 ? "verbatim" : "agent";

  const setMode = (next: Mode) => {
    if (next === "agent") {
      // Switching back to agent mode clears the verbatim text — user
      // can re-paste later if they change their mind.
      onChange("");
    } else if (next === "verbatim" && value.trim().length === 0) {
      // No-op: switching to verbatim mode just exposes the textarea.
      // We don't insert placeholder text.
    }
  };

  return (
    <div>
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode("agent")}
          disabled={disabled}
          className={twMerge(
            "flex-1 px-3 py-2 rounded-lg text-xs transition-colors",
            mode === "agent"
              ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
              : "bg-transparent hover:bg-white/10 text-gray-300"
          )}
        >
          Brief the agent
        </button>
        <button
          type="button"
          onClick={() => setMode("verbatim")}
          disabled={disabled}
          className={twMerge(
            "flex-1 px-3 py-2 rounded-lg text-xs transition-colors",
            mode === "verbatim"
              ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
              : "bg-transparent hover:bg-white/10 text-gray-300"
          )}
        >
          I have the script
        </button>
      </div>

      {mode === "verbatim" ? (
        <>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Provided script
            <span className="ml-2 text-xs text-gray-500">
              (used verbatim — agent only writes acting / music / SFX
              around it)
            </span>
          </label>
          <GlassyTextarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste the exact script the agent should read…"
            rows={6}
            disabled={disabled}
          />
        </>
      ) : (
        <p className="text-xs text-gray-500">
          Agent will write the script from your Creative Brief. Switch to
          "I have the script" if you want to provide verbatim copy.
        </p>
      )}
    </div>
  );
}
