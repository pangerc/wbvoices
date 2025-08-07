"use client";

import React, { useState, useEffect } from "react";
import { CampaignFormat, SoundFxPrompt } from "@/types";
import {
  BriefPanel,
  ScripterPanel,
  NewMixerPanel,
  MusicPanel,
  SoundFxPanel,
} from "@/components";
import { Header } from "@/components/Header";
import { useMixerStore } from "@/store/mixerStore";
import { useVoiceManager } from "@/hooks/useVoiceManager";
import { useFormManager } from "@/hooks/useFormManager";
import { AudioService } from "@/services/audioService";

export default function DemoTTS() {
  // UI State
  const [selectedTab, setSelectedTab] = useState(0);
  
  // Brief Panel State
  const [clientDescription, setClientDescription] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>("dialog");
  const [adDuration, setAdDuration] = useState(20);

  // Custom hooks for complex logic
  const voiceManager = useVoiceManager();
  const formManager = useFormManager();
  
  // Zustand store
  const { tracks } = useMixerStore();

  // Reset logic when language/provider changes
  useEffect(() => {
    formManager.resetVoiceTracks();
  }, [voiceManager.selectedLanguage, voiceManager.selectedProvider]);

  // Switch to mixer tab when tracks are generated
  useEffect(() => {
    if (tracks.length > 0) {
      setSelectedTab(4);
    }
  }, [tracks.length]);


  // Event Handlers
  const handleStartOver = () => {
    formManager.resetAllForms();
    const { clearTracks } = useMixerStore.getState();
    clearTracks();
    setSelectedTab(0);
  };

  const handleTabChange = (index: number) => {
    formManager.setStatusMessage("");
    setSelectedTab(index);
  };

  const handleGenerateCreative = (
    segments: Array<{ voiceId: string; text: string }>,
    prompt: string,
    soundFxPrompts?: string | string[] | SoundFxPrompt[]
  ) => {
    // Map voice segments to tracks
    const filteredVoices = voiceManager.getFilteredVoices();
    const newVoiceTracks = AudioService.mapVoiceSegmentsToTracks(
      segments,
      filteredVoices,
      voiceManager.allVoices
    );

    // Update state
    formManager.resetVoiceTracks();
    formManager.resetSoundFxPrompt();
    formManager.setVoiceTracks(newVoiceTracks);
    formManager.setMusicPrompt(prompt);

    // Handle sound FX prompts
    if (soundFxPrompts) {
      if (Array.isArray(soundFxPrompts) && soundFxPrompts.length > 0) {
        const firstPrompt = soundFxPrompts[0];
        if (typeof firstPrompt === "object" && "description" in firstPrompt) {
          formManager.setSoundFxPrompt(firstPrompt as SoundFxPrompt);
        } else if (typeof firstPrompt === "string") {
          formManager.setSoundFxPrompt({
            description: firstPrompt,
            duration: 5,
          });
        }
      } else if (typeof soundFxPrompts === "string") {
        formManager.setSoundFxPrompt({
          description: soundFxPrompts,
          duration: 5,
        });
      }
    }

    setSelectedTab(1); // Switch to scripter
  };

  const handleGenerateVoices = async () => {
    try {
      await AudioService.generateVoiceAudio(
        formManager.voiceTracks,
        voiceManager.selectedProvider,
        formManager.setStatusMessage,
        formManager.setIsGenerating
      );

      setSelectedTab(4); // Switch to mixer
    } catch (error) {
      console.error(error);
      formManager.setStatusMessage(
        error instanceof Error ? error.message : "An error occurred"
      );
    }
  };

  const handleGenerateMusic = async (
    prompt: string,
    provider: "loudly" | "beatoven",
    duration: number
  ) => {
    try {
      await AudioService.generateMusic(
        prompt,
        provider,
        duration,
        formManager.setStatusMessage,
        formManager.setIsGeneratingMusic
      );

      setSelectedTab(4); // Switch to mixer
    } catch (error) {
      console.error("Failed to generate music:", error);
      formManager.setStatusMessage(
        `Failed to generate music: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const handleGenerateSoundFx = async (prompt: string, duration: number) => {
    try {
      await AudioService.generateSoundEffect(
        prompt,
        duration,
        formManager.soundFxPrompt,
        formManager.setStatusMessage,
        formManager.setIsGeneratingSoundFx
      );

      setSelectedTab(4); // Switch to mixer
    } catch (error) {
      console.error("Failed to generate sound effect:", error);
      formManager.setStatusMessage(
        `Failed to generate sound effect: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white text-black">
      <Header
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        onStartOver={handleStartOver}
      />

      <div className="flex flex-col flex-1 bg-black relative">
        {/* Background image */}
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            backgroundImage: "url(/bg-pixels.svg)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "left top",
            backgroundSize: "auto 100%",
            width: "100%",
            height: "100%",
            zIndex: 0,
          }}
        ></div>

        {/* Tab panels */}
        <div className="flex-1 overflow-hidden container mx-auto relative z-10">
          {selectedTab === 0 && (
            <BriefPanel
              clientDescription={clientDescription}
              setClientDescription={setClientDescription}
              creativeBrief={creativeBrief}
              setCreativeBrief={setCreativeBrief}
              campaignFormat={campaignFormat}
              setCampaignFormat={setCampaignFormat}
              selectedLanguage={voiceManager.selectedLanguage}
              setSelectedLanguage={voiceManager.setSelectedLanguage}
              selectedProvider={voiceManager.selectedProvider}
              setSelectedProvider={voiceManager.setSelectedProvider}
              availableLanguages={voiceManager.availableLanguages}
              getFilteredVoices={voiceManager.getFilteredVoices}
              adDuration={adDuration}
              setAdDuration={setAdDuration}
              selectedAccent={voiceManager.selectedAccent}
              setSelectedAccent={voiceManager.setSelectedAccent}
              onGenerateCreative={handleGenerateCreative}
            />
          )}

          {selectedTab === 1 && (
            <ScripterPanel
              voiceTracks={formManager.voiceTracks}
              updateVoiceTrack={formManager.updateVoiceTrack}
              addVoiceTrack={formManager.addVoiceTrack}
              generateAudio={handleGenerateVoices}
              isGenerating={formManager.isGenerating}
              statusMessage={formManager.statusMessage}
              selectedLanguage={voiceManager.selectedLanguage}
              getFilteredVoices={voiceManager.getFilteredVoices}
              resetForm={formManager.resetVoiceTracks}
            />
          )}

          {selectedTab === 2 && (
            <MusicPanel
              onGenerate={handleGenerateMusic}
              isGenerating={formManager.isGeneratingMusic}
              statusMessage={formManager.statusMessage}
              initialPrompt={formManager.musicPrompt}
              adDuration={adDuration}
              resetForm={formManager.resetMusicPrompt}
            />
          )}

          {selectedTab === 3 && (
            <SoundFxPanel
              onGenerate={handleGenerateSoundFx}
              isGenerating={formManager.isGeneratingSoundFx}
              statusMessage={formManager.statusMessage}
              initialPrompt={formManager.soundFxPrompt}
              adDuration={adDuration}
              resetForm={formManager.resetSoundFxPrompt}
            />
          )}

          {selectedTab === 4 && (
            <NewMixerPanel
              resetForm={formManager.resetAllForms}
              isGeneratingVoice={formManager.isGenerating}
              isGeneratingMusic={formManager.isGeneratingMusic}
              isGeneratingSoundFx={formManager.isGeneratingSoundFx}
            />
          )}
        </div>
      </div>
    </div>
  );
}