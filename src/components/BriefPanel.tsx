import React, { useState, useMemo } from "react";
import {
  CampaignFormat,
  Voice,
  Provider,
  AIModel,
  SoundFxPrompt,
} from "@/types";
import { generateCreativeCopy } from "@/utils/ai-api";
import { parseCreativeXML } from "@/utils/xml-parser";
import { parseCreativeJSON } from "@/utils/json-parser";
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
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[]
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

      const jsonResponse = await generateCreativeCopy(
        selectedAiModel as AIModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        filteredVoices,
        adDuration
      );

      console.log("JSON response received:", jsonResponse);

      // Try parsing as JSON first
      try {
        const { voiceSegments, musicPrompt, soundFxPrompts } =
          parseCreativeJSON(jsonResponse);

        console.log("Parsed voice segments:", voiceSegments);
        console.log("Parsed music prompt:", musicPrompt);
        console.log("Parsed sound fx prompts:", soundFxPrompts);

        if (voiceSegments.length === 0) {
          console.error("No voice segments were parsed from the response");
          setError(
            "Failed to generate creative: No voice segments found in the response"
          );
          setIsGenerating(false);
          return;
        }

        // Map voice segments to the expected format
        const segments = voiceSegments.map((segment) => ({
          voiceId: segment.voice?.id || "",
          text: segment.text,
        }));

        // Pass complete sound FX prompts with timing info
        // Call onGenerateCreative with the segments, music prompt, and all sound fx prompts
        onGenerateCreative(segments, musicPrompt || "", soundFxPrompts);
      } catch (jsonError) {
        console.error("Error parsing JSON creative:", jsonError);

        // Fallback to XML parsing
        console.log("Attempting to parse as XML instead");
        try {
          const parsedXml = parseCreativeXML(jsonResponse);
          const xmlSegments = parsedXml.segments;
          const xmlMusicPrompt = parsedXml.musicPrompt;

          if (xmlSegments.length === 0) {
            console.error(
              "No voice segments were parsed from the XML response"
            );
            setError(
              "Failed to generate creative: No voice segments found in the response"
            );
            setIsGenerating(false);
            return;
          }

          // Call onGenerateCreative with the segments and music prompt
          // XML format doesn't support sound effects, so pass empty array
          onGenerateCreative(xmlSegments, xmlMusicPrompt, []);
        } catch (xmlError) {
          console.error("Error parsing XML fallback:", xmlError);
          throw new Error("Failed to parse creative response in any format");
        }
      }
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
    <div className="p-8  text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Let&apos;s Start Cooking</h1>
          <h2 className=" font-medium mb-12  ">
            Describe your client, audience, and message.This helps us craft the
            perfect voice for your campaign.
          </h2>
        </div>
        {/* Generate button */}
        <button
          onClick={handleGenerateCreative}
          disabled={
            isGenerating || !clientDescription.trim() || !creativeBrief.trim()
          }
          className=" bg-white px-3 py-2 text-lg font-semibold text-black uppercase hover:bg-sky-500 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 mt-8 mb-12"
        >
          {isGenerating ? "Generating Creative..." : "Generate Creative"}
        </button>
      </div>
      {/* MAIN FORM GRID */}
      <div className="gap-8 md:grid md:grid-cols-3 ">
        <div className="space-y-4">
          {/* Client Description - Moved to the top */}
          <div className="relative">
            <label className="block text-sm font-medium mb-2">
              Client Description
            </label>
            <div className="group relative">
              {/* This is the "border" div with gradient background */}
              <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
              {/* Subtle top reflection / highlight */}
              <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
              {/* Subtle outer glow */}
              <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>
              <TextareaAutosize
                value={clientDescription}
                onChange={(e) => setClientDescription(e.target.value)}
                placeholder="Describe the client, their business, and target audience..."
                className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                minRows={5}
                style={{ resize: "none" }}
              />
            </div>
          </div>

          {/* Creative Brief - Moved to the top */}
          <div className="relative">
            <label className="block text-sm font-medium mb-2">
              Creative Brief
            </label>
            <div className="group relative">
              {/* This is the "border" div with gradient background */}
              <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
              {/* Subtle top reflection / highlight */}
              <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
              {/* Subtle outer glow */}
              <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>
              <TextareaAutosize
                value={creativeBrief}
                onChange={(e) => setCreativeBrief(e.target.value)}
                placeholder="What is the key message? What's the desired tone and style?"
                className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                minRows={5}
                style={{ resize: "none" }}
              />
            </div>
          </div>
        </div>

        <div className="col-span-2 space-y-12">
          <div className="md:grid md:grid-cols-2 gap-4">
            <div id="provider-selector">
              <label className="block text-sm/6 font-medium mb-2">
                Provider
              </label>
              <Listbox value={selectedProvider} onChange={handleProviderChange}>
                <div className="relative">
                  <Listbox.Button className="grid w-full cursor-default grid-cols-1 bg-gray-800 py-1.5 pr-2 pl-3 text-left text-white outline-1 -outline-offset-1 outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                    <span className="col-start-1 row-start-1 flex items-center gap-3 pr-6">
                      <span className="block truncate capitalize">
                        {selectedProvider}
                      </span>
                    </span>
                    <ChevronUpDownIcon
                      aria-hidden="true"
                      className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-400 sm:size-4"
                    />
                  </Listbox.Button>

                  <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-gray-800 py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                    {["elevenlabs", "lovo"].map((provider) => (
                      <Listbox.Option
                        key={provider}
                        value={provider}
                        className="group relative cursor-default py-2 pr-9 pl-3 text-white select-none data-focus:bg-sky-700 data-focus:text-white data-focus:outline-hidden"
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
            <div className="space-y-4">
              <div id="language-selector">
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
                      className="grid w-full cursor-default grid-cols-1 bg-gray-800 py-1.5 pr-10 pl-3 text-left text-white outline-1 -outline-offset-1 outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6"
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
                      <ComboboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-gray-800 py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                        {filteredLanguages.map((lang) => (
                          <ComboboxOption
                            key={lang.code}
                            value={lang}
                            className="group relative cursor-default py-2 pr-9 pl-3 text-white select-none data-focus:bg-sky-700 data-focus:text-white data-focus:outline-hidden"
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
                <label className="block text-sm/6 font-medium mb-2">
                  Accent
                </label>
                <Listbox
                  value={selectedAccent || "None"}
                  onChange={(accent) => {
                    // If "None" is selected, set accent to null, otherwise use the selected accent
                    setSelectedAccent(accent === "None" ? null : accent);
                  }}
                  disabled={accentLoading}
                >
                  <div className="relative">
                    <Listbox.Button className="grid w-full cursor-default grid-cols-1 bg-gray-800 py-1.5 pr-10 pl-3 text-left text-white outline-1 -outline-offset-1 outline-gray-600 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                      <span className="block truncate">
                        {accentLoading
                          ? "Loading..."
                          : selectedAccent || "None"}
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
                      <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto bg-gray-800 py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                        {availableAccents.map((accent, accentIdx) => (
                          <Listbox.Option
                            key={accentIdx}
                            value={accent}
                            className="group relative cursor-default py-2 pr-9 pl-3 text-white select-none data-focus:bg-sky-700 data-focus:text-white data-focus:outline-hidden"
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
          </div>

          <div className="md:grid md:grid-cols-2 gap-4">
            {/* Column 2: Campaign Format picker */}
            <div className="space-y-4">
              <label className="block text-sm font-medium mb-2">
                Campaign Format
              </label>
              <div className="space-y-2  border border-gray-700 rounded-lg p-3">
                {campaignFormats.map((format) => (
                  <div
                    key={format.code}
                    className={`relative flex cursor-pointer px-5 py-4 shadow-md focus:outline-none ${
                      campaignFormat === format.code
                        ? "bg-gray-700 text-white"
                        : "bg-gray-800"
                    }`}
                    onClick={() => setCampaignFormat(format.code)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center">
                        <div className="text-sm">
                          <p
                            className={`font-medium ${
                              campaignFormat === format.code
                                ? "text-white"
                                : "text-gray-300"
                            }`}
                          >
                            {format.name}
                          </p>
                          <span
                            className={`inline ${
                              campaignFormat === format.code
                                ? "text-gray-300"
                                : "text-gray-400"
                            }`}
                          >
                            {format.description}
                          </span>
                        </div>
                      </div>
                      {campaignFormat === format.code && (
                        <div className="shrink-0 text-white">
                          <CheckCircleIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3:  */}
            <div className="space-y-4">
              <label className="block text-sm font-medium mb-2">AI Model</label>
              <div className="space-y-2">
                {aiModels.map((model) => (
                  <div
                    key={model.code}
                    className={`relative flex cursor-pointer px-5 py-4 shadow-md focus:outline-none ${
                      selectedAiModel === model.code
                        ? "bg-gray-700 text-white"
                        : "bg-gray-800"
                    }`}
                    onClick={() => setSelectedAiModel(model.code)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center">
                        <div className="text-sm">
                          <p
                            className={`font-medium ${
                              selectedAiModel === model.code
                                ? "text-white"
                                : "text-gray-300"
                            }`}
                          >
                            {model.name}
                            {model.code === "gpt4" && (
                              <span className="ml-2 inline-flex items-center rounded-md bg-sky-900 px-2 py-1 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-700/10">
                                Recommended
                              </span>
                            )}
                          </p>
                          <span
                            className={`inline ${
                              selectedAiModel === model.code
                                ? "text-gray-300"
                                : "text-gray-400"
                            }`}
                          >
                            {model.description}
                          </span>
                        </div>
                      </div>
                      {selectedAiModel === model.code && (
                        <div className="shrink-0 text-white">
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
              className="w-full h-2 bg-gray-700 appearance-none cursor-pointer"
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
                style={{ left: `${((30 - 15) / (90 - 15)) * 100}%` }}
              >
                30s
              </div>
              <div
                className="absolute text-xs text-gray-300 transform -translate-x-1/2"
                style={{ left: `${((60 - 15) / (90 - 15)) * 100}%` }}
              >
                60s
              </div>
              <div
                className="absolute text-xs text-gray-300 text-right"
                style={{ right: "0%" }}
              >
                90s
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    </div>
  );
}
