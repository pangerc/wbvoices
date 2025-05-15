import React, { useState, useEffect } from "react";
import { SoundFxPrompt } from "@/types";

type SoundFxPanelProps = {
  onGenerate: (prompt: string, duration: number) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: SoundFxPrompt | null;
  adDuration: number;
  resetForm: () => void;
};

export function SoundFxPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  initialPrompt = null,
  adDuration,
  resetForm,
}: SoundFxPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(adDuration);
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
      if (initialPrompt.duration) {
        setDuration(initialPrompt.duration);
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

  // Update duration when adDuration changes
  useEffect(() => {
    // Only update if there's no specific duration from initialPrompt
    if (!initialPrompt?.duration) {
      setDuration(adDuration);
    }
  }, [adDuration, initialPrompt]);

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
    setDuration(adDuration);
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

  return (
    <div className="p-8 h-full bg-black text-white">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">STUDIO</h1>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase ml-16">
          Sound FX Generation
        </h2>
        <button
          onClick={handleReset}
          className="bg-gray-800 px-2.5 py-1.5 text-sm text-white ring-1 ring-inset ring-gray-700 hover:bg-gray-700"
        >
          Reset
        </button>
      </div>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Sound FX Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="bg-gray-800 block w-full border-0 p-1.5 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
            rows={3}
            placeholder="Describe the sound effect you want to generate... (e.g. 'A door creaking open slowly with a spooky ambiance')"
          />

          {/* Timing instructions for sound effects */}
          <div className="mt-1 text-xs text-gray-300 bg-gray-800 p-2 rounded-sm border border-gray-700">
            <span className="font-medium text-gray-200">Timing: </span>
            <span>
              {timingInfo
                ? formatTimingInfo()
                : "Sound effects typically play at specific moments in the ad"}
            </span>
            <div className="mt-1">
              <span className="text-sky-300 font-medium">Pro tip: </span>
              When generating from a script, sound effects will be positioned
              based on the AI&apos;s timing suggestions. In the mixer,
              you&apos;ll be able to adjust when each sound effect plays.
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="duration"
            className="block text-sm font-medium leading-6"
          >
            Duration: <span className="text-gray-400">{duration} seconds</span>
          </label>
          <input
            type="range"
            id="duration"
            name="duration"
            min="1"
            max="30"
            step="1"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mt-2"
          />
          <div className="relative w-full mt-1 h-6">
            <div
              className="absolute text-xs text-gray-300"
              style={{ left: "0%" }}
            >
              1s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((5 - 1) / (30 - 1)) * 100}%` }}
            >
              5s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((10 - 1) / (30 - 1)) * 100}%` }}
            >
              10s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((20 - 1) / (30 - 1)) * 100}%` }}
            >
              20s
            </div>
            <div
              className="absolute text-xs text-gray-300 text-right"
              style={{ right: "0%" }}
            >
              30s
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full bg-white px-3 py-2 text-lg uppercase font-medium text-black hover:bg-sky-500 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 my-12"
        >
          {isGenerating ? "Generating..." : "Generate Sound Effect"}
        </button>

        {localStatusMessage && (
          <p className="text-center text-sm text-gray-300">
            {localStatusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
