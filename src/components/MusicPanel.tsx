import React, { useState, useEffect } from "react";
import { MusicProvider } from "@/types";
import { RadioGroup } from "@headlessui/react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";

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

  const providers = [
    {
      id: "loudly",
      name: "Loudly",
      description:
        "High-quality, customizable music (duration in 15s increments)",
    },
    {
      id: "beatoven",
      name: "Beatoven",
      description: "Simple, quick music generation (exact duration)",
    },
  ];

  return (
    <div className="p-8 h-full bg-black text-white">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">STUDIO</h1>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase ml-16">
          Music Generation
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
            Music Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="bg-gray-800 block w-full border-0 p-1.5 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
            rows={3}
            placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
          />

          {/* Timing instructions for music */}
          <div className="mt-1 text-xs text-gray-300 bg-gray-800 p-2 rounded-sm border border-gray-700">
            <span className="font-medium text-gray-200">Timing: </span>
            <span>
              Background music typically plays from the beginning of the ad
            </span>
            <div className="mt-1">
              <span className="text-sky-300 font-medium">Pro tip: </span>
              Music will be automatically mixed with voice tracks at reduced
              volume. For best results, choose music that complements the
              emotion of your script.
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-4">
            AI Music Provider
          </label>
          <RadioGroup value={provider} onChange={setProvider}>
            <div className="space-y-2">
              {providers.map((providerOption) => (
                <RadioGroup.Option
                  key={providerOption.id}
                  value={providerOption.id}
                  className={({ active, checked }) =>
                    `relative flex cursor-pointer px-5 py-4 ring-1 ring-inset ring-gray-700 focus:outline-none ${
                      active
                        ? "ring-2 ring-sky-500 ring-opacity-60 ring-offset-2"
                        : ""
                    } ${checked ? "bg-gray-700 text-white" : "bg-gray-800"}`
                  }
                >
                  {({ checked }) => (
                    <>
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center">
                          <div className="text-sm">
                            <RadioGroup.Label
                              as="p"
                              className={`font-medium ${
                                checked ? "text-white" : "text-gray-300"
                              }`}
                            >
                              {providerOption.name}
                            </RadioGroup.Label>
                            <RadioGroup.Description
                              as="span"
                              className={`inline ${
                                checked ? "text-gray-200" : "text-gray-400"
                              }`}
                            >
                              {providerOption.description}
                            </RadioGroup.Description>
                          </div>
                        </div>
                        {checked && (
                          <div className="shrink-0 text-white">
                            <CheckCircleIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </RadioGroup.Option>
              ))}
            </div>
          </RadioGroup>
        </div>

        <div>
          <label
            htmlFor="duration"
            className="block text-sm font-medium leading-6"
          >
            Duration: <span className="text-gray-400">{duration} seconds </span>
            {provider === "loudly" &&
              duration % 15 !== 0 &&
              "(will be rounded to nearest 15s)"}
          </label>
          <input
            type="range"
            id="duration"
            name="duration"
            min="15"
            max="120"
            step={provider === "loudly" ? "15" : "5"}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mt-2"
          />
          <div className="relative w-full mt-1 h-6">
            {/* Position calculation: (value - min) / (max - min) * 100% */}
            <div
              className="absolute text-xs text-gray-300"
              style={{ left: "0%" }}
            >
              15s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((30 - 15) / (120 - 15)) * 100}%` }}
            >
              30s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((60 - 15) / (120 - 15)) * 100}%` }}
            >
              60s
            </div>
            <div
              className="absolute text-xs text-gray-300 transform -translate-x-1/2"
              style={{ left: `${((90 - 15) / (120 - 15)) * 100}%` }}
            >
              90s
            </div>
            <div
              className="absolute text-xs text-gray-300 text-right"
              style={{ right: "0%" }}
            >
              120s
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full bg-white px-3 py-2 text-lg uppercase font-medium text-black hover:bg-sky-500 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 my-12"
        >
          {isGenerating ? "Generating..." : "Generate Music"}
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
