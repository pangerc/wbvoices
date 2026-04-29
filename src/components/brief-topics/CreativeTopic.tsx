/**
 * CreativeTopic — what the spot is and how it sounds.
 *
 * Tabbar (mirroring MusicPanel's mode-toggle pattern) at the top:
 *   - "Brief the agent" → the LLM writes the script from creativeBrief
 *   - "I have the script" → providedScript is used verbatim, agent only
 *     writes acting / music / SFX around it
 *
 * In "brief" mode, the body exposes only `creativeBrief` + `creativeAngle`.
 * Acting instructions, references, and forbidden-words live behind
 * collapsibles — auto-expand only when their fields are populated on
 * `initialBrief` load (mirrors v3.5 V3 behaviour).
 *
 * Why creativeAngle is exposed (and never collapses): brand-anchoring
 * ladder rests on `brandVoice = constant, creativeAngle = per-spot
 * variance`. Hide the angle and Heineken Bulgaria reads the same in
 * every ad — measured regression in v3.5 production.
 */

import { useState } from "react";
import {
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import type { ToneOption } from "../ui/ToneSelector";
import { GlassTab, GlassTabBar, GlassyTextarea, Tooltip } from "../ui";
import { CollapsibleSection } from "./CollapsibleSection";
import { ActingInstructionsSubeditor } from "./subeditors/ActingInstructionsSubeditor";
import { ReferenceUrlsSubeditor } from "./subeditors/ReferenceUrlsSubeditor";
import { ForbiddenWordsSubeditor } from "./subeditors/ForbiddenWordsSubeditor";
import { CustomScriptSubeditor } from "./subeditors/CustomScriptSubeditor";

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
  referenceUrlsText,
  onReferenceUrlsChanged,
  forbiddenWords,
  onForbiddenWordsChanged,
  providedScript,
  onProvidedScriptChanged,
  showAngleNudge,
  disabled,
}: CreativeTopicProps) {
  // Default to script mode iff a verbatim script is already loaded; the
  // tab is one click to switch back. Initial-render only — user toggles
  // via the tabs after that.
  const [creativeMode, setCreativeMode] = useState<CreativeMode>(() =>
    providedScript.trim().length > 0 ? "script" : "brief",
  );

  // Auto-expand collapsibles only on first load when their fields carry
  // content (mirrors v3.5 V3 behaviour — don't react to live edits).
  const actingDefaultOpen =
    selectedTone !== null || voiceInstructions.trim().length > 0;
  const referencesDefaultOpen = referenceUrlsText.trim().length > 0;
  const forbiddenDefaultOpen = forbiddenWords.trim().length > 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Creative</h2>
        <p className="text-xs text-gray-500">
          What the spot says, how the voice delivers it.
        </p>
      </div>

      <div className="flex justify-center mb-2">
        <GlassTabBar>
          <Tooltip content="Brief the agent — LLM writes the script" side="bottom">
            <GlassTab
              isActive={creativeMode === "brief"}
              onClick={() => setCreativeMode("brief")}
            >
              <SparklesIcon className="h-5 w-5" />
            </GlassTab>
          </Tooltip>
          <Tooltip content="I have the script — use my copy verbatim" side="bottom">
            <GlassTab
              isActive={creativeMode === "script"}
              onClick={() => setCreativeMode("script")}
            >
              <DocumentTextIcon className="h-5 w-5" />
            </GlassTab>
          </Tooltip>
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
                Without an angle, the script will brand-anchor cleanly but
                lose the per-spot edge — type one sentence specific to THIS
                spot.
              </p>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <CollapsibleSection
              title="Acting instructions"
              description="tone preset + voice delivery — fine-tunes how the line is read"
              defaultOpen={actingDefaultOpen}
            >
              <ActingInstructionsSubeditor
                selectedTone={selectedTone}
                onSelectedToneChanged={onSelectedToneChanged}
                voiceInstructions={voiceInstructions}
                onVoiceInstructionsChanged={onVoiceInstructionsChanged}
                toneOptions={toneOptions}
                toneInstructions={toneInstructions}
                disabled={disabled}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="References"
              description="brand sources, prior ads to inherit voice from"
              defaultOpen={referencesDefaultOpen}
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
              defaultOpen={forbiddenDefaultOpen}
            >
              <ForbiddenWordsSubeditor
                value={forbiddenWords}
                onChange={onForbiddenWordsChanged}
                disabled={disabled}
              />
            </CollapsibleSection>
          </div>
        </>
      )}
    </section>
  );
}
