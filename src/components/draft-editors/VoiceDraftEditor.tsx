"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ScripterPanel } from "@/components/ScripterPanel";
import type { VoiceVersion, VersionId, VoiceTrackGenerationStatus } from "@/types/versions";
import type { VoiceTrack, Provider } from "@/types";

export interface VoiceDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: VoiceVersion;
  onUpdate: () => void;
  onGenerateAll?: () => void; // Callback to expose generateAudio to parent
}

export function VoiceDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onGenerateAll,
}: VoiceDraftEditorProps) {
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>(
    draftVersion.voiceTracks
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTrackIndex, setGeneratingTrackIndex] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [generatedUrls, setGeneratedUrls] = useState<string[]>(
    draftVersion.generatedUrls || []
  );

  // Configuration defaults (TODO: make these configurable)
  const [selectedLanguage] = useState("en");
  const [selectedProvider] = useState("elevenlabs");
  const [selectedRegion] = useState<string | null>(null);
  const [selectedAccent] = useState("neutral");
  const [campaignFormat] = useState("audio");

  // Track generation status for each voice track
  const trackGenerationStatus = useMemo<VoiceTrackGenerationStatus[]>(() => {
    return voiceTracks.map((_, index) => ({
      index,
      hasAudio: !!generatedUrls[index],
      isGenerating: generatingTrackIndex === index,
    }));
  }, [voiceTracks, generatedUrls, generatingTrackIndex]);

  // Expose generateAudio function to parent via callback
  useEffect(() => {
    if (onGenerateAll) {
      // Create a wrapper that triggers generation with default provider
      const triggerGeneration = () => {
        void generateAudio(selectedProvider as Provider);
      };
      // Store the function reference on the callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (onGenerateAll as any).trigger = triggerGeneration;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGenerateAll, selectedProvider]);

  // Update voice track locally and persist to backend
  const updateVoiceTrack = async (
    index: number,
    updates: Partial<VoiceTrack>
  ) => {
    const newTracks = [...voiceTracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setVoiceTracks(newTracks);

    // Persist to backend via PATCH
    try {
      await fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceTracks: newTracks }),
      });
    } catch (error) {
      console.error("Failed to update voice draft:", error);
    }
  };

  // Add new voice track
  const addVoiceTrack = async () => {
    const newTracks = [
      ...voiceTracks,
      {
        text: "",
        voice: null,
        playAfter: voiceTracks.length > 0 ? "previous" : "start",
        overlap: 0,
      },
    ];
    setVoiceTracks(newTracks);

    // Persist to backend
    try {
      await fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceTracks: newTracks }),
      });
    } catch (error) {
      console.error("Failed to add voice track:", error);
    }
  };

  // Remove voice track
  const removeVoiceTrack = async (index: number) => {
    const newTracks = voiceTracks.filter((_, i) => i !== index);
    setVoiceTracks(newTracks);

    // Persist to backend
    try {
      await fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceTracks: newTracks }),
      });
    } catch (error) {
      console.error("Failed to remove voice track:", error);
    }
  };

  // Generate audio for a single track
  const generateSingleTrack = async (index: number) => {
    setGeneratingTrackIndex(index);
    setStatusMessage(`Generating track ${index + 1}...`);

    try {
      const res = await fetch(
        `/api/ads/${adId}/voices/${draftVersionId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: selectedProvider,
            voiceTracks,
            trackIndices: [index], // Generate only this track
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setGeneratedUrls(data.generatedUrls);
        setStatusMessage(`Track ${index + 1} generated successfully!`);
        onUpdate(); // Reload the stream
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to generate track:", error);
      setStatusMessage("Generation failed. Please try again.");
    } finally {
      setGeneratingTrackIndex(null);
    }
  };

  // Generate audio for draft (all tracks or remaining tracks)
  const generateAudio = async (
    provider?: Provider,
    tracks?: VoiceTrack[]
  ) => {
    setIsGenerating(true);

    // Determine which tracks to generate
    const tracksToGenerate = tracks || voiceTracks;
    const missingIndices: number[] = [];

    // Check if we have any existing audio
    const hasAnyAudio = generatedUrls.some((url) => !!url);

    // If some tracks have audio, only generate missing ones ("Generate Remaining" mode)
    if (hasAnyAudio) {
      tracksToGenerate.forEach((_, index) => {
        if (!generatedUrls[index]) {
          missingIndices.push(index);
        }
      });

      if (missingIndices.length === 0) {
        setStatusMessage("All tracks already have audio!");
        setIsGenerating(false);
        return;
      }

      setStatusMessage(`Generating ${missingIndices.length} remaining track(s)...`);
    } else {
      setStatusMessage("Generating all voice tracks...");
    }

    try {
      const res = await fetch(
        `/api/ads/${adId}/voices/${draftVersionId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: provider || selectedProvider,
            voiceTracks: tracksToGenerate,
            ...(missingIndices.length > 0 && { trackIndices: missingIndices }),
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setGeneratedUrls(data.generatedUrls);
        setStatusMessage(data.message || "Voice audio generated successfully!");
        onUpdate(); // Reload the stream
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to generate voice audio:", error);
      setStatusMessage("Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setVoiceTracks(draftVersion.voiceTracks);
  };

  // Compute button text based on audio status
  const getGenerateButtonText = (): string => {
    const tracksWithAudio = generatedUrls.filter(url => !!url).length;
    const totalTracks = voiceTracks.length;

    if (tracksWithAudio === 0) {
      return "Generate All";
    } else if (tracksWithAudio < totalTracks) {
      return "Generate Remaining";
    } else {
      return "Regenerate All";
    }
  };

  return (
    <ScripterPanel
        voiceTracks={voiceTracks}
        updateVoiceTrack={updateVoiceTrack}
        addVoiceTrack={addVoiceTrack}
        removeVoiceTrack={removeVoiceTrack}
        generateAudio={generateAudio}
        isGenerating={isGenerating}
        statusMessage={statusMessage}
        selectedLanguage={selectedLanguage}
        selectedProvider={selectedProvider}
        selectedRegion={selectedRegion}
        selectedAccent={selectedAccent}
        campaignFormat={campaignFormat}
        hasRegions={false}
        resetForm={resetForm}
        // Per-track generation props
        onGenerateTrack={generateSingleTrack}
        trackGenerationStatus={trackGenerationStatus}
        generateButtonText={getGenerateButtonText()}
      />
  );
}
