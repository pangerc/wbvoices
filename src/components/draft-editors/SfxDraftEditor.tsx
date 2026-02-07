"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { SoundFxPanel } from "@/components/SoundFxPanel";
import type { SfxVersion, VoiceVersion, VersionId } from "@/types/versions";
import type { SoundFxPrompt } from "@/types";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useSfxDraftState, usePlaybackActions } from "@/hooks/useAudioPlayback";
import { VersionIterationInput } from "@/components/ui";
import type { DraftState } from "@/components/ui/DraftAccordion";
import type { useStreamOperations } from "@/hooks/useStreamOperations";

export interface SfxDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: SfxVersion;
  onUpdate: () => Promise<SfxVersion | undefined>;
  // Refs for parent to call header button actions
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => void) | null>;
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  onNewBlankVersion?: () => void;
  // Voice stream data for SFX placement options (after voice X)
  voiceStream?: ReturnType<typeof useStreamOperations>;
  /** Ad duration in seconds (from brief/mixer) for slider max */
  adDuration?: number;
  /** Callback to notify parent of draft state changes (for badge rendering) */
  onDraftStateChange?: (state: DraftState) => void;
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
  adDuration: adDurationProp,
  onDraftStateChange,
}: SfxDraftEditorProps) {
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  const [soundFxPrompts, setSoundFxPrompts] = useState<SoundFxPrompt[]>(
    draftVersion.soundFxPrompts
  );
  const [generatedUrls, setGeneratedUrls] = useState<(string | null)[]>(
    draftVersion.generatedUrls || []
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Guard: prevent SWR prop updates from overwriting local state while an edit is being persisted
  const editInFlightRef = useRef(false);

  // Sync local state when draftVersion prop changes (e.g., after iteration creates new draft)
  // Guarded: don't overwrite local state while an edit is being persisted to Redis
  useEffect(() => {
    if (editInFlightRef.current) return;
    setSoundFxPrompts(draftVersion.soundFxPrompts);
    setGeneratedUrls(draftVersion.generatedUrls || []);
  }, [draftVersion]);

  // Use centralized audio playback store for state
  const { isGenerating, isPlaying, generatingPromptIndex } = useSfxDraftState(draftVersionId);
  const { play, setGeneratingSfx } = usePlaybackActions();

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

  const adDuration = adDurationProp || 30;

  // Compute draft state from LOCAL state (not SWR props) for immediate badge feedback
  const draftState = useMemo((): DraftState => {
    if (isGenerating) return 'generating';
    const promptsWithContent = soundFxPrompts.filter(p => p.description?.trim());
    if (promptsWithContent.length === 0) return 'editing';
    return promptsWithContent.every((_, i) => !!generatedUrls[i]) ? 'ready' : 'changed';
  }, [soundFxPrompts, generatedUrls, isGenerating]);

  // Notify parent of draft state changes
  useEffect(() => {
    onDraftStateChange?.(draftState);
  }, [draftState, onDraftStateChange]);

  // Update sound fx prompt and persist to backend
  // Invalidates generated URL if content-affecting fields changed
  const updatePrompt = async (
    index: number,
    updates: Partial<SoundFxPrompt>
  ) => {
    editInFlightRef.current = true;
    const newPrompts = [...soundFxPrompts];
    newPrompts[index] = { ...newPrompts[index], ...updates };
    setSoundFxPrompts(newPrompts);

    // Check if content-affecting fields changed
    const contentFields = ['description', 'duration', 'placement'];
    const contentChanged = contentFields.some(field => field in updates);

    // Build the patch body
    const patchBody: { soundFxPrompts: SoundFxPrompt[]; generatedUrls?: (string | null)[] } = {
      soundFxPrompts: newPrompts,
    };

    // If content changed and this index has a generated URL, invalidate it
    // Use local generatedUrls state (not stale draftVersion prop)
    if (contentChanged && generatedUrls[index]) {
      const newUrls: (string | null)[] = [...generatedUrls];
      newUrls[index] = null;
      patchBody.generatedUrls = newUrls;
      setGeneratedUrls(newUrls); // Update local state immediately
      console.log(`[SfxDraftEditor] Invalidating generated URL for prompt ${index} due to content change`);
    }

    // Persist to backend via PATCH
    try {
      await fetch(`/api/ads/${adId}/sfx/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      onUpdate(); // Sync SWR cache with Redis
    } catch (error) {
      console.error("Failed to update sfx draft:", error);
    } finally {
      editInFlightRef.current = false;
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
      onUpdate();
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
      onUpdate();
    } catch (error) {
      console.error("Failed to remove sfx prompt:", error);
    }
  };

  // Generate sound effects for draft - returns generated URLs on success
  const handleGenerate = async (): Promise<string[] | null> => {
    setGeneratingSfx(true, draftVersionId);
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
        setGeneratedUrls(result.generatedUrls); // Update local state immediately
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

  // Per-prompt play: generate single prompt if needed, then play it
  const handlePlayPrompt = async (index: number) => {
    const prompt = soundFxPrompts[index];
    if (!prompt?.description?.trim()) {
      setStatusMessage("Enter a description first.");
      return;
    }

    // If URL exists, just play it
    if (generatedUrls[index]) {
      play({
        type: "sfx-preview",
        url: generatedUrls[index]!,
        trackIndex: index,
        versionId: draftVersionId,
      });
      return;
    }

    // No URL — generate this one prompt, then play
    setGeneratingSfx(true, draftVersionId, index);
    setStatusMessage(`Generating sound effect ${index + 1}...`);

    try {
      const res = await fetch(`/api/ads/${adId}/sfx/${draftVersionId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundFxPrompts, promptIndex: index }),
      });

      if (res.ok) {
        const result = await res.json();
        setGeneratedUrls(result.generatedUrls);
        setStatusMessage(`Sound effect ${index + 1} ready!`);
        onUpdate();

        const url = result.generatedUrls[index];
        if (url) {
          play({
            type: "sfx-preview",
            url,
            trackIndex: index,
            versionId: draftVersionId,
          });
        }
      } else {
        const error = await res.json();
        setStatusMessage(`Generation failed: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to generate sound effect:", error);
      setStatusMessage("Generation failed. Please try again.");
    } finally {
      setGeneratingSfx(false);
    }
  };

  // Smart play: generate if needed, then play all SFX sequentially
  // V3 architecture: Redis is source of truth - fetch fresh data before deciding
  const handlePlayAll = async () => {
    const { playSequence, stopSequence } = useAudioPlaybackStore.getState();

    // If already playing, stop
    if (isPlaying) {
      stopSequence();
      return;
    }

    // Show loading immediately for responsive feedback
    setGeneratingSfx(true, draftVersionId);

    // Fetch fresh data from Redis via SWR to avoid stale prop issues
    const freshVersion = await onUpdate();
    const freshUrls = freshVersion?.generatedUrls || [];
    const promptCount = freshVersion?.soundFxPrompts.length || 0;

    // Check that ALL prompts have corresponding URLs (using fresh data)
    const allPromptsHaveUrls = promptCount > 0 &&
      freshUrls.filter(Boolean).length >= promptCount;

    // Generate if any prompt is missing audio
    if (!allPromptsHaveUrls) {
      const generatedUrls = await handleGenerate();
      if (!generatedUrls || generatedUrls.length === 0) return; // Generation failed
      playSequence(generatedUrls, {
        type: "sfx-preview",
        versionId: draftVersionId,
      });
      return;
    }

    // Clear loading state - we're just playing, not generating
    setGeneratingSfx(false);

    // Play all SFX sequentially
    playSequence(freshUrls.filter(Boolean) as string[], {
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
        onPlayPrompt={handlePlayPrompt}
        generatingPromptIndex={generatingPromptIndex}
        generatedUrls={generatedUrls}
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
