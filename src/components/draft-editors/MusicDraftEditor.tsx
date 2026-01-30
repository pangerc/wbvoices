"use client";

import React, { useState, useEffect, useRef } from "react";
import { MusicPanel } from "@/components/MusicPanel";
import type { MusicVersion, VersionId } from "@/types/versions";
import type { MusicProvider } from "@/types";
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
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  onNewBlankVersion?: () => void;
}

export function MusicDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onPlayAllRef,
  onSendToMixerRef,
  onRequestChangeRef,
  onNewBlankVersion,
}: MusicDraftEditorProps) {
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  const [musicProvider, setMusicProvider] = useState<MusicProvider>(
    draftVersion.provider
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Sync local state when draftVersion prop changes (e.g., after iteration creates new draft)
  useEffect(() => {
    setMusicProvider(draftVersion.provider);
  }, [draftVersion]);

  // Use centralized audio playback store for state
  const { isGenerating, isPlaying } = useMusicDraftState(draftVersionId);
  const { setGeneratingMusic } = usePlaybackActions();

  // Duration comes from draft version (set by tool from brief, or user edit)
  const adDuration = draftVersion.duration || 30;

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

  // Send generated music to mixer via freeze API
  // Uses the same flow as versions - Redis is source of truth
  const handleSendToMixer = async () => {
    try {
      const res = await fetch(`/api/ads/${adId}/music/${draftVersionId}/freeze`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Music freeze failed:", errorData);
        setStatusMessage("Failed to send to mixer");
        return;
      }

      const { mixer } = await res.json();

      // Invalidate SWR cache - hydration will update mixer
      const { mutate: globalMutate } = await import("swr");
      await globalMutate(`/api/ads/${adId}/mixer`, mixer, false);

      // Refresh music stream data so activeVersionId updates immediately
      onUpdate();

      setStatusMessage("Music sent to mixer!");
    } catch (error) {
      console.error("Failed to send music to mixer:", error);
      setStatusMessage("Failed to send to mixer");
    }
  };

  // Expose functions to parent via refs
  useEffect(() => {
    if (onPlayAllRef) onPlayAllRef.current = handlePlayAll;
    if (onSendToMixerRef) onSendToMixerRef.current = handleSendToMixer;
    if (onRequestChangeRef) onRequestChangeRef.current = () => iterationExpandRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftVersion, musicProvider, isPlaying, draftVersionId]);

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setMusicProvider(draftVersion.provider);
  };

  // Handle custom music upload or library selection - creates NEW version (V3 immutable pattern)
  const handleTrackSelected = async (url: string, filename?: string, duration?: number) => {
    if (!url) return;

    try {
      // Step 1: Freeze existing draft first (same pattern as useStreamOperations)
      if (draftVersionId) {
        const freezeRes = await fetch(
          `/api/ads/${adId}/music/${draftVersionId}/freeze?forceFreeze=true`,
          { method: "POST" }
        );
        if (!freezeRes.ok) {
          console.warn("Failed to freeze existing draft, continuing anyway");
          // Continue - new version will become the draft regardless
        }
      }

      // Step 2: Create new version (V3 immutable pattern)
      const res = await fetch(`/api/ads/${adId}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          musicPrompt: filename || "Custom track",
          musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
          duration: duration || 30,
          provider: "custom",
          createdBy: "user",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create custom music version");
      }

      const { versionId } = await res.json();

      // Step 3: PATCH the URL onto the new version
      const patchRes = await fetch(`/api/ads/${adId}/music/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedUrl: url }),
      });

      if (!patchRes.ok) {
        console.error("Failed to patch URL onto new version");
        setStatusMessage("Upload partially failed. Please try again.");
        return;
      }

      // Step 4: Refresh UI - only after all steps succeed
      onUpdate();
      setStatusMessage("Custom music track added!");
    } catch (error) {
      console.error("Failed to create custom music version:", error);
      setStatusMessage("Upload failed. Please try again.");
    }
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
        onTrackSelected={handleTrackSelected}
        initialProvider={draftVersion.provider}
        hasGeneratedUrl={!!draftVersion.generatedUrl}
        existingFilename={draftVersion.provider === "custom" ? draftVersion.musicPrompt : undefined}
      />
      <VersionIterationInput
        adId={adId}
        stream="music"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        onNewBlankVersion={onNewBlankVersion}
        disabled={!draftVersion.generatedUrl}
        disabledReason="Generate music before requesting changes"
        expandRef={iterationExpandRef}
      />
    </>
  );
}
