import React, { useState, useEffect } from "react";
import { SoundFxPrompt, SoundFxPlacementIntent } from "@/types";
import {
  GlassyTextarea,
  GlassySlider,
  GlassyListbox,
  ResetButton,
  GenerateButton,
  Tooltip,
} from "./ui";

type VoiceTrackPreview = {
  name: string;
  text: string;
};

type SoundFxPanelProps = {
  onGenerate: () => Promise<string[] | null | void>; // Can return generated URLs for autoplay
  isGenerating: boolean;
  statusMessage?: string;
  soundFxPrompts: SoundFxPrompt[]; // Array of soundfx prompts
  onUpdatePrompt: (index: number, updates: Partial<SoundFxPrompt>) => void; // Update specific soundfx
  onRemovePrompt: (index: number) => void; // Remove specific soundfx
  onAddPrompt: () => void; // Add new empty soundfx
  adDuration: number; // Kept for API compatibility with other panels, but not used for duration defaults
  resetForm: () => void;
  voiceTrackCount?: number; // Number of voice tracks for placement options
  voiceTrackPreviews?: VoiceTrackPreview[]; // Preview info for each voice track
};

// Default duration for sound effects
const DEFAULT_SOUND_FX_DURATION = 3; // 3 seconds is a reasonable default for most sound effects

// Convert placement option string to placement intent
function placementOptionToIntent(option: string): SoundFxPlacementIntent {
  if (option === "start") {
    return { type: "start" };
  }
  if (option === "end") {
    return { type: "end" };
  }
  // Format is "afterVoice-0", "afterVoice-1", etc.
  if (option.startsWith("afterVoice-")) {
    const index = parseInt(option.split("-")[1], 10);
    return { type: "afterVoice", index };
  }
  // Default to end
  return { type: "end" };
}

// Convert placement intent to legacy playAfter string
// This keeps the two field systems in sync until we migrate to V3
function placementIntentToLegacyPlayAfter(intent: SoundFxPlacementIntent): string | undefined {
  switch (intent.type) {
    case "start":
      return "start";
    case "afterVoice":
    case "end":
    default:
      return undefined; // Let timeline calculator resolve from placementIntent
  }
}

export function SoundFxPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  soundFxPrompts,
  onUpdatePrompt,
  onRemovePrompt,
  onAddPrompt,
  adDuration, // We keep this for API compatibility, but use a fixed default duration for sound effects
  resetForm,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  voiceTrackCount: _voiceTrackCount = 0, // Kept for API compatibility, not currently used
  voiceTrackPreviews = [],
}: SoundFxPanelProps) {
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");

  // Update local status message when parent status message changes
  // but only if we're actually generating sound fx
  useEffect(() => {
    if (isGenerating) {
      setLocalStatusMessage(parentStatusMessage || "");
    }
  }, [isGenerating, parentStatusMessage]);

  // Reset status message when component mounts
  useEffect(() => {
    setLocalStatusMessage("");
  }, []);

  // Handle reset - clears all soundfx and resets form
  const handleReset = () => {
    setLocalStatusMessage("");
    resetForm();
  };

  // Generate all soundfx in the array
  const handleGenerate = () => {
    console.log(`Generating ${soundFxPrompts.length} sound effects`);
    // Check if at least one prompt has valid description
    const hasValidPrompt = soundFxPrompts.some(p => p.description?.trim());
    if (hasValidPrompt && !isGenerating) {
      onGenerate();
    } else {
      console.log(`Generation skipped: no valid prompts or already generating`);
    }
  };

  // Helper to convert placement intent to string option for listbox
  const placementIntentToOption = (placement?: SoundFxPlacementIntent): string => {
    if (!placement) return "end";
    if (placement.type === "start") return "start";
    if (placement.type === "afterVoice" && placement.index !== undefined) {
      return `afterVoice-${placement.index}`;
    }
    return "end";
  };

  // Make typescript happy by referencing adDuration in a harmless way
  React.useEffect(() => {
    console.log(
      `Sound effect component initialized with ad duration ${adDuration}s, but using fixed defaults instead`
    );
  }, [adDuration]);

  return (
    <div className="py-8 text-white">
      {/* Render each soundfx form */}
      <div className="space-y-8">
        {soundFxPrompts.map((prompt, index) => (
          <div
            key={index}
            className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-6"
          >
            {/* Form header with number and remove button */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Sound Effect {index + 1}
              </h3>
              {soundFxPrompts.length > 1 && (
                <Tooltip content="Remove this sound effect">
                  <button
                    onClick={() => onRemovePrompt(index)}
                    disabled={isGenerating}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>

            <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
              {/* Left column: Description */}
              <div>
                <GlassyTextarea
                  label="Sound FX Description"
                  value={prompt.description || ""}
                  onChange={(e) =>
                    onUpdatePrompt(index, { description: e.target.value })
                  }
                  placeholder="Describe the sound effect... (e.g. 'A door creaking open slowly')"
                  className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  minRows={6}
                />
              </div>

              {/* Right column: Placement and Duration controls */}
              <div className="space-y-6">
                {/* Placement selector */}
                <GlassyListbox
                  label="Placement"
                  value={placementIntentToOption(prompt.placement)}
                  onChange={(value) => {
                    const intent = placementOptionToIntent(value);
                    onUpdatePrompt(index, {
                      placement: intent,
                      playAfter: placementIntentToLegacyPlayAfter(intent),
                    });
                  }}
                  options={[
                    { value: "start", label: "At beginning (before all voices)" },
                    ...(voiceTrackPreviews && voiceTrackPreviews.length > 0
                      ? voiceTrackPreviews.map((preview, voiceIndex) => ({
                          value: `afterVoice-${voiceIndex}`,
                          label: `After voice ${voiceIndex + 1} (${
                            preview.name
                          }: "${preview.text.slice(0, 20)}${
                            preview.text.length > 20 ? "..." : ""
                          }")`,
                        }))
                      : []),
                    { value: "end", label: "At end (after all voices)" },
                  ]}
                />

                <GlassySlider
                  label="Duration"
                  value={prompt.duration || DEFAULT_SOUND_FX_DURATION}
                  onChange={(value) => onUpdatePrompt(index, { duration: value })}
                  min={1}
                  max={10}
                  step={1}
                  formatLabel={(val) => `${val} seconds`}
                  tickMarks={[
                    { value: 1, label: "1s" },
                    { value: 3, label: "3s" },
                    { value: 5, label: "5s" },
                    { value: 10, label: "10s" },
                  ]}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Sound Effect button - matching ScripterPanel style */}
      <Tooltip content="Add another sound effect" side="bottom">
        <button
          onClick={onAddPrompt}
          disabled={isGenerating}
          className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent w-full text-sky-700 hover:bg-gradient-to-t hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Sound Effect
        </button>
      </Tooltip>

      {/* Status message */}
      {localStatusMessage && (
        <p className="mt-6 text-center text-sm text-gray-300">
          {localStatusMessage}
        </p>
      )}
    </div>
  );
}
