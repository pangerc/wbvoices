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
    <div className="p-8 h-full text-black">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">WBLV</h1>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase ml-16">
          Music Generation
        </h2>
        <button
          onClick={handleReset}
          className=" bg-white px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2 text-white">
            Music Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="bg-white block w-full border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
            rows={3}
            placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-4 text-white">
            Music Provider
          </label>
          <RadioGroup value={provider} onChange={setProvider}>
            <div className="space-y-2">
              {providers.map((providerOption) => (
                <RadioGroup.Option
                  key={providerOption.id}
                  value={providerOption.id}
                  className={({ active, checked }) =>
                    `relative flex cursor-pointer px-5 py-4 ring-1 ring-inset ring-gray-300 focus:outline-none ${
                      active
                        ? "ring-2 ring-sky-500 ring-opacity-60 ring-offset-2"
                        : ""
                    } ${
                      checked
                        ? "bg-sky-50 bg-opacity-75 text-sky-900"
                        : "bg-white"
                    }`
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
                                checked ? "text-black" : "text-gray-500"
                              }`}
                            >
                              {providerOption.name}
                            </RadioGroup.Label>
                            <RadioGroup.Description
                              as="span"
                              className={`inline ${
                                checked ? "text-black" : "text-gray-500"
                              }`}
                            >
                              {providerOption.description}
                            </RadioGroup.Description>
                          </div>
                        </div>
                        {checked && (
                          <div className="shrink-0 text-black">
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
            className="block text-sm font-medium  leading-6"
          >
            Duration: <span className="text-gray-500">{duration} seconds </span>
            {provider === "loudly" &&
              duration % 15 !== 0 &&
              "(will be rounded to nearest 15s)"}
          </label>
          <input
            type="range"
            id="duration"
            name="duration"
            min="30"
            max="180"
            step={provider === "loudly" ? "15" : "5"}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-2"
          />
          <div className="flex justify-between text-xs text-gray-800 mt-1 ">
            <span>30s</span>
            <span>60s</span>
            <span>90s</span>
            <span>120s</span>
            <span>150s</span>
            <span>180s</span>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full  bg-black px-3 py-2 text-lg uppercase font-medium text-white  hover:bg-sky-500 focus-visible:outline  focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 my-12"
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
