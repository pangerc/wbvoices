import React, { useState, useEffect } from "react";
import { SoundFxPrompt, SoundFxPlacementIntent } from "@/types";
import {
  GlassyTextarea,
  GlassySlider,
  GlassyListbox,
  ResetButton,
  GenerateButton,
} from "./ui";

type VoiceTrackPreview = {
  name: string;
  text: string;
};

type SoundFxPanelProps = {
  onGenerate: (prompt: string, duration: number, placement?: SoundFxPlacementIntent) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: SoundFxPrompt | null;
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

export function SoundFxPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  initialPrompt = null,
  adDuration, // We keep this for API compatibility, but use a fixed default duration for sound effects
  resetForm,
  voiceTrackCount = 0,
  voiceTrackPreviews = [],
}: SoundFxPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(DEFAULT_SOUND_FX_DURATION);
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");
  const [timingInfo, setTimingInfo] = useState<{
    playAfter?: string;
    overlap?: number;
  } | null>(null);
  const [placementOption, setPlacementOption] = useState<string>("end");

  // Update prompt when initialPrompt changes
  useEffect(() => {
    // Only update the prompt - do not automatically generate
    if (initialPrompt) {
      console.log("Setting sound FX prompt to:", initialPrompt);
      setPrompt(initialPrompt.description);

      // Use the provided duration, or fall back to default (not the ad duration)
      if (initialPrompt.duration && initialPrompt.duration > 0) {
        console.log(
          `Using provided sound FX duration: ${initialPrompt.duration}s`
        );
        setDuration(initialPrompt.duration);
      } else {
        // For sound effects, use a short default duration rather than the full ad length
        console.log(
          `Using default sound FX duration: ${DEFAULT_SOUND_FX_DURATION}s`
        );
        setDuration(DEFAULT_SOUND_FX_DURATION);
      }

      // Restore placement dropdown state from Redis
      if (initialPrompt.placement) {
        const intent = initialPrompt.placement;
        if (intent.type === "start") {
          setPlacementOption("start");
        } else if (intent.type === "afterVoice" && intent.index !== undefined) {
          setPlacementOption(`afterVoice-${intent.index}`);
        } else if (intent.type === "end") {
          setPlacementOption("end");
        }
        console.log(`Restored placement dropdown to: ${intent.type}${intent.type === 'afterVoice' ? ` index=${intent.index}` : ''}`);
      }

      // Extract timing information
      if (initialPrompt.playAfter || initialPrompt.overlap !== undefined) {
        setTimingInfo({
          playAfter: initialPrompt.playAfter,
          overlap: initialPrompt.overlap,
        });
      }
    }
  }, [initialPrompt]);

  // Do NOT update duration when adDuration changes - sound effects should be short
  // We don't need the useEffect that previously updated to adDuration

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

  // Handle local reset
  const handleReset = () => {
    setPrompt("");
    setDuration(DEFAULT_SOUND_FX_DURATION); // Reset to default sound FX duration, not ad duration
    setTimingInfo(null);
    setPlacementOption("end"); // Reset to default placement
    setLocalStatusMessage("");
    resetForm();
  };

  const handleGenerate = () => {
    const placementIntent = placementOptionToIntent(placementOption);
    console.log(`Manually generating sound effect: "${prompt}" (${duration}s) with placement:`, placementIntent);
    // Only generate if we have a valid prompt and not already generating
    if (prompt && !isGenerating) {
      onGenerate(prompt, duration, placementIntent);
    } else {
      console.log(`Generation skipped: prompt empty or already generating`);
    }
  };

  const formatTimingInfo = () => {
    if (!timingInfo) return "Sound effect will play at the start of the ad";

    if (timingInfo.playAfter === "previous") {
      return timingInfo.overlap
        ? `Will play after previous element with ${timingInfo.overlap}s overlap`
        : "Will play after previous element";
    }

    return timingInfo.playAfter
      ? `Will play after element "${timingInfo.playAfter}"${
          timingInfo.overlap ? ` with ${timingInfo.overlap}s overlap` : ""
        }`
      : "No specific timing information";
  };

  // Make typescript happy by referencing adDuration in a harmless way
  React.useEffect(() => {
    console.log(
      `Sound effect component initialized with ad duration ${adDuration}s, but using fixed defaults instead`
    );
  }, [adDuration]);

  return (
    <div className="py-8 text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Add a Punch</h1>
          <h2 className="font-medium mb-12">
            Spice up your creative with little sound effects.
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          <GenerateButton
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            isGenerating={isGenerating}
            text="Generate Sound Effect"
            generatingText="Generating..."
          />
        </div>
      </div>

      <div className="space-y-12 md:grid md:grid-cols-3 md:gap-6">
        {/* Left column: Description */}
        <div className="md:col-span-1">
          <GlassyTextarea
            label="Sound FX Description"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the sound effect you want to generate... (e.g. 'A door creaking open slowly with a spooky ambiance')"
            className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            minRows={8}
          />

          {/* Timing instructions for sound effects */}
          <div className="mt-1 pl-3 text-xs text-gray-500 p-2">
            <span className="font-medium">Timing: </span>
            <span>
              {timingInfo
                ? formatTimingInfo()
                : "Sound effects typically play at specific moments in the ad"}
            </span>
            <div className="mt-1">
              <span className="text-wb-blue">Pro tip: </span>
              When generating from a script, sound effects will be positioned
              based on the AI&apos;s timing suggestions. In the mixer,
              you&apos;ll be able to adjust when each sound effect plays.
            </div>
          </div>
        </div>

        {/* Right column: Placement and Duration controls */}
        <div className="md:col-span-2 space-y-12">
          {/* Placement selector */}
          <GlassyListbox
            label="Sound Effect Placement"
            value={placementOption}
            onChange={setPlacementOption}
            options={[
              { value: "start", label: "At beginning (before all voices)" },
              ...(voiceTrackPreviews && voiceTrackPreviews.length > 0
                ? voiceTrackPreviews.map((preview, index) => ({
                    value: `afterVoice-${index}`,
                    label: `After voice ${index + 1} (${preview.name}: "${preview.text.slice(0, 20)}${preview.text.length > 20 ? '...' : ''}")`,
                  }))
                : []),
              { value: "end", label: "At end (after all voices)" },
            ]}
          />

          <GlassySlider
            label="Duration"
            value={duration}
            onChange={setDuration}
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

          {localStatusMessage && (
            <p className="text-center text-sm text-gray-300">
              {localStatusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
