"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Tab } from "@headlessui/react";
import {
  LanguageIcon,
  BuildingStorefrontIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import "flag-icons/css/flag-icons.min.css";
import { Language, getLanguageName } from "@/utils/language";
import { Provider, Voice, VoiceTrack, CampaignFormat } from "@/types";
import {
  LanguagePanel,
  BriefPanel,
  ScripterPanel,
  MixerPanel,
  MusicPanel,
} from "@/components";
import { generateMusic } from "@/utils/beatoven-api";

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

  // Reset form when language changes
  React.useEffect(() => {
    resetScripterForm();
  }, [selectedLanguage, selectedProvider]);

  // Switch to mixer tab when generation is complete
  React.useEffect(() => {
    if (tracks.length > 0) {
      setSelectedTab(4); // Index 4 is now the mixer tab
    }
  }, [tracks]);

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

  const handleGenerateMusic = async (prompt: string) => {
    setIsGeneratingMusic(true);
    setStatusMessage("Generating music...");
    try {
      const audioUrl = await generateMusic(prompt);
      // Remove existing music track and add new one
      setTracks((current) => [
        ...current.filter((t) => t.type === "voice"),
        {
          url: audioUrl,
          label: `Music: "${prompt.slice(0, 30)}${
            prompt.length > 30 ? "..." : ""
          }"`,
          type: "music",
        },
      ]);
      setSelectedTab(4); // Switch to mixer tab
      setStatusMessage("Music generation complete!");
    } catch (error) {
      console.error("Failed to generate music:", error);
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to generate music"
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

    // Create new voice tracks from segments
    const newVoiceTracks = segments
      .map((segment) => {
        const voice = allVoices.find((v) => v.id === segment.voiceId);
        if (!voice) return null;
        return {
          voice,
          text: segment.text,
        } as VoiceTrack;
      })
      .filter((track): track is VoiceTrack => track !== null);

    setVoiceTracks(newVoiceTracks);
    setMusicPrompt(prompt); // Store the music prompt

    // Switch to scripter tab
    setSelectedTab(2);
  };

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
                  className={({ selected }) =>
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
                  className={({ selected }) =>
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
                  className={({ selected }) =>
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
                  className={({ selected }) =>
                    classNames(
                      "w-full text-left p-2 rounded transition-colors focus:outline-none flex items-center gap-3",
                      selected
                        ? "bg-white text-sky-600"
                        : "text-white hover:bg-sky-500"
                    )
                  }
                >
                  <MusicalNoteIcon className="size-5 shrink-0" />
                  Music
                </Tab>
                <Tab
                  className={({ selected }) =>
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
              <Tab.Panel>
                <LanguagePanel
                  selectedProvider={selectedProvider}
                  setSelectedProvider={setSelectedProvider}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                  availableLanguages={availableLanguages}
                />
              </Tab.Panel>

              <Tab.Panel>
                <BriefPanel
                  clientDescription={clientDescription}
                  setClientDescription={setClientDescription}
                  creativeBrief={creativeBrief}
                  setCreativeBrief={setCreativeBrief}
                  campaignFormat={campaignFormat}
                  setCampaignFormat={setCampaignFormat}
                  selectedLanguage={selectedLanguage}
                  availableVoices={allVoices}
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
                />
              </Tab.Panel>

              <Tab.Panel>
                <MusicPanel
                  onGenerate={handleGenerateMusic}
                  isGenerating={isGeneratingMusic}
                  statusMessage={statusMessage}
                  initialPrompt={musicPrompt}
                />
              </Tab.Panel>

              <Tab.Panel>
                <MixerPanel tracks={tracks} onRemoveTrack={handleRemoveTrack} />
              </Tab.Panel>
            </Tab.Panels>
          </div>
        </Tab.Group>
      </div>
    </>
  );
}
