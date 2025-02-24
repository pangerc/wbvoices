"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Tab,
  Listbox,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import {
  LanguageIcon,
  BuildingStorefrontIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import "flag-icons/css/flag-icons.min.css";

type Language =
  | "af-ZA"
  | "ar-DZ"
  | "ar-EG"
  | "ar-SA"
  | "bg-BG"
  | "bn-BD"
  | "ca-ES"
  | "cs-CZ"
  | "da-DK"
  | "de-AT"
  | "de-CH"
  | "de-DE"
  | "el-GR"
  | "en-AU"
  | "en-GB"
  | "en-IE"
  | "en-IN"
  | "en-US"
  | "es-ES"
  | "es-MX"
  | "et-EE"
  | "fa-IR"
  | "fi-FI"
  | "fr-BE"
  | "fr-CA"
  | "fr-CH"
  | "fr-FR"
  | "gl-ES"
  | "gu-IN"
  | "he-IL"
  | "hi-IN"
  | "hr-HR"
  | "hu-HU"
  | "hy-AM"
  | "id-ID"
  | "is-IS"
  | "it-IT"
  | "ja-JP"
  | "jv-ID"
  | "ka-GE"
  | "kk-KZ"
  | "km-KH"
  | "kn-IN"
  | "ko-KR"
  | "lo-LA"
  | "lt-LT"
  | "lv-LV"
  | "ml-IN"
  | "mr-IN"
  | "ms-MY"
  | "mt-MT"
  | "my-MM"
  | "nb-NO"
  | "nl-BE"
  | "nl-NL"
  | "pl-PL"
  | "pt-BR"
  | "pt-PT"
  | "ro-RO"
  | "ru-RU"
  | "si-LK"
  | "sk-SK"
  | "sl-SI"
  | "so-SO"
  | "sq-AL"
  | "sr-RS"
  | "su-ID"
  | "sv-SE"
  | "sw-KE"
  | "ta-IN"
  | "te-IN"
  | "th-TH"
  | "tr-TR"
  | "uk-UA"
  | "ur-PK"
  | "uz-UZ"
  | "vi-VN"
  | "zh-CN"
  | "zh-HK"
  | "zh-TW";

type Provider = "lovo" | "elevenlabs";
type Voice = {
  id: string;
  name: string;
  gender: "male" | "female" | null;
  sampleUrl?: string;
  language?: string;
  isMultilingual?: boolean;
  accent?: string;
};

type VoiceTrack = {
  voice: Voice | null;
  text: string;
};

type CampaignFormat = "ad_read" | "dialog" | "group";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

// Helper function to get flag code from language code
const getFlagCode = (languageCode: string): string => {
  const mapping: Record<string, string> = {
    // English variants
    "en-US": "us",
    "en-GB": "gb",
    "en-AU": "au",
    "en-IE": "ie",
    "en-IN": "in",
    // German variants
    "de-DE": "de",
    "de-AT": "at",
    "de-CH": "ch",
    // French variants
    "fr-FR": "fr",
    "fr-BE": "be",
    "fr-CA": "ca",
    "fr-CH": "ch",
    // Spanish variants
    "es-ES": "es",
    "es-MX": "mx",
    // Other languages
    "it-IT": "it",
    "sv-SE": "se",
    "sl-SI": "si",
    "hr-HR": "hr",
    "lt-LT": "lt",
    "bs-BA": "ba",
    "cy-GB": "gb",
    "bn-IN": "in",
    "ar-DZ": "dz",
    "ar-EG": "eg",
    "ar-SA": "sa",
    "bg-BG": "bg",
    "ca-ES": "es",
    "cs-CZ": "cz",
    "da-DK": "dk",
    "el-GR": "gr",
    "et-EE": "ee",
    "fa-IR": "ir",
    "fi-FI": "fi",
    "gl-ES": "es",
    "gu-IN": "in",
    "he-IL": "il",
    "hi-IN": "in",
    "hu-HU": "hu",
    "hy-AM": "am",
    "id-ID": "id",
    "is-IS": "is",
    "ja-JP": "jp",
    "jv-ID": "id",
    "ka-GE": "ge",
    "kk-KZ": "kz",
    "km-KH": "kh",
    "kn-IN": "in",
    "ko-KR": "kr",
    "lo-LA": "la",
    "lv-LV": "lv",
    "ml-IN": "in",
    "mr-IN": "in",
    "ms-MY": "my",
    "mt-MT": "mt",
    "my-MM": "mm",
    "nb-NO": "no",
    "nl-BE": "be",
    "nl-NL": "nl",
    "pl-PL": "pl",
    "pt-BR": "br",
    "pt-PT": "pt",
    "ro-RO": "ro",
    "ru-RU": "ru",
    "si-LK": "lk",
    "sk-SK": "sk",
    "so-SO": "so",
    "sq-AL": "al",
    "sr-RS": "rs",
    "su-ID": "id",
    "sw-KE": "ke",
    "ta-IN": "in",
    "te-IN": "in",
    "th-TH": "th",
    "tr-TR": "tr",
    "uk-UA": "ua",
    "ur-PK": "pk",
    "uz-UZ": "uz",
    "vi-VN": "vn",
    "zh-CN": "cn",
    "zh-HK": "hk",
    "zh-TW": "tw",
  };
  return mapping[languageCode] || languageCode.split("-")[1].toLowerCase();
};

export default function DemoTTS() {
  // State for Language section
  const [selectedProvider, setSelectedProvider] =
    useState<Provider>("elevenlabs");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("en-US");
  const [languageQuery, setLanguageQuery] = useState("");
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: Language; name: string }[]
  >([]);

  // State for tab management
  const [selectedTab, setSelectedTab] = useState(0);

  // State for Brief section
  const [clientDescription, setClientDescription] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [campaignFormat, setCampaignFormat] =
    useState<CampaignFormat>("ad_read");

  // State for Scripter section
  const [aiPrompt, setAiPrompt] = useState("");
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>([
    { voice: null, text: "" },
  ]);

  // State for voice data
  const [allVoices, setAllVoices] = useState<Voice[]>([]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Reset scripter form
  const resetScripterForm = () => {
    setAiPrompt("");
    setVoiceTracks([{ voice: null, text: "" }]);
    setAudioUrls([]);
    setStatusMessage("");
  };

  // Reset form when language changes
  React.useEffect(() => {
    resetScripterForm();
  }, [selectedLanguage, selectedProvider]);

  // Switch to mixer tab when generation is complete
  React.useEffect(() => {
    if (audioUrls.length > 0) {
      setSelectedTab(3); // Index 3 is the mixer tab
    }
  }, [audioUrls]);

  // Language name mapping
  const getLanguageName = (code: string): string => {
    const mapping = {
      // English variants
      "en-US": "English (US)",
      "en-GB": "English (UK)",
      "en-AU": "English (Australia)",
      "en-IE": "English (Ireland)",
      "en-IN": "English (India)",
      // German variants
      "de-DE": "German",
      "de-AT": "German (Austria)",
      "de-CH": "German (Switzerland)",
      // French variants
      "fr-FR": "French",
      "fr-BE": "French (Belgium)",
      "fr-CA": "French (Canada)",
      "fr-CH": "French (Switzerland)",
      // Spanish variants
      "es-ES": "Spanish (Spain)",
      "es-MX": "Spanish (Mexico)",
      // Arabic variants
      "ar-AE": "Arabic (UAE)",
      "ar-BH": "Arabic (Bahrain)",
      "ar-DZ": "Arabic (Algeria)",
      "ar-EG": "Arabic (Egypt)",
      "ar-SA": "Arabic (Saudi Arabia)",
      // Asian languages
      "zh-CN": "Chinese (Simplified)",
      "zh-HK": "Chinese (Hong Kong)",
      "zh-TW": "Chinese (Traditional)",
      "ja-JP": "Japanese",
      "ko-KR": "Korean",
      // Indian languages
      "hi-IN": "Hindi",
      "bn-IN": "Bengali",
      "ta-IN": "Tamil",
      "te-IN": "Telugu",
      "ml-IN": "Malayalam",
      "gu-IN": "Gujarati",
      "kn-IN": "Kannada",
      "mr-IN": "Marathi",
      // Other languages
      "af-ZA": "Afrikaans",
      "am-ET": "Amharic",
      "hy-AM": "Armenian",
      "az-AZ": "Azerbaijani",
      "eu-ES": "Basque",
      "be-BY": "Belarusian",
      "bg-BG": "Bulgarian",
      "my-MM": "Burmese",
      "ca-ES": "Catalan",
      "hr-HR": "Croatian",
      "cs-CZ": "Czech",
      "da-DK": "Danish",
      "nl-BE": "Dutch (Belgium)",
      "nl-NL": "Dutch",
      "et-EE": "Estonian",
      "fi-FI": "Finnish",
      "ka-GE": "Georgian",
      "el-GR": "Greek",
      "he-IL": "Hebrew",
      "hu-HU": "Hungarian",
      "is-IS": "Icelandic",
      "id-ID": "Indonesian",
      "it-IT": "Italian",
      "kk-KZ": "Kazakh",
      "km-KH": "Khmer",
      "lo-LA": "Lao",
      "lv-LV": "Latvian",
      "lt-LT": "Lithuanian",
      "mk-MK": "Macedonian",
      "ms-MY": "Malay",
      "mn-MN": "Mongolian",
      "ne-NP": "Nepali",
      "nb-NO": "Norwegian",
      "fa-IR": "Persian",
      "pl-PL": "Polish",
      "pt-BR": "Portuguese (Brazil)",
      "pt-PT": "Portuguese",
      "ro-RO": "Romanian",
      "ru-RU": "Russian",
      "sr-RS": "Serbian",
      "si-LK": "Sinhala",
      "sk-SK": "Slovak",
      "sl-SI": "Slovenian",
      "so-SO": "Somali",
      "sw-KE": "Swahili",
      "sv-SE": "Swedish",
      "tl-PH": "Tagalog",
      "th-TH": "Thai",
      "tr-TR": "Turkish",
      "uk-UA": "Ukrainian",
      "ur-PK": "Urdu",
      "uz-UZ": "Uzbek",
      "vi-VN": "Vietnamese",
      "cy-GB": "Welsh",
    } as const;
    return mapping[code as keyof typeof mapping] || code;
  };

  // Fetch available languages based on provider
  React.useEffect(() => {
    const fetchLanguages = async () => {
      if (selectedProvider === "lovo") {
        // Fetch all voices from LOVO API
        const response = await fetch(`/api/getVoices?provider=lovo`);
        const data = await response.json();
        const voicesByLanguage = data.voicesByLanguage || {};

        // Get unique languages and sort them
        const uniqueLanguages = Object.keys(voicesByLanguage).sort();

        // Convert to the format we need
        const languageOptions = uniqueLanguages.map((lang) => ({
          code: lang as Language,
          name: getLanguageName(lang),
        }));

        setAvailableLanguages(languageOptions);
        if (languageOptions.length > 0) {
          setSelectedLanguage(languageOptions[0].code);
        }
      } else {
        // For Eleven Labs, fetch all voices and extract unique languages
        const response = await fetch(`/api/getVoices?provider=elevenlabs`);
        const data = await response.json();
        const voices = data.voices || [];

        // Get unique languages from voices
        const uniqueLanguages = [
          ...new Set(voices.map((v: Voice) => v.language)),
        ].sort();

        // Convert to the format we need
        const languageOptions = uniqueLanguages
          .filter(
            (lang): lang is string =>
              typeof lang === "string" && lang !== "UNKNOWN"
          )
          .map((lang) => ({
            code: lang as Language,
            name: getLanguageName(lang),
          }));

        setAvailableLanguages(languageOptions);
        if (languageOptions.length > 0) {
          setSelectedLanguage(languageOptions[0].code);
        }
      }
    };
    fetchLanguages();
  }, [selectedProvider]);

  const campaignFormats = [
    {
      code: "ad_read" as CampaignFormat,
      name: "Ad Read",
      description: "Single voice reading the advertisement script",
    },
    {
      code: "dialog" as CampaignFormat,
      name: "Dialog",
      description: "Two voices having a conversation about the product",
    },
    {
      code: "group" as CampaignFormat,
      name: "Group",
      description: "Multiple voices interacting in a group setting",
    },
  ];

  // Fetch and filter voices based on provider and language
  React.useEffect(() => {
    const fetchVoices = async () => {
      const response = await fetch(
        `/api/getVoices?provider=${selectedProvider}&language=${selectedLanguage}`
      );
      const data = await response.json();

      if (selectedProvider === "lovo") {
        // For Lovo, we get voices by language
        const voices = data.voicesByLanguage?.[selectedLanguage] || [];
        setAllVoices(voices);
      } else {
        // For Eleven Labs, get all voices and filter later
        setAllVoices(data.voices || []);
      }
    };
    fetchVoices();
  }, [selectedProvider, selectedLanguage]);

  // Filter voices based on selected language
  const getFilteredVoices = () => {
    if (selectedProvider === "lovo") {
      return allVoices; // Lovo voices are already filtered by language
    }

    // For Eleven Labs, show multilingual voices and voices matching the language
    return allVoices.filter((voice) => {
      // Always show voices that match the selected language exactly
      if (voice.language === selectedLanguage) return true;

      // For multilingual voices, check if they have the right accent
      if (voice.isMultilingual) {
        const voiceAccent = voice.accent?.toLowerCase() || "";

        // For Italian
        if (selectedLanguage === "it-IT" && voiceAccent === "italian")
          return true;
        // For Swedish
        if (selectedLanguage === "sv-SE" && voiceAccent === "swedish")
          return true;
        // For English
        if (
          selectedLanguage === "en-US" &&
          (voiceAccent.includes("american") ||
            voiceAccent.includes("british") ||
            voiceAccent.includes("irish") ||
            voiceAccent.includes("australian") ||
            voiceAccent.includes("transatlantic"))
        )
          return true;
      }

      return false;
    });
  };

  // Log filtered voices for debugging
  React.useEffect(() => {
    if (selectedProvider === "elevenlabs") {
      console.log("Selected language:", selectedLanguage);
      console.log("Filtered voices:", getFilteredVoices());
    }
  }, [selectedLanguage, allVoices, selectedProvider]);

  const addVoiceTrack = () => {
    setVoiceTracks([...voiceTracks, { voice: null, text: "" }]);
  };

  const updateVoiceTrack = (index: number, updates: Partial<VoiceTrack>) => {
    const newTracks = [...voiceTracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setVoiceTracks(newTracks);
  };

  const generateAudio = async () => {
    setIsGenerating(true);
    setStatusMessage("Generating audio...");
    setAudioUrls([]);

    try {
      const newAudioUrls = [];
      for (const track of voiceTracks) {
        if (!track.voice || !track.text) continue;

        const res = await fetch("/api/streamAudio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: track.text,
            provider: selectedProvider,
            voiceId: track.voice.id,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(JSON.stringify(errBody));
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        newAudioUrls.push(url);
      }

      setAudioUrls(newAudioUrls);
      setStatusMessage("Audio generation complete!");
    } catch (error) {
      console.error(error);
      setStatusMessage(
        error instanceof Error ? error.message : "An error occurred"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter languages based on search query
  const filteredLanguages =
    languageQuery === ""
      ? availableLanguages
      : availableLanguages.filter((lang) => {
          return lang.name.toLowerCase().includes(languageQuery.toLowerCase());
        });

  return (
    <>
      <div className="flex h-screen bg-gray-100">
        <Tab.Group
          vertical
          as="div"
          className="flex w-full"
          selectedIndex={selectedTab}
          onChange={setSelectedTab}
        >
          {/* Sidebar */}
          <div className="w-64 bg-sky-400 shadow-lg flex-shrink-0">
            <div className="p-4">
              <Image
                src="/logo.svg"
                alt="Logo"
                width={150}
                height={40}
                className="mb-8 mt-6"
              />

              <Tab.List className="space-y-2">
                <Tab
                  className={({ selected }: { selected: boolean }) =>
                    classNames(
                      "w-full text-left p-2 rounded transition-colors focus:outline-none flex items-center gap-3",
                      selected
                        ? "bg-white text-sky-600"
                        : "text-white hover:bg-sky-500"
                    )
                  }
                >
                  <LanguageIcon className="size-5 shrink-0" />
                  Language
                </Tab>
                <Tab
                  className={({ selected }: { selected: boolean }) =>
                    classNames(
                      "w-full text-left p-2 rounded transition-colors focus:outline-none flex items-center gap-3",
                      selected
                        ? "bg-white text-sky-600"
                        : "text-white hover:bg-sky-500"
                    )
                  }
                >
                  <BuildingStorefrontIcon className="size-5 shrink-0" />
                  Brief
                </Tab>
                <Tab
                  className={({ selected }: { selected: boolean }) =>
                    classNames(
                      "w-full text-left p-2 rounded transition-colors focus:outline-none flex items-center gap-3",
                      selected
                        ? "bg-white text-sky-600"
                        : "text-white hover:bg-sky-500"
                    )
                  }
                >
                  <ChatBubbleLeftRightIcon className="size-5 shrink-0" />
                  Scripter
                </Tab>
                <Tab
                  className={({ selected }: { selected: boolean }) =>
                    classNames(
                      "w-full text-left p-2 rounded transition-colors focus:outline-none flex items-center gap-3",
                      selected
                        ? "bg-white text-sky-600"
                        : "text-white hover:bg-sky-500"
                    )
                  }
                >
                  <SpeakerWaveIcon className="size-5 shrink-0" />
                  Mixer
                </Tab>
              </Tab.List>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <Tab.Panels className="h-full overflow-auto">
              {/* Language Panel */}
              <Tab.Panel className="p-8 h-full">
                <h2 className="text-2xl font-bold mb-6">Language Selection</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm/6 font-medium text-gray-900 mb-2">
                      Provider
                    </label>
                    <Listbox
                      value={selectedProvider}
                      onChange={setSelectedProvider}
                    >
                      <div className="relative">
                        <Listbox.Button className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
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

                        <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
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
                                        active ? "text-white" : "text-sky-500"
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
                    <label className="block text-sm/6 font-medium text-gray-900 mb-2">
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
                          className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6"
                          onChange={(event) =>
                            setLanguageQuery(event.target.value)
                          }
                          onBlur={() => setLanguageQuery("")}
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
                          <ComboboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
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
                                          selected
                                            ? "font-semibold"
                                            : "font-normal"
                                        }`}
                                      >
                                        {lang.name}
                                      </span>
                                    </div>

                                    {selected && (
                                      <span
                                        className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                          active ? "text-white" : "text-sky-500"
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
              </Tab.Panel>

              {/* Brief Panel */}
              <Tab.Panel className="p-8 h-full">
                <h2 className="text-2xl font-bold mb-6">Client and Brief</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Client Description
                    </label>
                    <textarea
                      value={clientDescription}
                      onChange={(e) => setClientDescription(e.target.value)}
                      className="w-full p-2 border rounded"
                      rows={3}
                      placeholder="Describe the client and their business..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Creative Brief
                    </label>
                    <textarea
                      value={creativeBrief}
                      onChange={(e) => setCreativeBrief(e.target.value)}
                      className="w-full p-2 border rounded"
                      rows={3}
                      placeholder="What is the creative direction for this campaign?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm/6 font-medium text-gray-900 mb-2">
                      Campaign Format
                    </label>
                    <fieldset
                      aria-label="Campaign format"
                      className="-space-y-px rounded-md bg-white"
                    >
                      {campaignFormats.map((format) => (
                        <label
                          key={format.code}
                          className="group relative flex cursor-pointer border border-gray-200 p-4 first:rounded-tl-md first:rounded-tr-md last:rounded-br-md last:rounded-bl-md focus:outline-hidden has-checked:border-indigo-200 has-checked:bg-indigo-50"
                        >
                          <input
                            type="radio"
                            name="campaign-format"
                            value={format.code}
                            checked={campaignFormat === format.code}
                            onChange={(e) =>
                              setCampaignFormat(
                                e.target.value as CampaignFormat
                              )
                            }
                            className="relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden checked:border-sky-500 checked:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:border-gray-300 disabled:bg-gray-100 disabled:before:bg-gray-400 forced-colors:appearance-auto forced-colors:before:hidden"
                          />
                          <span className="ml-3 flex flex-col">
                            <span className="block text-sm font-medium text-gray-900 group-has-checked:text-sky-900">
                              {format.name}
                            </span>
                            <span className="block text-sm text-gray-500 group-has-checked:text-sky-700">
                              {format.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Documents
                    </label>
                    <div className="border-2 border-dashed rounded p-4 text-center">
                      <p className="text-gray-500">
                        Drag and drop files here or click to upload
                      </p>
                    </div>
                  </div>
                </div>
              </Tab.Panel>

              {/* Scripter Panel */}
              <Tab.Panel className="p-8 h-full">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold">Scripting Studio</h2>
                  <button
                    onClick={resetScripterForm}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Reset Form
                  </button>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      AI Prompt
                    </label>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="w-full p-2 border rounded "
                      rows={3}
                      placeholder="Enter your prompt for AI script generation..."
                    />
                  </div>

                  <div className="space-y-4">
                    {voiceTracks.map((track, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="w-1/3">
                          <Listbox
                            value={track.voice}
                            onChange={(voice) =>
                              updateVoiceTrack(index, { voice })
                            }
                          >
                            <div className="relative">
                              <Listbox.Button className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                                <span className="col-start-1 row-start-1 flex w-full gap-2 pr-6">
                                  {track.voice ? (
                                    <>
                                      <span
                                        className={`fi fi-${getFlagCode(
                                          track.voice.language ||
                                            selectedLanguage
                                        )} fis`}
                                      />
                                      <span className="truncate">
                                        {track.voice.name}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-gray-500">
                                      Select a voice
                                    </span>
                                  )}
                                </span>
                                <ChevronUpDownIcon
                                  aria-hidden="true"
                                  className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                                />
                              </Listbox.Button>

                              <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                                {getFilteredVoices().map((voice) => (
                                  <Listbox.Option
                                    key={voice.id}
                                    value={voice}
                                    className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                                  >
                                    {({ selected, active }) => (
                                      <>
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className={`fi fi-${getFlagCode(
                                                voice.language ||
                                                  selectedLanguage
                                              )} fis`}
                                            />
                                            <span
                                              className={`truncate font-normal ${
                                                selected ? "font-semibold" : ""
                                              }`}
                                            >
                                              {voice.name}
                                            </span>
                                          </div>
                                          <span
                                            className={`text-xs ${
                                              active
                                                ? "text-sky-200"
                                                : "text-gray-500"
                                            }`}
                                          >
                                            {[
                                              voice.gender &&
                                                voice.gender
                                                  .charAt(0)
                                                  .toUpperCase() +
                                                  voice.gender.slice(1),
                                              voice.accent,
                                              voice.isMultilingual &&
                                                "Multilingual",
                                            ]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                        </div>

                                        {selected && (
                                          <span
                                            className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                              active
                                                ? "text-white"
                                                : "text-sky-500"
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
                          {track.voice && (
                            <p className="mt-1 text-xs text-gray-500">
                              {[
                                track.voice.gender &&
                                  track.voice.gender.charAt(0).toUpperCase() +
                                    track.voice.gender.slice(1),
                                track.voice.accent,
                                track.voice.isMultilingual && "Multilingual",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                        <textarea
                          value={track.text}
                          onChange={(e) =>
                            updateVoiceTrack(index, { text: e.target.value })
                          }
                          className="flex-1 p-2 border rounded bg-white"
                          placeholder="Enter text for this voice..."
                        />
                      </div>
                    ))}

                    <button
                      onClick={addVoiceTrack}
                      className="w-full p-2 border-2 border-dashed rounded hover:bg-gray-50"
                    >
                      + Add Voice Track
                    </button>
                  </div>

                  <button
                    onClick={generateAudio}
                    disabled={isGenerating}
                    className="w-full bg-sky-500 text-white py-2 px-4 rounded hover:bg-black disabled:opacity-50"
                  >
                    {isGenerating ? "Generating..." : "Generate Audio"}
                  </button>

                  {statusMessage && (
                    <p className="text-center text-sm text-gray-600">
                      {statusMessage}
                    </p>
                  )}
                </div>
              </Tab.Panel>

              {/* Mixer Panel */}
              <Tab.Panel className="p-8 h-full">
                <h2 className="text-2xl font-bold mb-6">Mixing Studio</h2>
                <div className="space-y-4">
                  {audioUrls.map((url, index) => (
                    <div key={index} className="p-4 bg-white rounded shadow">
                      <p className="mb-2">Track {index + 1}</p>
                      <audio controls src={url} className="w-full">
                        Your browser does not support the audio element.
                      </audio>
                    </div>
                  ))}
                </div>
              </Tab.Panel>
            </Tab.Panels>
          </div>
        </Tab.Group>
      </div>
    </>
  );
}
