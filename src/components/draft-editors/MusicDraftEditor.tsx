"use client";

import { MusicPanel } from "@/components/MusicPanel";
import { VersionIterationInput } from "@/components/ui";
import type { DraftState } from "@/components/ui/DraftAccordion";
import { useDraftHeaderActions } from "@/hooks/use-draft-header-actions";
import { useDraftSaveQueue } from "@/hooks/use-draft-save-queue";
import { useSendToMixer } from "@/hooks/use-send-to-mixer";
import {
  useMusicDraftState,
  usePlaybackActions,
} from "@/hooks/useAudioPlayback";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import type { MusicPrompts, MusicProvider } from "@/types";
import type { MusicVersion, VersionId } from "@/types/versions";
import React, { useEffect, useMemo, useRef, useState } from "react";

export interface MusicDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: MusicVersion;
  onUpdate: () => void | Promise<unknown>;
  // Refs for parent to call header button actions
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  onNewBlankVersion?: () => void;
  /** Callback to notify parent of draft state changes (for badge rendering) */
  onDraftStateChange?: (state: DraftState) => void;
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
  onDraftStateChange,
}: MusicDraftEditorProps) {
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  const [musicProvider, setMusicProvider] = useState<MusicProvider>(
    draftVersion.provider,
  );
  const [musicPrompts, setMusicPrompts] = useState<MusicPrompts>(
    draftVersion.musicPrompts,
  );
  // Local copy so a prompt edit can invalidate stale audio without waiting for SWR
  const [generatedUrl, setGeneratedUrl] = useState(draftVersion.generatedUrl);
  const [statusMessage, setStatusMessage] = useState("");

  // Every write goes through `save`: in call order, and with SWR prop updates
  // ignored until its refetch lands (see useDraftSaveQueue). Prompt edits
  // PATCH on every keystroke, so ordering matters here most.
  const { save, isSaving, flush } = useDraftSaveQueue(async () => {
    await onUpdate();
  });

  // Sync local state when draftVersion prop changes (e.g., after iteration creates new draft)
  // Guarded: don't overwrite local state while an edit is being persisted to Redis
  useEffect(() => {
    if (isSaving()) return;
    setMusicProvider(draftVersion.provider);
    setMusicPrompts(draftVersion.musicPrompts);
    setGeneratedUrl(draftVersion.generatedUrl);
  }, [draftVersion, isSaving]);

  const patchDraft = (body: Partial<MusicVersion>) =>
    save(() =>
      fetch(`/api/ads/${adId}/music/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  // Use centralized audio playback store for state
  const { isGenerating, isPlaying } = useMusicDraftState(draftVersionId);
  const { setGeneratingMusic } = usePlaybackActions();

  // Duration comes from draft version (set by tool from brief, or user edit)
  const adDuration = draftVersion.duration || 30;

  // Prompt for the active provider, falling back to the flat field (LLM-generated drafts)
  const activePrompt = musicPrompts[musicProvider] || draftVersion.musicPrompt;

  // Compute draft state - uses local prompt state so the badge reacts as the user types
  const draftState = useMemo((): DraftState => {
    if (isGenerating) return "generating";
    if (!activePrompt?.trim()) return "editing";
    return generatedUrl ? "ready" : "changed";
  }, [generatedUrl, activePrompt, isGenerating]);

  // Notify parent of draft state changes
  useEffect(() => {
    onDraftStateChange?.(draftState);
  }, [draftState, onDraftStateChange]);

  // Stop playback of audio that is about to be invalidated
  const stopIfPlaying = () => {
    if (isPlaying) useAudioPlaybackStore.getState().stop();
  };

  // Persist a prompt edit to Redis. Keeps musicPrompt (flat field read by the
  // generate route, mixer and music library) in sync with the active provider's prompt.
  // Editing the prompt invalidates any audio generated from the previous prompt, so the
  // play button turns blue and regenerates instead of replaying a stale track.
  const updatePrompt = async (provider: MusicProvider, value: string) => {
    const newPrompts: MusicPrompts = { ...musicPrompts, [provider]: value };
    setMusicPrompts(newPrompts);

    const patchBody: Partial<MusicVersion> = {
      musicPrompts: newPrompts,
      musicPrompt: value,
    };

    // Only invalidate when the edit affects the provider whose audio is on screen
    if (generatedUrl && provider === musicProvider) {
      patchBody.generatedUrl = "";
      setGeneratedUrl("");
      stopIfPlaying();
    }

    try {
      await patchDraft(patchBody);
    } catch (error) {
      console.error("Failed to persist music prompt:", error);
    }
  };

  // Handle provider change - persists to Redis and clears stale audio
  const handleProviderChange = async (newProvider: MusicProvider) => {
    setMusicProvider(newProvider);

    // musicPrompt follows the newly selected provider
    const patchBody: Partial<MusicVersion> = {
      provider: newProvider,
      musicPrompt: musicPrompts[newProvider] ?? "",
    };

    // If audio exists but was generated with different provider, clear it
    // (the play button turns blue)
    if (generatedUrl && draftVersion.provider !== newProvider) {
      patchBody.generatedUrl = "";
      setGeneratedUrl("");
      stopIfPlaying();
    }

    try {
      await patchDraft(patchBody);
    } catch (error) {
      console.error("Failed to persist provider change:", error);
    }
  };

  // Generate music for draft - returns generated URL on success
  const handleGenerate = async (
    prompt: string,
    provider: MusicProvider,
    duration: number,
  ): Promise<string | null> => {
    // AI music providers require a prompt. Guard here — the single point both
    // the Generate button and smart-play ("Play") funnel through — so an empty
    // description never reaches the provider (which would surface the cryptic
    // "Generation failed: Missing required parameter: prompt").
    if (!prompt.trim()) {
      setStatusMessage("Add a music description before generating.");
      return null;
    }

    setGeneratingMusic(true);
    setStatusMessage("Generating music...");

    try {
      // Through the save queue: the route writes the generated URL and the
      // prompt onto the draft, so it's a write like any PATCH.
      const res = await save(() =>
        fetch(`/api/ads/${adId}/music/${draftVersionId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            provider,
            duration,
          }),
        }),
      );

      if (res.ok) {
        const result = await res.json();
        setStatusMessage("Music generated successfully!");
        setGeneratedUrl(result.generatedUrl);
        return result.generatedUrl; // Return URL for autoplay
      } else {
        const error = await res.json();
        setStatusMessage(
          `Generation failed: ${error.error || "Unknown error"}`,
        );
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

    let url: string | null | undefined = generatedUrl;

    // Generate if no audio exists. Use the live typed prompt (falling back to
    // the persisted one) so pressing Play right after typing works.
    if (!url) {
      url = await handleGenerate(
        activePrompt || "",
        musicProvider,
        draftVersion.duration || adDuration,
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

  const sendToMixer = useSendToMixer({
    adId,
    stream: "music",
    versionId: draftVersionId,
    onUpdate,
    flush,
  });

  const handleSendToMixer = async () => {
    const sent = await sendToMixer();
    setStatusMessage(sent ? "Music sent to mixer!" : "Failed to send to mixer");
    return sent;
  };

  useDraftHeaderActions({
    onPlayAllRef,
    onSendToMixerRef,
    onRequestChangeRef,
    playAll: handlePlayAll,
    sendToMixer: handleSendToMixer,
    requestChange: () => iterationExpandRef.current?.(),
  });

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setMusicProvider(draftVersion.provider);
  };

  // Handle custom music upload or library selection - creates NEW version (V3 immutable pattern)
  const handleTrackSelected = async (
    url: string,
    filename?: string,
    duration?: number,
  ) => {
    if (!url) return;

    try {
      // Step 1: Freeze existing draft first (same pattern as useStreamOperations)
      if (draftVersionId) {
        const freezeRes = await fetch(
          `/api/ads/${adId}/music/${draftVersionId}/freeze?forceFreeze=true`,
          { method: "POST" },
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
        throw new Error(
          errorData.error || "Failed to create custom music version",
        );
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
        musicPrompts={musicPrompts}
        onUpdatePrompt={updatePrompt}
        onTrackSelected={handleTrackSelected}
        initialProvider={draftVersion.provider}
        hasGeneratedUrl={!!generatedUrl}
        existingFilename={
          draftVersion.provider === "custom"
            ? draftVersion.musicPrompt
            : undefined
        }
      />
      <VersionIterationInput
        adId={adId}
        stream="music"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        onNewBlankVersion={onNewBlankVersion}
        disabled={!generatedUrl}
        disabledReason="Generate music before requesting changes"
        expandRef={iterationExpandRef}
      />
    </>
  );
}
