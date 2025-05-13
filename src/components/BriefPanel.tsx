import React, { useState, useMemo } from "react";
import { CampaignFormat, Voice, Provider, AIModel } from "@/types";
import { generateCreativeCopy } from "@/utils/ai-api";
import { parseCreativeXML } from "@/utils/xml-parser";
import TextareaAutosize from "react-textarea-autosize";
import {
  Listbox,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { Language, getFlagCode, formatAccentName } from "@/utils/language";

export type BriefPanelProps = {
  clientDescription: string;
  setClientDescription: (value: string) => void;
  creativeBrief: string;
  setCreativeBrief: (value: string) => void;
  campaignFormat: CampaignFormat;
  setCampaignFormat: (value: CampaignFormat) => void;
  selectedLanguage: string;
  setSelectedLanguage: (language: Language) => void;
  selectedProvider: Provider;
  setSelectedProvider: (provider: Provider) => void;
  availableLanguages: { code: Language; name: string }[];
  getFilteredVoices: (ignoreAccentFilter?: boolean) => Voice[];
  adDuration: number;
  setAdDuration: (duration: number) => void;
  selectedAccent: string | null;
  setSelectedAccent: (accent: string | null) => void;
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string
  ) => void;
  isLanguageLoading?: boolean;
  isAccentLoading?: boolean;
};

const campaignFormats = [
  {
    code: "ad_read" as CampaignFormat,
    name: "Single Voice Ad Read",
    description: "One voice narrating the entire advertisement",
  },
  {
    code: "dialog" as CampaignFormat,
    name: "Dialog",
    description:
      "Two voices having a conversation about the product or service",
  },
];

const aiModels = [
  {
    code: "gpt4",
    name: "GPT-4.1",
    description: "Largest GPT model for creative tasks and agentic planning",
  },
  {
    code: "deepseek",
    name: "DeepSeek R1",
    description: "Frontier thinking model from the east",
  },
];

export function BriefPanel({
  clientDescription,
  setClientDescription,
  creativeBrief,
  setCreativeBrief,
  campaignFormat,
  setCampaignFormat,
  selectedLanguage,
  setSelectedLanguage,
  selectedProvider,
  setSelectedProvider,
  availableLanguages,
  getFilteredVoices,
  adDuration,
  setAdDuration,
  selectedAccent,
  setSelectedAccent,
  onGenerateCreative,
  isLanguageLoading = false,
  isAccentLoading = false,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");
  const [selectedAiModel, setSelectedAiModel] = useState("gpt4");
  const [internalLanguageLoading, setInternalLanguageLoading] = useState(false);
  const [internalAccentLoading, setInternalAccentLoading] = useState(false);

  // Since we might not have the props from parent yet, we'll use internal state
  // to track loading that's triggered by provider changes
  const handleProviderChange = (provider: Provider) => {
    setInternalLanguageLoading(true);
    setSelectedProvider(provider);
    // Simulate loading completion after a delay (this can be removed when the parent passes actual loading states)
    setTimeout(() => setInternalLanguageLoading(false), 800);
  };

  // When language changes, we need to update accent loading state
  const handleLanguageChange = (
    lang: { code: Language; name: string } | null
  ) => {
    if (lang) {
      setInternalAccentLoading(true);
      setSelectedLanguage(lang.code);
      setLanguageQuery("");
      // Simulate loading completion after a delay (can be removed when parent passes actual loading states)
      setTimeout(() => setInternalAccentLoading(false), 800);
    }
  };

  // Determine if we're loading based on props or internal state
  const languageLoading = isLanguageLoading || internalLanguageLoading;
  const accentLoading = isAccentLoading || internalAccentLoading;

  // Get available accents for the current language
  const availableAccents = useMemo(() => {
    // Get voices that match the language but without filtering by accent
    const voices = getFilteredVoices(true);
    console.log(`[${selectedLanguage}] Available voices total:`, voices.length);

    if (voices.length === 0) {
      return ["None"];
    }

    // Extract only accents that actually exist in the provider's voices
    const voiceAccents = new Set<string>();
    voices.forEach((voice) => {
      if (voice.accent) {
        const formattedAccent = formatAccentName(voice.accent);
        if (formattedAccent.toLowerCase() !== "none") {
          voiceAccents.add(formattedAccent);
        }
      }
    });

    console.log(`Actually available accents for ${selectedLanguage}:`, [
      ...voiceAccents,
    ]);

    // Return sorted accents with "None" first
    return ["None", ...[...voiceAccents].sort()];
  }, [selectedLanguage, getFilteredVoices]);

  // Filter languages based on search query
  const filteredLanguages =
    languageQuery === ""
      ? availableLanguages
      : availableLanguages.filter((lang) => {
          return lang.name.toLowerCase().includes(languageQuery.toLowerCase());
        });

  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Get filtered voices using the provided function
      const filteredVoices = getFilteredVoices();
      console.log(
        `Filtered voices for ${selectedLanguage}:`,
        filteredVoices.map((v) => `${v.name} (${v.id})`)
      );

      const xmlResponse = await generateCreativeCopy(
        selectedAiModel as AIModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        filteredVoices,
        adDuration
      );

      console.log("XML response received:", xmlResponse);

      const { segments, musicPrompt } = parseCreativeXML(xmlResponse);

      console.log("Parsed segments:", segments);
      console.log("Parsed music prompt:", musicPrompt);

      if (segments.length === 0) {
        console.error("No voice segments were parsed from the response");
        setError(
          "Failed to generate creative: No voice segments found in the response"
        );
        setIsGenerating(false);
        return;
      }

      // Call onGenerateCreative with the segments and music prompt
      onGenerateCreative(segments, musicPrompt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating creative"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 h-full text-black">
      <h1 className="text-6xl font-black mb-4 uppercase text-center flex items-center justify-center gap-2">
        STUDIO
      </h1>
      <h2 className="text-3xl font-medium mb-12 uppercase text-center ">
        Campaign Brief
      </h2>
      <div className="space-y-6">
        {/* Client Description - Moved to the top */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Client Description
          </label>
          <TextareaAutosize
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            placeholder="Describe the client, their business, and target audience..."
            className="bg-white block w-full border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring focus:ring-sky-500 sm:text-sm sm:leading-6"
            minRows={5}
            style={{ resize: "none" }}
          />
        </div>

        {/* Creative Brief - Moved to the top */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Creative Brief
          </label>
          <TextareaAutosize
            value={creativeBrief}
            onChange={(e) => setCreativeBrief(e.target.value)}
            placeholder="What is the key message? What's the desired tone and style?"
            className="bg-white block w-full border-0 p-1.5 text-gray-900 placeholder:text-gray-400 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-sky-500 sm:text-sm sm:leading-6"
            minRows={5}
            style={{ resize: "none" }}
          />
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-3 gap-6 mt-8">
          {/* Column 1: Provider, Language, and now Accent selection stacked vertically */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm/6 font-medium mb-2">
                Provider
              </label>
              <Listbox value={selectedProvider} onChange={handleProviderChange}>
                <div className="relative">
                  <Listbox.Button className="grid w-full cursor-default grid-cols-1 bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                    <span className="col-start-1 row-start-1 flex items-center gap-3 pr-6">
                      <span className="block truncate capitalize">
                        {selectedProvider}
                      </span>
                    </span>
                    <ChevronUpDownIcon
                      aria-hidden="true"
                      className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                    />
                  </Listbox.Button>

                  <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                    {["elevenlabs", "lovo"].map((provider) => (
                      <Listbox.Option
                        key={provider}
                        value={provider}
                        className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                      >
                        {({ selected, active }) => (
                          <>
                            <span
                              className={`block truncate capitalize ${
                                selected ? "font-semibold" : "font-normal"
                              }`}
                            >
                              {provider}
                            </span>

                            {selected && (
                              <span
                                className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                  active ? "" : "text-white"
                                }`}
                              >
                                <CheckIcon
                                  aria-hidden="true"
                                  className="size-5"
                                />
                              </span>
                            )}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Listbox>
            </div>

            <div>
              <label className="block text-sm/6 font-medium mb-2">
                Language
              </label>
              <Combobox
                value={
                  availableLanguages.find(
                    (lang) => lang.code === selectedLanguage
                  ) || null
                }
                onChange={handleLanguageChange}
              >
                <div className="relative">
                  <ComboboxInput
                    className="grid w-full cursor-default grid-cols-1 bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6"
                    onChange={(event) => setLanguageQuery(event.target.value)}
                    onBlur={() => setLanguageQuery("")}
                    onClick={(event) =>
                      (event.target as HTMLInputElement).select()
                    }
                    displayValue={(
                      lang: (typeof availableLanguages)[0] | null
                    ) => {
                      if (!lang) return "";
                      return lang.name;
                    }}
                    disabled={languageLoading}
                  />
                  <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                    {languageLoading ? (
                      <svg
                        className="animate-spin h-5 w-5 text-gray-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <ChevronUpDownIcon
                        className="size-5 text-gray-400"
                        aria-hidden="true"
                      />
                    )}
                  </ComboboxButton>

                  {!languageLoading && filteredLanguages.length > 0 && (
                    <ComboboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                      {filteredLanguages.map((lang) => (
                        <ComboboxOption
                          key={lang.code}
                          value={lang}
                          className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                        >
                          {({ selected, active }) => (
                            <>
                              <div className="flex items-center">
                                <span
                                  className={`fi fi-${getFlagCode(
                                    lang.code
                                  )} fis`}
                                />
                                <span
                                  className={`ml-3 block truncate ${
                                    selected ? "font-semibold" : "font-normal"
                                  }`}
                                >
                                  {lang.name}
                                </span>
                              </div>

                              {selected && (
                                <span
                                  className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                    active ? "" : "text-sky-500"
                                  }`}
                                >
                                  <CheckIcon
                                    className="size-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </ComboboxOption>
                      ))}
                    </ComboboxOptions>
                  )}
                </div>
              </Combobox>
            </div>

            {/* Accent option */}
            <div className="accent-option">
              <label className="block text-sm/6 font-medium mb-2">Accent</label>
              <Listbox
                value={selectedAccent || "None"}
                onChange={(accent) => {
                  // If "None" is selected, set accent to null, otherwise use the selected accent
                  setSelectedAccent(accent === "None" ? null : accent);
                }}
                disabled={accentLoading}
              >
                <div className="relative">
                  <Listbox.Button className="grid w-full cursor-default grid-cols-1 bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                    <span className="block truncate">
                      {accentLoading ? "Loading..." : selectedAccent || "None"}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      {accentLoading ? (
                        <svg
                          className="animate-spin h-5 w-5 text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        <ChevronUpDownIcon
                          className="size-5 text-gray-400"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </Listbox.Button>
                  {!accentLoading && (
                    <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                      {availableAccents.map((accent, accentIdx) => (
                        <Listbox.Option
                          key={accentIdx}
                          value={accent}
                          className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                        >
                          {({ selected, active }) => (
                            <>
                              <span
                                className={`block truncate ${
                                  selected ? "font-semibold" : "font-normal"
                                }`}
                              >
                                {accent}
                              </span>
                              {selected && (
                                <span
                                  className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                    active ? "" : "text-sky-500"
                                  }`}
                                >
                                  <CheckIcon
                                    className="size-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                            </>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  )}
                </div>
              </Listbox>
            </div>
          </div>

          {/* Column 2: Campaign Format picker */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Campaign Format
            </label>
            <div className="space-y-2">
              {campaignFormats.map((format) => (
                <div
                  key={format.code}
                  className={`relative flex cursor-pointer px-5 py-4 shadow-md focus:outline-none ${
                    campaignFormat === format.code
                      ? "bg-sky-50 bg-opacity-75 text-sky-900"
                      : "bg-white"
                  }`}
                  onClick={() => setCampaignFormat(format.code)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center">
                      <div className="text-sm">
                        <p
                          className={`font-medium ${
                            campaignFormat === format.code
                              ? "text-black"
                              : "text-gray-700"
                          }`}
                        >
                          {format.name}
                        </p>
                        <span
                          className={`inline ${
                            campaignFormat === format.code
                              ? "text-gray-700"
                              : "text-gray-500"
                          }`}
                        >
                          {format.description}
                        </span>
                      </div>
                    </div>
                    {campaignFormat === format.code && (
                      <div className="shrink-0 text-black">
                        <CheckCircleIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: AI Model picker (UI only) */}
          <div>
            <label className="block text-sm font-medium mb-2">AI Model</label>
            <div className="space-y-2">
              {aiModels.map((model) => (
                <div
                  key={model.code}
                  className={`relative flex cursor-pointer px-5 py-4 shadow-md focus:outline-none ${
                    selectedAiModel === model.code
                      ? "bg-sky-50 bg-opacity-75 text-sky-900"
                      : "bg-white"
                  }`}
                  onClick={() => setSelectedAiModel(model.code)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center">
                      <div className="text-sm">
                        <p
                          className={`font-medium ${
                            selectedAiModel === model.code
                              ? "text-black"
                              : "text-gray-700"
                          }`}
                        >
                          {model.name}
                          {model.code === "gpt4" && (
                            <span className="ml-2 inline-flex items-center rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-700/10">
                              Recommended
                            </span>
                          )}
                        </p>
                        <span
                          className={`inline ${
                            selectedAiModel === model.code
                              ? "text-gray-700"
                              : "text-gray-500"
                          }`}
                        >
                          {model.description}
                        </span>
                      </div>
                    </div>
                    {selectedAiModel === model.code && (
                      <div className="shrink-0 text-black">
                        <CheckCircleIcon className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Duration slider */}
        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">
            Duration: {adDuration} seconds
          </label>
          <input
            type="range"
            min="15"
            max="90"
            step="5"
            value={adDuration}
            onChange={(e) => setAdDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 appearance-none cursor-pointer"
          />
          <div className="relative w-full mt-1 h-6">
            {/* Position calculation: (value - min) / (max - min) * 100% */}
            <div
              className="absolute text-xs text-gray-800"
              style={{ left: "0%" }}
            >
              15s
            </div>
            <div
              className="absolute text-xs text-gray-800 transform -translate-x-1/2"
              style={{ left: `${((30 - 15) / (90 - 15)) * 100}%` }}
            >
              30s
            </div>
            <div
              className="absolute text-xs text-gray-800 transform -translate-x-1/2"
              style={{ left: `${((60 - 15) / (90 - 15)) * 100}%` }}
            >
              60s
            </div>
            <div
              className="absolute text-xs text-gray-800 text-right"
              style={{ right: "0%" }}
            >
              90s
            </div>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerateCreative}
          disabled={
            isGenerating || !clientDescription.trim() || !creativeBrief.trim()
          }
          className="w-full bg-black px-3 py-2 text-lg font-semibold text-white uppercase hover:bg-sky-500 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 mt-8 mb-12"
        >
          {isGenerating ? "Generating Creative..." : "Generate Creative"}
        </button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
