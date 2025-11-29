"use client";

import React, { useState, useEffect } from "react";
import { MusicPanel } from "@/components/MusicPanel";
import type { MusicVersion, VersionId } from "@/types/versions";
import type { MusicProvider } from "@/types";
import { useMixerStore } from "@/store/mixerStore";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useMusicDraftState, usePlaybackActions } from "@/hooks/useAudioPlayback";
import { VersionIterationInput } from "@/components/ui";

export interface MusicDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: MusicVersion;
  onUpdate: () => void;
  // Refs for parent to call header button actions
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => void) | null>;
}

export function MusicDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onPlayAllRef,
  onSendToMixerRef,
}: MusicDraftEditorProps) {
  const [musicProvider, setMusicProvider] = useState<MusicProvider>(
    draftVersion.provider
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Use centralized audio playback store for state
  const { isGenerating, isPlaying } = useMusicDraftState(draftVersionId);
  const { setGeneratingMusic } = usePlaybackActions();

  // Default ad duration (TODO: get from actual ad)
  const adDuration = 30;

  // Handle provider change - persists to Redis and clears stale audio
  const handleProviderChange = async (newProvider: MusicProvider) => {
    setMusicProvider(newProvider);

    // Persist provider to Redis
    try {
      await fetch(`/api/ads/${adId}/music/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider }),
      });

      // If audio exists but was generated with different provider, clear it
      if (draftVersion.generatedUrl && draftVersion.provider !== newProvider) {
        await fetch(`/api/ads/${adId}/music/${draftVersionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generatedUrl: "" }),
        });
        onUpdate(); // Refresh to show cleared state (button turns blue)
      }
    } catch (error) {
      console.error("Failed to persist provider change:", error);
    }
  };

  // Generate music for draft - returns generated URL on success
  const handleGenerate = async (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ): Promise<string | null> => {
    setGeneratingMusic(true);
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
        const result = await res.json();
        setStatusMessage("Music generated successfully!");
        onUpdate(); // Reload the stream
        return result.generatedUrl; // Return URL for autoplay
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
        return null;
      }
    } catch (error) {
      console.error("Failed to generate music:", error);
      setStatusMessage("Generation failed. Please try again.");
      return null;
    } finally {
      setGeneratingMusic(false);
    }
  };

  // Smart play: generate if needed, then play
  const handlePlayAll = async () => {
    const { play, stop } = useAudioPlaybackStore.getState();

    // If already playing this version, stop
    if (isPlaying) {
      stop();
      return;
    }

    let url: string | null | undefined = draftVersion.generatedUrl;

    // Generate if no audio exists
    if (!url) {
      url = await handleGenerate(
        draftVersion.musicPrompt || "",
        musicProvider,
        draftVersion.duration || adDuration
      );
      if (!url) return; // Generation failed
    }

    // Play audio (whether existing or just generated)
    play({
      type: "music-generated",
      url,
      versionId: draftVersionId,
    });
  };

  // Send generated music to mixer
  const handleSendToMixer = () => {
    const { clearTracks, addTrack } = useMixerStore.getState();
    clearTracks("music");

    if (draftVersion.generatedUrl) {
      addTrack({
        id: `music-${draftVersionId}`,
        url: draftVersion.generatedUrl,
        label: `Generated Music (${draftVersion.provider})`,
        type: "music",
        metadata: {
          source: draftVersion.provider, // Store provider in source field
          promptText: draftVersion.musicPrompt,
          originalDuration: draftVersion.duration,
        },
      });
    }
  };

  // Expose functions to parent via refs
  useEffect(() => {
    if (onPlayAllRef) onPlayAllRef.current = handlePlayAll;
    if (onSendToMixerRef) onSendToMixerRef.current = handleSendToMixer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftVersion, musicProvider, isPlaying]);

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setMusicProvider(draftVersion.provider);
  };

  return (
    <>
      <MusicPanel
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        statusMessage={statusMessage}
        adDuration={adDuration}
        musicProvider={musicProvider}
        setMusicProvider={handleProviderChange}
        resetForm={resetForm}
        initialPrompts={draftVersion.musicPrompts}
      />
      <VersionIterationInput
        adId={adId}
        stream="music"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        disabled={!draftVersion.generatedUrl}
        onActivateDraft={async () => {
          const res = await fetch(`/api/ads/${adId}/music/${draftVersionId}/activate`, {
            method: "POST",
          });
          if (!res.ok) {
            throw new Error(`Failed to activate: ${res.status}`);
          }
          await onUpdate(); // Refresh stream to show frozen version in VersionAccordion
        }}
      />
    </>
  );
}
