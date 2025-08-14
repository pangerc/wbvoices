import React, { useState, useEffect } from "react";
import { SoundFxPrompt } from "@/types";
import {
  GlassyTextarea,
  GlassySlider,
  ResetButton,
  GenerateButton,
} from "./ui";

type SoundFxPanelProps = {
  onGenerate: (prompt: string, duration: number) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: SoundFxPrompt | null;
  adDuration: number; // Kept for API compatibility with other panels, but not used for duration defaults
  resetForm: () => void;
};

// Default duration for sound effects
const DEFAULT_SOUND_FX_DURATION = 3; // 3 seconds is a reasonable default for most sound effects

export function SoundFxPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  initialPrompt = null,
  adDuration, // We keep this for API compatibility, but use a fixed default duration for sound effects
  resetForm,
}: SoundFxPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(DEFAULT_SOUND_FX_DURATION);
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");
  const [timingInfo, setTimingInfo] = useState<{
    playAfter?: string;
    overlap?: number;
  } | null>(null);

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
    setLocalStatusMessage("");
    resetForm();
  };

  const handleGenerate = () => {
    console.log(`Manually generating sound effect: "${prompt}" (${duration}s)`);
    // Only generate if we have a valid prompt and not already generating
    if (prompt && !isGenerating) {
      onGenerate(prompt, duration);
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

      <div className="space-y-12 md:grid md:grid-cols-2 md:gap-6">
        <div className="space-y-12">
          <div>
            <GlassyTextarea
              label="Sound FX Description"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the sound effect you want to generate... (e.g. 'A door creaking open slowly with a spooky ambiance')"
              className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
              minRows={3}
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
        </div>

        {localStatusMessage && (
          <p className="text-center text-sm text-gray-300">
            {localStatusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
