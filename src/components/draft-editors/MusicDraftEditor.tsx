"use client";

import React, { useState } from "react";
import { MusicPanel } from "@/components/MusicPanel";
import type { MusicVersion, VersionId } from "@/types/versions";
import type { MusicProvider } from "@/types";

export interface MusicDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: MusicVersion;
  onUpdate: () => void;
}

export function MusicDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
}: MusicDraftEditorProps) {
  const [musicProvider, setMusicProvider] = useState<MusicProvider>(
    draftVersion.provider
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Default ad duration (TODO: get from actual ad)
  const adDuration = 30;

  // Generate music for draft
  const handleGenerate = async (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ) => {
    setIsGenerating(true);
    setStatusMessage("Generating music...");

    try {
      const res = await fetch(
        `/api/ads/${adId}/music/${draftVersionId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            provider,
            duration,
          }),
        }
      );

      if (res.ok) {
        setStatusMessage("Music generated successfully!");
        onUpdate(); // Reload the stream
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to generate music:", error);
      setStatusMessage("Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setMusicProvider(draftVersion.provider);
  };

  return (
    <MusicPanel
      onGenerate={handleGenerate}
      isGenerating={isGenerating}
      statusMessage={statusMessage}
      adDuration={adDuration}
      musicProvider={musicProvider}
      setMusicProvider={setMusicProvider}
      resetForm={resetForm}
    />
  );
}
