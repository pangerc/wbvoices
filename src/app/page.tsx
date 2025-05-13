"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Tab } from "@headlessui/react";
import {
  ClipboardDocumentIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import {
  Language,
  getLanguageName,
  getLanguageAccents,
  areSameLanguageFamily,
  unifiedDisplayLanguages,
} from "@/utils/language";
import {
  Provider,
  Voice,
  VoiceTrack,
  CampaignFormat,
  MusicProvider,
} from "@/types";
import {
  BriefPanel,
  ScripterPanel,
  MixerPanel,
  MusicPanel,
} from "@/components";
import { generateMusic } from "@/utils/beatoven-api";
import { generateMusicWithLoudly } from "@/utils/loudly-api";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

type Track = {
  url: string;
  label: string;
  type: "voice" | "music";
};

export default function DemoTTS() {
  // State for Language section
  const [selectedProvider, setSelectedProvider] =
    useState<Provider>("elevenlabs");
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("en-US");
  const [selectedAccent, setSelectedAccent] = useState<string | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<
    { code: Language; name: string }[]
  >([]);

  // State for tab management
  const [selectedTab, setSelectedTab] = useState(0);

  // Reset status message when switching tabs
  const handleTabChange = (index: number) => {
    // Clear status message when switching tabs
    setStatusMessage("");
    setSelectedTab(index);
  };

  // State for Brief section
  const [clientDescription, setClientDescription] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [campaignFormat, setCampaignFormat] =
    useState<CampaignFormat>("ad_read");
  const [adDuration, setAdDuration] = useState(15); // Default 15 seconds

  // State for Scripter section
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>([
    { voice: null, text: "" },
  ]);

  // State for voice data
  const [allVoices, setAllVoices] = useState<Voice[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // State for Music section
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("");

  // Update track state to include metadata
  const [tracks, setTracks] = useState<Track[]>([]);

  // Reset scripter form
  const resetScripterForm = () => {
    setVoiceTracks([{ voice: null, text: "" }]);
    // Only remove voice tracks
    setTracks((tracks) => tracks.filter((t) => t.type === "music"));
    setStatusMessage("");
  };

  // Reset music form
  const resetMusicForm = () => {
    setMusicPrompt("");
    setIsGeneratingMusic(false);
    setStatusMessage("");
  };

  // Reset mixer form
  const resetMixerForm = () => {
    setTracks([]);
    setStatusMessage("");
  };

  // Reset all forms
  const resetAllForms = () => {
    resetScripterForm();
    resetMusicForm();
    resetMixerForm();
    setStatusMessage("");
  };

  // Reset form when language changes
  useEffect(() => {
    resetScripterForm();
    setSelectedAccent(null); // Reset accent when language changes
  }, [selectedLanguage, selectedProvider]);

  // Switch to mixer tab when generation is complete
  useEffect(() => {
    if (tracks.length > 0) {
      setSelectedTab(3); // Index 3 is now the mixer tab (was 4)
    }
  }, [tracks]);

  // Fetch available languages based on provider
  useEffect(() => {
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

        // Filter to keep only one Arabic option
        const filteredOptions = filterDuplicateLanguages(languageOptions);

        setAvailableLanguages(filteredOptions);
        if (filteredOptions.length > 0) {
          setSelectedLanguage(filteredOptions[0].code);
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

        // For Eleven Labs, let's also add accent-specific entries for English
        let languageOptions = uniqueLanguages
          .filter(
            (lang): lang is string =>
              typeof lang === "string" && lang !== "UNKNOWN"
          )
          .map((lang) => ({
            code: lang as Language,
            name: getLanguageName(lang),
          }));

        // Remove "en-US-EN-US" if it exists
        languageOptions = languageOptions.filter(
          (lang) => lang.code.toString() !== "en-US-EN-US"
        );

        // Filter to keep only one Arabic option
        const filteredOptions = filterDuplicateLanguages(languageOptions);

        setAvailableLanguages(filteredOptions);
        if (filteredOptions.length > 0) {
          setSelectedLanguage(filteredOptions[0].code);
        }
      }
    };
    fetchLanguages();
  }, [selectedProvider]);

  // Helper function to filter duplicate language entries
  const filterDuplicateLanguages = (
    options: { code: Language; name: string }[]
  ) => {
    const processedOptions: { code: Language; name: string }[] = [];
    const seenLanguages = new Set<string>();

    // First pass: organize by base language
    const languageGroups: Record<string, { code: Language; name: string }[]> =
      {};

    for (const option of options) {
      const baseLang = option.code.toString().split("-")[0];
      if (!languageGroups[baseLang]) {
        languageGroups[baseLang] = [];
      }
      languageGroups[baseLang].push(option);
    }

    // Second pass: handle each language group
    for (const [baseLang, group] of Object.entries(languageGroups)) {
      // Special handling for unified display languages
      if (unifiedDisplayLanguages.includes(baseLang)) {
        // For these languages, we'll choose a "primary" variant
        // Use region code preference order based on language
        const preferredVariants: Record<string, string[]> = {
          ar: ["SA", "EG", "DZ", "AR"],
          en: ["US", "GB", "AU", "CA", "IE", "IN"],
          es: ["ES", "MX", "AR", "CO"],
          fr: ["FR", "CA", "BE", "CH"],
          de: ["DE", "AT", "CH"],
          pt: ["PT", "BR"],
          zh: ["CN", "TW", "HK"],
        };

        // Try to find the preferred variant for this language
        let selectedOption = null;
        const preferences = preferredVariants[baseLang] || [];

        for (const regionCode of preferences) {
          const preferredCode = `${baseLang}-${regionCode}`;
          const found = group.find(
            (opt) =>
              opt.code.toString().toUpperCase() === preferredCode.toUpperCase()
          );
          if (found) {
            selectedOption = found;
            break;
          }
        }

        // If no preferred variant found, use the first one
        if (!selectedOption && group.length > 0) {
          selectedOption = group[0];
        }

        if (selectedOption) {
          processedOptions.push(selectedOption);
        }
        continue;
      }

      // For other languages, include all options with unique names
      group.forEach((option) => {
        if (!seenLanguages.has(option.name)) {
          seenLanguages.add(option.name);
          processedOptions.push(option);
        }
      });
    }

    return processedOptions.sort((a, b) => a.name.localeCompare(b.name));
  };

  // Fetch and filter voices based on provider and language
  useEffect(() => {
    const fetchVoices = async () => {
      console.log(
        `Fetching voices for ${selectedProvider} with language ${selectedLanguage}`
      );

      const response = await fetch(
        `/api/getVoices?provider=${selectedProvider}&language=${selectedLanguage}`
      );
      const data = await response.json();

      if (selectedProvider === "lovo") {
        // For Lovo, we get voices by language
        const voices = data.voicesByLanguage?.[selectedLanguage] || [];

        // Log voice details for debugging
        console.log(
          `LOVO voices loaded: ${voices.length} for language: ${selectedLanguage}`
        );

        if (voices.length > 0) {
          console.log("Sample voice:", voices[0]);
        }

        // Special handling for unified languages - fetch all variants
        const [baseLang] = selectedLanguage.split("-");
        if (unifiedDisplayLanguages.includes(baseLang)) {
          console.log(
            `Fetching all ${baseLang} variants for ${selectedProvider}`
          );

          // Get all voice data
          const allVoicesResponse = await fetch(`/api/getVoices?provider=lovo`);
          const allVoicesData = await allVoicesResponse.json();
          const voicesByLanguage = allVoicesData.voicesByLanguage || {};

          // Collect all voices for this language family
          const allFamilyVoices = Object.entries(voicesByLanguage)
            .filter(([lang]) => lang.startsWith(`${baseLang}-`))
            .flatMap(([lang, langVoices]) => {
              console.log(
                `Found ${(langVoices as Voice[]).length} voices for ${lang}`
              );
              return langVoices as Voice[];
            });

          console.log(
            `Combined ${baseLang} family voices: ${allFamilyVoices.length}`
          );

          if (allFamilyVoices.length > 0) {
            setAllVoices(allFamilyVoices);
          } else {
            // Fallback to just the exact language voices
            console.log(
              `No family voices found, using language-specific voices`
            );
            setAllVoices(voices);
          }
        } else {
          setAllVoices(voices);
        }
      } else {
        // For Eleven Labs, get all voices and filter later
        const voices = data.voices || [];
        console.log(`Eleven Labs voices loaded: ${voices.length}`);
        setAllVoices(voices);
      }
    };
    fetchVoices();
  }, [selectedProvider, selectedLanguage]);

  // Filter voices based on selected language and accent
  const getFilteredVoices = (ignoreAccentFilter = false) => {
    // Extract the base language from the selected language code
    const [baseLang] = selectedLanguage.split("-");
    console.log(`Filtering voices for ${selectedLanguage} (base: ${baseLang})`);
    console.log(`Total voices available: ${allVoices.length}`);

    if (selectedProvider === "lovo") {
      let filteredVoices = [];

      if (unifiedDisplayLanguages.includes(baseLang)) {
        // For unified languages, include all voices from the language family
        filteredVoices = allVoices.filter((voice) => {
          if (!voice.language) return false;
          return voice.language.startsWith(`${baseLang}-`);
        });
        console.log(`Family match voices: ${filteredVoices.length}`);
      } else {
        // For other languages, only include exact matches
        filteredVoices = allVoices.filter(
          (voice) => voice.language === selectedLanguage
        );
        console.log(`Exact match voices: ${filteredVoices.length}`);
      }

      // If we still have no voices, return all voices as a fallback
      if (filteredVoices.length === 0) {
        console.log(
          "No matching voices found, using all available voices as fallback"
        );
        return allVoices;
      }

      // Filter by accent if one is selected and we're not ignoring accent filter
      if (selectedAccent && !ignoreAccentFilter) {
        const normalizedAccent = selectedAccent.toLowerCase();
        const accentFiltered = filteredVoices.filter(
          (voice) =>
            voice.accent && voice.accent.toLowerCase() === normalizedAccent
        );

        // Only use accent filtering if we found matching voices
        if (accentFiltered.length > 0) {
          return accentFiltered;
        }

        // Otherwise return all filtered voices (ignoring accent)
        console.log(
          `No voices found for accent ${selectedAccent}, ignoring accent filter`
        );
      }

      return filteredVoices;
    } else {
      // For Eleven Labs
      // Include exact language matches
      const exactMatches = allVoices.filter(
        (voice) => voice.language === selectedLanguage
      );

      // Include voices within the same language family
      const familyMatches = allVoices.filter(
        (voice) =>
          voice.language &&
          areSameLanguageFamily(selectedLanguage, voice.language) &&
          voice.language !== selectedLanguage // avoid duplicates
      );

      // Include multilingual voices with relevant accents
      const multilingualMatches = allVoices.filter((voice) => {
        if (!voice.isMultilingual || !voice.accent) return false;

        const voiceAccent = voice.accent.toLowerCase();
        const languageAccents = getLanguageAccents(selectedLanguage).map(
          (accent) => accent.toLowerCase()
        );

        // Check if the voice accent matches any of the language's known accents
        return languageAccents.some(
          (accent) =>
            voiceAccent.includes(accent) &&
            accent !== "none" &&
            accent !== "standard"
        );
      });

      const allPossibleVoices = [
        ...exactMatches,
        ...familyMatches,
        ...multilingualMatches,
      ];

      // Now filter by accent if one is selected and we're not ignoring accent filter
      if (selectedAccent && !ignoreAccentFilter) {
        const normalizedAccent = selectedAccent.toLowerCase();
        const accentFiltered = allPossibleVoices.filter(
          (voice) =>
            voice.accent && voice.accent.toLowerCase() === normalizedAccent
        );

        // Only use accent filtering if we found matching voices
        if (accentFiltered.length > 0) {
          return accentFiltered;
        }

        // Otherwise return all filtered voices (ignoring accent)
        console.log(
          `No voices found for accent ${selectedAccent}, ignoring accent filter`
        );
      }

      return allPossibleVoices;
    }
  };

  const addVoiceTrack = () => {
    setVoiceTracks([...voiceTracks, { voice: null, text: "" }]);
  };

  const updateVoiceTrack = (index: number, updates: Partial<VoiceTrack>) => {
    const newTracks = [...voiceTracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setVoiceTracks(newTracks);
  };

  const handleRemoveTrack = (index: number) => {
    setTracks((current) => current.filter((_, i) => i !== index));
  };

  const generateAudio = async () => {
    setIsGenerating(true);
    setStatusMessage("Generating audio...");
    // Remove existing voice tracks
    setTracks((current) => current.filter((t) => t.type === "music"));

    try {
      const newTracks: Track[] = [];
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
        newTracks.push({
          url,
          label: `${track.voice.name}: "${track.text.slice(0, 30)}${
            track.text.length > 30 ? "..." : ""
          }"`,
          type: "voice",
        });
      }

      setTracks((current) => [
        ...current.filter((t) => t.type === "music"),
        ...newTracks,
      ]);
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

  const handleGenerateMusic = async (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ) => {
    try {
      setIsGeneratingMusic(true);
      setStatusMessage("Generating music...");

      // Remove any existing music tracks before generating new ones
      setTracks((current) => current.filter((t) => t.type !== "music"));

      let musicTrack;

      if (provider === "beatoven") {
        musicTrack = await generateMusic(prompt, duration);
      } else {
        // Loudly requires duration in 15-second increments
        const Duration = Math.round(duration / 15) * 15;
        musicTrack = await generateMusicWithLoudly(prompt, Duration);
      }

      if (!musicTrack || !musicTrack.url) {
        throw new Error(`Failed to generate music with ${provider}`);
      }

      // Add to tracks
      const newTrack: Track = {
        url: musicTrack.url,
        label: `Music: "${musicTrack.title.substring(0, 30)}${
          musicTrack.title.length > 30 ? "..." : ""
        }" (${duration}s)`,
        type: "music",
      };

      // Remove any existing music tracks
      setTracks((current) => [
        ...current.filter((t) => t.type !== "music"),
        newTrack,
      ]);

      setStatusMessage("Music generation complete!");
      setSelectedTab(3); // Switch to mixer tab (was 4)
    } catch (error) {
      console.error("Failed to generate music:", error);
      setStatusMessage(
        `Failed to generate music: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const handleGenerateCreative = (
    segments: Array<{ voiceId: string; text: string }>,
    prompt: string
  ) => {
    // Reset existing voice tracks
    setTracks((current) => current.filter((t) => t.type === "music"));

    // Get the filtered voices for the selected language
    const filteredVoices = getFilteredVoices();
    console.log(
      "Filtered voices for voice selection:",
      filteredVoices.map((v) => `${v.name} (${v.id})`)
    );

    // Create new voice tracks from segments
    const newVoiceTracks = segments.map((segment) => {
      // Try to find the voice by ID from filtered voices first
      let voice = filteredVoices.find((v) => v.id === segment.voiceId);

      // If not found in filtered voices, try to find by ID in all voices (fallback)
      if (!voice) {
        voice = allVoices.find((v) => v.id === segment.voiceId);
      }

      // If still not found, try to find a voice by name in filtered voices
      if (!voice) {
        voice = filteredVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
      }

      // If still not found, try to find by name in all voices (fallback)
      if (!voice) {
        voice = allVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
      }

      // If still not found, use the first available voice for the selected language
      if (!voice) {
        console.log(
          `Voice ID "${segment.voiceId}" not found, using a fallback voice`
        );
        voice = filteredVoices.length > 0 ? filteredVoices[0] : allVoices[0];
      }

      return {
        voice,
        text: segment.text,
      } as VoiceTrack;
    });

    // Reset forms before setting new data
    resetAllForms();

    setVoiceTracks(newVoiceTracks);
    setMusicPrompt(prompt); // Store the music prompt

    // Switch to scripter tab
    setSelectedTab(1); // Scripter is now at index 1 (was 2)
  };

  return (
    <div
      className="flex h-screen bg-white text-black relative z-10"
      style={{
        backgroundImage: "url('/bg-pixels.svg')",
        backgroundSize: "contain",
        backgroundPosition: "left",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Tab.Group
        vertical
        as="div"
        className="flex w-full"
        selectedIndex={selectedTab}
        onChange={handleTabChange}
      >
        {/* Sidebar */}
        <div className="w-64 bg-black shadow-lg flex-shrink-0">
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
                className={({ selected }) =>
                  classNames(
                    "w-full text-left p-2  transition-colors focus:outline-none flex items-center gap-3",
                    selected
                      ? "bg-white text-black "
                      : "text-white hover:bg-red-700"
                  )
                }
              >
                <ClipboardDocumentIcon className="size-5 shrink-0" />
                Brief
              </Tab>
              <Tab
                className={({ selected }) =>
                  classNames(
                    "w-full text-left p-2  transition-colors focus:outline-none flex items-center gap-3",
                    selected
                      ? "bg-white text-black"
                      : "text-white hover:bg-red-700"
                  )
                }
              >
                <ChatBubbleLeftRightIcon className="size-5 shrink-0" />
                Script
              </Tab>
              <Tab
                className={({ selected }) =>
                  classNames(
                    "w-full text-left p-2  transition-colors focus:outline-none flex items-center gap-3",
                    selected
                      ? "bg-white text-black"
                      : "text-white hover:bg-red-700"
                  )
                }
              >
                <MusicalNoteIcon className="size-5 shrink-0" />
                Music
              </Tab>
              <Tab
                className={({ selected }) =>
                  classNames(
                    "w-full text-left p-2  transition-colors focus:outline-none flex items-center gap-3",
                    selected
                      ? "bg-white text-black"
                      : "text-white hover:bg-red-700"
                  )
                }
              >
                <SpeakerWaveIcon className="size-5 shrink-0" />
                Mix
              </Tab>
            </Tab.List>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <Tab.Panels className="h-full overflow-auto">
            <Tab.Panel className="w-full h-full">
              <BriefPanel
                clientDescription={clientDescription}
                setClientDescription={setClientDescription}
                creativeBrief={creativeBrief}
                setCreativeBrief={setCreativeBrief}
                campaignFormat={campaignFormat}
                setCampaignFormat={setCampaignFormat}
                selectedLanguage={selectedLanguage}
                setSelectedLanguage={setSelectedLanguage}
                selectedProvider={selectedProvider}
                setSelectedProvider={setSelectedProvider}
                availableLanguages={availableLanguages}
                getFilteredVoices={getFilteredVoices}
                adDuration={adDuration}
                setAdDuration={setAdDuration}
                selectedAccent={selectedAccent}
                setSelectedAccent={setSelectedAccent}
                onGenerateCreative={handleGenerateCreative}
              />
            </Tab.Panel>

            <Tab.Panel>
              <ScripterPanel
                voiceTracks={voiceTracks}
                updateVoiceTrack={updateVoiceTrack}
                addVoiceTrack={addVoiceTrack}
                generateAudio={generateAudio}
                isGenerating={isGenerating}
                statusMessage={statusMessage}
                selectedLanguage={selectedLanguage}
                getFilteredVoices={getFilteredVoices}
                resetForm={resetScripterForm}
              />
            </Tab.Panel>

            <Tab.Panel>
              <MusicPanel
                onGenerate={handleGenerateMusic}
                isGenerating={isGeneratingMusic}
                statusMessage={statusMessage}
                initialPrompt={musicPrompt}
                adDuration={adDuration}
                resetForm={resetMusicForm}
              />
            </Tab.Panel>

            <Tab.Panel>
              <MixerPanel
                tracks={tracks}
                onRemoveTrack={handleRemoveTrack}
                resetForm={resetMixerForm}
              />
            </Tab.Panel>
          </Tab.Panels>
        </div>
      </Tab.Group>
    </div>
  );
}
