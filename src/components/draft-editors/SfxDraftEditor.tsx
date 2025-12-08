"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { SoundFxPanel } from "@/components/SoundFxPanel";
import type { SfxVersion, VoiceVersion, VersionId } from "@/types/versions";
import type { SoundFxPrompt } from "@/types";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useSfxDraftState, usePlaybackActions } from "@/hooks/useAudioPlayback";
import { VersionIterationInput } from "@/components/ui";
import type { useStreamOperations } from "@/hooks/useStreamOperations";

export interface SfxDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: SfxVersion;
  onUpdate: () => void;
  // Refs for parent to call header button actions
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => void) | null>;
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  onNewBlankVersion?: () => void;
  // Voice stream data for SFX placement options (after voice X)
  voiceStream?: ReturnType<typeof useStreamOperations>;
}

export function SfxDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onPlayAllRef,
  onSendToMixerRef,
  onRequestChangeRef,
  onNewBlankVersion,
  voiceStream,
}: SfxDraftEditorProps) {
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  const [soundFxPrompts, setSoundFxPrompts] = useState<SoundFxPrompt[]>(
    draftVersion.soundFxPrompts
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Sync local state when draftVersion prop changes (e.g., after iteration creates new draft)
  useEffect(() => {
    setSoundFxPrompts(draftVersion.soundFxPrompts);
  }, [draftVersion]);

  // Use centralized audio playback store for state
  const { isGenerating, isPlaying } = useSfxDraftState(draftVersionId);
  const { setGeneratingSfx } = usePlaybackActions();

  // Compute voice track previews for SFX placement options (after voice X)
  // IMPORTANT: Must use ACTIVE voice version (not draft) because mixer rebuilder
  // positions SFX tracks relative to the active voice version's tracks.
  const voiceTrackPreviews = useMemo(() => {
    if (!voiceStream?.data) return [];

    // Use ACTIVE voice version - must match what mixer rebuilder uses
    const activeVersion = voiceStream.data.active
      ? voiceStream.data.versionsData[voiceStream.data.active] as VoiceVersion
      : null;

    if (!activeVersion?.voiceTracks) return [];
    return activeVersion.voiceTracks.map(t => ({
      name: t.voice?.name || "Voice",
      text: t.text || ""
    }));
  }, [voiceStream?.data]);

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
        playAfter: undefined, // Let placement intent determine position
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

  // Generate sound effects for draft - returns generated URLs on success
  const handleGenerate = async (): Promise<string[] | null> => {
    setGeneratingSfx(true);
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
        const result = await res.json();
        setStatusMessage("Sound effects generated successfully!");
        onUpdate(); // Reload the stream
        return result.generatedUrls; // Return URLs for autoplay
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
        return null;
      }
    } catch (error) {
      console.error("Failed to generate sound effects:", error);
      setStatusMessage("Generation failed. Please try again.");
      return null;
    } finally {
      setGeneratingSfx(false);
    }
  };

  // Smart play: generate if needed, then play all SFX sequentially
  const handlePlayAll = async () => {
    const { playSequence, stopSequence } = useAudioPlaybackStore.getState();

    // If already playing, stop
    if (isPlaying) {
      stopSequence();
      return;
    }

    let urls = draftVersion.generatedUrls?.filter(Boolean) || [];

    // Generate if no audio exists
    if (urls.length === 0) {
      const generatedUrls = await handleGenerate();
      if (!generatedUrls || generatedUrls.length === 0) return; // Generation failed
      urls = generatedUrls;
    }

    // Play all SFX sequentially
    playSequence(urls, {
      type: "sfx-preview",
      versionId: draftVersionId,
    });
  };

  // Send generated SFX to mixer via freeze API
  // Uses the same flow as versions - Redis is source of truth
  const handleSendToMixer = async () => {
    try {
      const res = await fetch(`/api/ads/${adId}/sfx/${draftVersionId}/freeze`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("SFX freeze failed:", errorData);
        setStatusMessage("Failed to send to mixer");
        return;
      }

      const { mixer } = await res.json();

      // Invalidate SWR cache - hydration will update mixer
      const { mutate: globalMutate } = await import("swr");
      await globalMutate(`/api/ads/${adId}/mixer`, mixer, false);

      // Refresh SFX stream data so activeVersionId updates immediately
      onUpdate();

      setStatusMessage("SFX sent to mixer!");
    } catch (error) {
      console.error("Failed to send SFX to mixer:", error);
      setStatusMessage("Failed to send to mixer");
    }
  };

  // Expose functions to parent via refs
  useEffect(() => {
    if (onPlayAllRef) onPlayAllRef.current = handlePlayAll;
    if (onSendToMixerRef) onSendToMixerRef.current = handleSendToMixer;
    if (onRequestChangeRef) onRequestChangeRef.current = () => iterationExpandRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundFxPrompts, draftVersion, isPlaying, draftVersionId]);

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setSoundFxPrompts(draftVersion.soundFxPrompts);
  };

  return (
    <>
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
        voiceTrackPreviews={voiceTrackPreviews}
      />
      <VersionIterationInput
        adId={adId}
        stream="sfx"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        onNewBlankVersion={onNewBlankVersion}
        disabled={!draftVersion.generatedUrls?.length || draftVersion.generatedUrls.filter(Boolean).length < soundFxPrompts.length}
        disabledReason="Generate all sound effects before requesting changes"
        expandRef={iterationExpandRef}
      />
    </>
  );
}
