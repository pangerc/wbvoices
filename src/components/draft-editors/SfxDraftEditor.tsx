"use client";

import React, { useState } from "react";
import { SoundFxPanel } from "@/components/SoundFxPanel";
import type { SfxVersion, VersionId } from "@/types/versions";
import type { SoundFxPrompt } from "@/types";

export interface SfxDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: SfxVersion;
  onUpdate: () => void;
}

export function SfxDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
}: SfxDraftEditorProps) {
  const [soundFxPrompts, setSoundFxPrompts] = useState<SoundFxPrompt[]>(
    draftVersion.soundFxPrompts
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Default ad duration (TODO: get from actual ad)
  const adDuration = 30;

  // Update sound fx prompt and persist to backend
  const updatePrompt = async (
    index: number,
    updates: Partial<SoundFxPrompt>
  ) => {
    const newPrompts = [...soundFxPrompts];
    newPrompts[index] = { ...newPrompts[index], ...updates };
    setSoundFxPrompts(newPrompts);

    // Persist to backend via PATCH
    try {
      await fetch(`/api/ads/${adId}/sfx/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundFxPrompts: newPrompts }),
      });
    } catch (error) {
      console.error("Failed to update sfx draft:", error);
    }
  };

  // Add new sound fx prompt
  const addPrompt = async () => {
    const newPrompts = [
      ...soundFxPrompts,
      {
        description: "",
        duration: 3,
        placement: { type: "end" as const },
        playAfter: "start",
        overlap: 0,
      },
    ];
    setSoundFxPrompts(newPrompts);

    // Persist to backend
    try {
      await fetch(`/api/ads/${adId}/sfx/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundFxPrompts: newPrompts }),
      });
    } catch (error) {
      console.error("Failed to add sfx prompt:", error);
    }
  };

  // Remove sound fx prompt
  const removePrompt = async (index: number) => {
    const newPrompts = soundFxPrompts.filter((_, i) => i !== index);
    setSoundFxPrompts(newPrompts);

    // Persist to backend
    try {
      await fetch(`/api/ads/${adId}/sfx/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundFxPrompts: newPrompts }),
      });
    } catch (error) {
      console.error("Failed to remove sfx prompt:", error);
    }
  };

  // Generate sound effects for draft
  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatusMessage("Generating sound effects...");

    try {
      const res = await fetch(`/api/ads/${adId}/sfx/${draftVersionId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soundFxPrompts,
        }),
      });

      if (res.ok) {
        setStatusMessage("Sound effects generated successfully!");
        onUpdate(); // Reload the stream
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to generate sound effects:", error);
      setStatusMessage("Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setSoundFxPrompts(draftVersion.soundFxPrompts);
  };

  return (
    <SoundFxPanel
      onGenerate={handleGenerate}
      isGenerating={isGenerating}
      statusMessage={statusMessage}
      soundFxPrompts={soundFxPrompts}
      onUpdatePrompt={updatePrompt}
      onRemovePrompt={removePrompt}
      onAddPrompt={addPrompt}
      adDuration={adDuration}
      resetForm={resetForm}
    />
  );
}
