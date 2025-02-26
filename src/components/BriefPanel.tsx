import React, { useState, useRef, useEffect } from "react";
import { CampaignFormat, Voice, Provider } from "@/types";
import { generateCreativeCopy } from "@/utils/deepseek-api";
import { parseCreativeXML } from "@/utils/xml-parser";
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
import { Language, getFlagCode } from "@/utils/language";

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
  getFilteredVoices: () => Voice[];
  adDuration: number;
  setAdDuration: (duration: number) => void;
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string
  ) => void;
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
  onGenerateCreative,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");

  // Auto-expanding textarea component
  const AutoExpandingTextarea = ({
    value,
    onChange,
    placeholder,
    minRows = 3,
    className,
  }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder: string;
    minRows?: number;
    className?: string;
  }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = "auto";
        // Set the height to scrollHeight to expand the textarea
        textarea.style.height = `${Math.max(
          textarea.scrollHeight,
          minRows * 24
        )}px`;
      }
    }, [value, minRows]);

    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        className={className}
        rows={minRows}
        placeholder={placeholder}
        style={{ overflow: "hidden", resize: "none" }}
      />
    );
  };

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
      <h1 className="text-6xl font-black mb-12 uppercase text-center">WBLV</h1>
      <h2 className="text-3xl font-medium mb-6 uppercase text-center">
        Campaign Brief
      </h2>
      <div className="space-y-6">
        {/* Language Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm/6 font-medium  mb-2">
              Provider
            </label>
            <Listbox value={selectedProvider} onChange={setSelectedProvider}>
              <div className="relative">
                <Listbox.Button className="grid w-full cursor-default grid-cols-1  bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
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

                <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto  bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
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
            <label className="block text-sm/6 font-medium  mb-2">
              Language
            </label>
            <Combobox
              value={
                availableLanguages.find(
                  (lang) => lang.code === selectedLanguage
                ) || null
              }
              onChange={(lang) => {
                if (lang) {
                  setSelectedLanguage(lang.code);
                  setLanguageQuery("");
                }
              }}
            >
              <div className="relative">
                <ComboboxInput
                  className="grid w-full cursor-default grid-cols-1  bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6"
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
                />
                <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon
                    className="size-5 text-gray-400"
                    aria-hidden="true"
                  />
                </ComboboxButton>

                {filteredLanguages.length > 0 && (
                  <ComboboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto  bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
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
        </div>

        <div>
          <label className="block text-sm font-medium  mb-2">
            Client Description
          </label>
          <AutoExpandingTextarea
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            placeholder="Describe the client, their business, and target audience..."
            className="bg-white block w-full  border-0 p-1.5 text-gray-900  ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring  focus:ring-sky-500 sm:text-sm sm:leading-6"
          />
        </div>

        <div>
          <label className="block text-sm font-medium  mb-2">
            Creative Brief
          </label>
          <AutoExpandingTextarea
            value={creativeBrief}
            onChange={(e) => setCreativeBrief(e.target.value)}
            placeholder="What is the key message? What's the desired tone and style?"
            className="bg-white block w-full  border-0 p-1.5 text-gray-900   placeholder:text-gray-400 ring-1 ring-inset ring-gray-300 focus:ring-2   focus:ring-sky-500 sm:text-sm sm:leading-6"
          />
        </div>

        <div>
          <label className="block text-sm font-medium  mb-2">
            Duration: {adDuration} seconds
          </label>
          <input
            type="range"
            min="30"
            max="120"
            step="5"
            value={adDuration}
            onChange={(e) => setAdDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200  appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-800 mt-1">
            <span>30s</span>
            <span>60s</span>
            <span>90s</span>
            <span>120s</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium  mb-4">
            Campaign Format
          </label>
          <div className="space-y-2">
            {campaignFormats.map((format) => (
              <div
                key={format.code}
                className={`relative flex cursor-pointer  px-5 py-4 shadow-md focus:outline-none ${
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

        <button
          onClick={handleGenerateCreative}
          disabled={
            isGenerating || !clientDescription.trim() || !creativeBrief.trim()
          }
          className="w-full  bg-black px-3 py-2 text-lg font-semibold text-white uppercase  hover:bg-sky-500 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 mt-8 mb-12"
        >
          {isGenerating ? "Generating Creative..." : "Generate Creative"}
        </button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
