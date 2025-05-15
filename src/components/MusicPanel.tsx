import React, { useState, useEffect } from "react";
import { MusicProvider } from "@/types";
import {
  GlassyTextarea,
  GlassyOptionPicker,
  GlassySlider,
  ResetButton,
  GenerateButton,
} from "./ui";

type MusicPanelProps = {
  onGenerate: (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: string;
  adDuration: number;
  resetForm: () => void;
};

export function MusicPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  initialPrompt = "",
  adDuration,
  resetForm,
}: MusicPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [provider, setProvider] = useState<MusicProvider>("loudly");
  const [duration, setDuration] = useState(adDuration);
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");

  // Update prompt when initialPrompt changes
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Update duration when adDuration changes
  useEffect(() => {
    setDuration(adDuration);
  }, [adDuration]);

  // Update local status message when parent status message changes
  // but only if we're actually generating music
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
    setProvider("loudly");
    setDuration(adDuration);
    setLocalStatusMessage("");
    resetForm();
  };

  const handleGenerate = () => {
    // For Loudly, we need to round to the nearest 15 seconds
    if (provider === "loudly") {
      const roundedDuration = Math.round(duration / 15) * 15;
      onGenerate(prompt, provider, roundedDuration);
    } else {
      // For Beatoven, we pass the exact duration
      onGenerate(prompt, provider, duration);
    }
  };

  const providerOptions = [
    {
      value: "loudly" as MusicProvider,
      label: "Loudly",
      description:
        "High-quality, customizable music (duration in 15s increments)",
    },
    {
      value: "beatoven" as MusicProvider,
      label: "Beatoven",
      description: "Simple, quick music generation (exact duration)",
    },
  ];

  return (
    <div className="py-8 text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Soundtrack Your Story</h1>
          <h2 className="font-medium mb-12">
            Choose the mood. We&apos;ll generate the perfect track for your
            audio ad.
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          <GenerateButton
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            isGenerating={isGenerating}
            text="Generate Music"
            generatingText="Generating..."
          />
        </div>
      </div>

      <div className="space-y-12 md:grid md:grid-cols-2 md:gap-6">
        <div>
          <GlassyTextarea
            label="Music Description"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
            className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            minRows={3}
          />

          {/* Timing instructions for music */}
          <div className="mt-3 pl-4 text-xs text-gray-500 p-2 ">
            <span className="font-medium ">Timing: </span>
            <span>
              Background music typically plays from the beginning of the ad
            </span>
            <div className="mt-1">
              <span className="text-sky-300 ">Pro tip: </span>
              Music will be automatically mixed with voice tracks at reduced
              volume. For best results, choose music that complements the
              emotion of your script.
            </div>
          </div>
        </div>
        <div className="space-y-12">
          <GlassyOptionPicker
            label="AI Music Provider"
            value={provider}
            onChange={setProvider}
            options={providerOptions}
          />

          <GlassySlider
            label="Duration"
            value={duration}
            onChange={setDuration}
            min={15}
            max={120}
            step={provider === "loudly" ? 15 : 5}
            formatLabel={(val) =>
              `${val} seconds${
                provider === "loudly" && val % 15 !== 0
                  ? " (will be rounded to nearest 15s)"
                  : ""
              }`
            }
            tickMarks={[
              { value: 15, label: "15s" },
              { value: 30, label: "30s" },
              { value: 60, label: "60s" },
              { value: 90, label: "90s" },
              { value: 120, label: "120s" },
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
