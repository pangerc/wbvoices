"use client";

import { ScripterPanel } from "@/components/ScripterPanel";
import { VersionIterationInput } from "@/components/ui";
import type { DraftState } from "@/components/ui/DraftAccordion";
import { useDraftHeaderActions } from "@/hooks/use-draft-header-actions";
import { useDraftSaveQueue } from "@/hooks/use-draft-save-queue";
import { useSendToMixer } from "@/hooks/use-send-to-mixer";
import {
  usePlaybackActions,
  useVoicePlaybackState,
} from "@/hooks/useAudioPlayback";
import { mintSlotId } from "@/lib/mixer/mixer-reconcile";
import { generateVoiceTrack, persistTrackUrl } from "@/lib/voice-utils";
import type { Language, Provider, VoiceTrack } from "@/types";
import type {
  VersionId,
  VoiceTrackGenerationStatus,
  VoiceVersion,
} from "@/types/versions";
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Migrate old format (generatedUrls[]) to new format (voiceTracks[].generatedUrl)
 * Called once on load if legacy data detected
 */
function migrateVoiceTracks(version: VoiceVersion): VoiceTrack[] {
  const tracks = [...version.voiceTracks];

  // If we have legacy generatedUrls array, embed them into tracks
  if (version.generatedUrls?.length) {
    tracks.forEach((track, i) => {
      if (version.generatedUrls![i] && !track.generatedUrl) {
        tracks[i] = { ...track, generatedUrl: version.generatedUrls![i] };
      }
    });
  }

  return tracks;
}

export interface VoiceDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: VoiceVersion;
  onUpdate: () => void | Promise<unknown>;
  onGenerateAll?: () => void; // Callback to expose generateAudio to parent
  // Callbacks to expose playAll and sendToMixer to parent (for DraftAccordion header buttons)
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  /** @deprecated State now comes from centralized audioPlaybackStore */
  playAllState?: React.MutableRefObject<{
    isPlaying: boolean;
    isGenerating: boolean;
  } | null>;
  onNewBlankVersion?: () => void;
  /** Callback to notify parent of draft state changes (for badge rendering) */
  onDraftStateChange?: (state: DraftState) => void;
  /** Project language from the ad brief — seeds the voice catalogue when the draft has no cast voices yet */
  briefLanguage?: Language;
  /** Project voice provider from the ad brief — same fallback role as briefLanguage */
  briefProvider?: Provider;
}

export function VoiceDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onGenerateAll,
  onPlayAllRef,
  onSendToMixerRef,
  onRequestChangeRef,
  playAllState,
  onNewBlankVersion,
  onDraftStateChange,
  briefLanguage,
  briefProvider,
}: VoiceDraftEditorProps) {
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  // Migrate on load if needed
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>(() =>
    migrateVoiceTracks(draftVersion),
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Every write goes through `save`: in call order, and with SWR prop updates
  // ignored until its refetch lands (see useDraftSaveQueue).
  const { save, isSaving, flush } = useDraftSaveQueue(async () => {
    await onUpdate();
  });

  /**
   * Generates one track's audio, then persists its URL through the save
   * queue: the persist is a GET → whole-array PATCH, so it must land after
   * any text or voice edit queued before it.
   */
  const generateTrack = async (
    track: VoiceTrack,
    trackIndex: number,
    provider: Provider,
  ) => {
    const result = await generateVoiceTrack(track, {
      defaultProvider: provider,
    });

    await save(() =>
      persistTrackUrl(result.audioUrl, result.duration, {
        adId,
        versionId: draftVersionId,
        trackIndex,
      }),
    );

    return result;
  };

  // Sync local state when draftVersion prop changes (e.g., after iteration creates new draft)
  // Guarded: don't overwrite local state while an edit is being persisted to Redis
  useEffect(() => {
    if (isSaving()) return;
    setVoiceTracks(migrateVoiceTracks(draftVersion));
  }, [draftVersion, isSaving]);

  // Use centralized audio playback store - THIS IS THE KEY FIX for state sync issues!
  const {
    isPlaying,
    isPlayingAll,
    isGenerating,
    generatingTrackIndex,
    playingTrackIndex,
  } = useVoicePlaybackState(draftVersionId);
  const {
    play,
    stop,
    playSequence,
    appendToSequence,
    stopSequence,
    setGeneratingVoice,
  } = usePlaybackActions();

  // Stable language/provider state — initialized from draftVersion, then synced
  // from local voiceTracks (guarded by isSaving). Never falls back to
  // defaults on SWR revalidation noise, preventing the voice list from resetting.
  //
  // Resolution order: a voice already cast in the draft wins, then the version's
  // own knowledge context, then the ad brief. A blank version has none of the
  // first two, which is why the brief has to reach this component — otherwise a
  // new version on a Romanian project would open casting English voices.
  const contextLanguage = draftVersion.knowledgeContext?.language;
  const contextProvider = draftVersion.knowledgeContext?.voiceProvider;

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const firstTrackWithVoice = draftVersion.voiceTracks.find(
      (t) => t.voice?.language,
    );
    return (
      firstTrackWithVoice?.voice?.language ||
      contextLanguage ||
      briefLanguage ||
      "en"
    );
  });

  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    const firstTrackWithVoice = draftVersion.voiceTracks.find(
      (t) => t.voice?.provider,
    );
    return (
      firstTrackWithVoice?.voice?.provider ||
      contextProvider ||
      briefProvider ||
      "elevenlabs"
    );
  });

  // Sync language/provider from local voiceTracks state (already guarded by isSaving),
  // falling back through the same chain as the initializer. The brief loads
  // asynchronously and arrives after mount, so it has to be a dependency here —
  // the initializer alone would miss it. Only update when something actually
  // resolves; never fall back to the hardcoded defaults.
  useEffect(() => {
    const lang =
      voiceTracks.find((t) => t.voice?.language)?.voice?.language ||
      contextLanguage ||
      briefLanguage;
    if (lang) setSelectedLanguage(lang);
    const prov =
      voiceTracks.find((t) => t.voice?.provider)?.voice?.provider ||
      contextProvider ||
      briefProvider;
    if (prov) setSelectedProvider(prov);
  }, [
    voiceTracks,
    contextLanguage,
    contextProvider,
    briefLanguage,
    briefProvider,
  ]);

  // These remain as defaults since they're not stored per-version
  const [selectedRegion] = useState<string | null>(null);
  const [selectedAccent] = useState("neutral");
  const [campaignFormat] = useState("audio");

  // Track generation status for each voice track (uses embedded generatedUrl)
  const trackGenerationStatus = useMemo<VoiceTrackGenerationStatus[]>(() => {
    return voiceTracks.map((track, index) => ({
      index,
      hasAudio: !!track.generatedUrl,
      isGenerating: generatingTrackIndex === index,
      isPlaying: playingTrackIndex === index,
    }));
  }, [voiceTracks, generatingTrackIndex, playingTrackIndex]);

  // Compute draft state from LOCAL state (not SWR props) for immediate badge feedback
  const draftState = useMemo((): DraftState => {
    if (isGenerating) return "generating";
    const tracksWithContent = voiceTracks.filter(
      (t) => t.voice && t.text?.trim(),
    );
    if (tracksWithContent.length === 0) return "editing";
    return tracksWithContent.every((t) => !!t.generatedUrl)
      ? "ready"
      : "changed";
  }, [voiceTracks, isGenerating]);

  // Notify parent of draft state changes
  useEffect(() => {
    onDraftStateChange?.(draftState);
  }, [draftState, onDraftStateChange]);

  // Expose generateAudio function to parent via callback
  useEffect(() => {
    if (onGenerateAll) {
      // Create a wrapper that triggers generation with default provider
      const triggerGeneration = () => {
        void generateAudio(selectedProvider as Provider);
      };
      // Store the function reference on the callback

      (onGenerateAll as any).trigger = triggerGeneration;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGenerateAll, selectedProvider]);

  // Update voice track locally and persist to backend
  // Invalidates embedded generatedUrl if content-affecting fields changed
  const updateVoiceTrack = async (
    index: number,
    updates: Partial<VoiceTrack>,
  ) => {
    const newTracks = [...voiceTracks];

    // Check if content-affecting fields changed
    const contentFields = [
      "text",
      "voice",
      "voiceInstructions",
      "speed",
      "trackProvider",
      "postProcessingSpeedup",
      "postProcessingPitch",
      "targetDuration",
      "dialectId",
      "performanceId",
    ];
    const contentChanged = contentFields.some((field) => field in updates);

    // If content changed and track has URL, invalidate it
    // Use null (not undefined) so JSON.stringify preserves it in the PATCH body
    if (contentChanged && newTracks[index].generatedUrl) {
      newTracks[index] = {
        ...newTracks[index],
        ...updates,
        generatedUrl: null,
      };
    } else {
      newTracks[index] = { ...newTracks[index], ...updates };
    }

    setVoiceTracks(newTracks);

    // Persist to backend (voiceTracks now includes embedded URLs)
    try {
      await save(() =>
        fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceTracks: newTracks }),
        }),
      );
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
        // Stable mixer slot from birth: PATCH replaces voiceTracks wholesale,
        // so a slotId only survives if the client copy carries it.
        slotId: mintSlotId(),
      },
    ];
    setVoiceTracks(newTracks);

    // Persist to backend
    try {
      await save(() =>
        fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceTracks: newTracks }),
        }),
      );
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
      await save(() =>
        fetch(`/api/ads/${adId}/voices/${draftVersionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceTracks: newTracks }),
        }),
      );
    } catch (error) {
      console.error("Failed to remove voice track:", error);
    }
  };

  // Smart play handler: toggle play/stop, or generate + play if no URL
  // Now uses centralized audioPlaybackStore for state management
  const handlePlay = async (index: number) => {
    // If this track is already playing, stop it
    if (playingTrackIndex === index) {
      stop();
      return;
    }

    const track = voiceTracks[index];

    if (!track.voice || !track.text.trim()) {
      setStatusMessage("Select a voice and enter text first.");
      return;
    }

    // If URL exists in track, just play it (guaranteed fresh due to invalidate-on-edit)
    if (track.generatedUrl) {
      play({
        type: "voice-track",
        url: track.generatedUrl,
        trackIndex: index,
        versionId: draftVersionId,
      });
      return;
    }

    // No URL - generate, persist, play
    setGeneratingVoice(true, index, draftVersionId);
    setStatusMessage(`Generating track ${index + 1}...`);

    try {
      const result = await generateTrack(
        track,
        index,
        selectedProvider as Provider,
      );

      // Update local state with embedded URL
      setVoiceTracks((tracks) => {
        const updated = [...tracks];
        updated[index] = { ...updated[index], generatedUrl: result.audioUrl };
        return updated;
      });

      setStatusMessage(`Track ${index + 1} ready!`);

      // Play via centralized store
      play({
        type: "voice-track",
        url: result.audioUrl,
        trackIndex: index,
        versionId: draftVersionId,
      });
    } catch (error) {
      console.error("Failed to generate track:", error);
      setStatusMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setGeneratingVoice(false);
    }
  };

  // Generate audio for draft (all tracks or remaining tracks)
  // Returns the updated tracks array for immediate use (avoids stale state issues)
  // Now uses centralized audioPlaybackStore for generation state
  const generateAudio = async (
    provider?: Provider,
    tracks?: VoiceTrack[],
  ): Promise<VoiceTrack[]> => {
    setGeneratingVoice(true, null, draftVersionId);

    // Determine which tracks to generate (use current voiceTracks state)
    const tracksToGenerate = tracks || voiceTracks;
    const indicesToGenerate: number[] = [];

    // Check if we have any existing audio (from embedded generatedUrl)
    const hasAnyAudio = tracksToGenerate.some((t) => !!t.generatedUrl);

    // If some tracks have audio, only generate missing ones ("Generate Remaining" mode)
    if (hasAnyAudio) {
      tracksToGenerate.forEach((track, index) => {
        if (!track.generatedUrl && track.voice && track.text.trim()) {
          indicesToGenerate.push(index);
        }
      });

      if (indicesToGenerate.length === 0) {
        setStatusMessage("All tracks already have audio!");
        setGeneratingVoice(false);
        return voiceTracks;
      }

      setStatusMessage(
        `Generating ${indicesToGenerate.length} remaining track(s)...`,
      );
    } else {
      // Generate all tracks that have voice and text
      tracksToGenerate.forEach((track, index) => {
        if (track.voice && track.text.trim()) {
          indicesToGenerate.push(index);
        }
      });
      setStatusMessage(
        `Generating ${indicesToGenerate.length} voice track(s)...`,
      );
    }

    const effectiveProvider = (provider || selectedProvider) as Provider;
    const updatedTracks = [...voiceTracks];
    let successCount = 0;
    let failCount = 0;

    // Generate each track sequentially using voice-utils
    for (const index of indicesToGenerate) {
      const track = tracksToGenerate[index];
      setGeneratingVoice(true, index, draftVersionId); // Show spinner on this track via centralized store
      setStatusMessage(
        `Generating track ${index + 1}/${indicesToGenerate.length}...`,
      );

      try {
        const result = await generateTrack(track, index, effectiveProvider);

        // Update track with embedded URL
        updatedTracks[index] = {
          ...updatedTracks[index],
          generatedUrl: result.audioUrl,
        };
        setVoiceTracks([...updatedTracks]); // Update state immediately so UI turns green
        successCount++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to generate track ${index}:`, error);
        // Show specific error immediately, not just count
        setStatusMessage(`Track ${index + 1} failed: ${errorMsg}`);
        failCount++;
      }
    }

    setVoiceTracks(updatedTracks);

    if (failCount > 0) {
      setStatusMessage(
        `Generated ${successCount}/${indicesToGenerate.length} tracks (${failCount} failed)`,
      );
    } else {
      setStatusMessage(
        `All ${successCount} voice tracks generated successfully!`,
      );
    }

    setGeneratingVoice(false); // Clear generation state

    return updatedTracks; // Return for caller to use immediately
  };

  // Smart header play: if all tracks have audio, play all; otherwise generate missing and play immediately
  // Each track starts playing as soon as it's generated (while next generates in parallel)
  const handlePlayAll = async () => {
    // If already playing all, stop using the centralized store
    if (isPlayingAll) {
      stopSequence();
      return;
    }

    // Check which tracks need generation
    const tracksNeedingAudio = voiceTracks.filter(
      (t) => t.voice && t.text.trim() && !t.generatedUrl,
    );

    // If all tracks have audio, just play them all
    if (tracksNeedingAudio.length === 0) {
      const urls = voiceTracks
        .filter((t) => t.generatedUrl)
        .map((t) => t.generatedUrl!);
      if (urls.length > 0) {
        playSequence(urls, {
          type: "voice-all",
          versionId: draftVersionId,
        });
      }
      return;
    }

    // Need to generate some tracks - do it inline with auto-play
    const effectiveProvider = selectedProvider as Provider;
    const updatedTracks = [...voiceTracks];
    let playbackStarted = false;

    for (let i = 0; i < voiceTracks.length; i++) {
      const track = voiceTracks[i];

      // If track already has audio, add to sequence
      if (track.generatedUrl) {
        if (!playbackStarted) {
          // Start sequence with first URL
          playSequence([track.generatedUrl], {
            type: "voice-all",
            versionId: draftVersionId,
          });
          playbackStarted = true;
        } else {
          // Append to growing sequence
          appendToSequence(track.generatedUrl);
        }
        continue;
      }

      // Skip if no voice/text
      if (!track.voice || !track.text.trim()) continue;

      // Generate this track
      setGeneratingVoice(true, i, draftVersionId);
      setStatusMessage(`Generating track ${i + 1}...`);

      try {
        const result = await generateTrack(track, i, effectiveProvider);

        // Update local state so UI turns green
        updatedTracks[i] = {
          ...updatedTracks[i],
          generatedUrl: result.audioUrl,
        };
        setVoiceTracks([...updatedTracks]);

        // Add to playback sequence
        if (!playbackStarted) {
          // Start sequence with first URL
          playSequence([result.audioUrl], {
            type: "voice-all",
            versionId: draftVersionId,
          });
          playbackStarted = true;
        } else {
          // Append to growing sequence
          appendToSequence(result.audioUrl);
        }
      } catch (error) {
        console.error(`Failed to generate track ${i}:`, error);
      }
    }

    setGeneratingVoice(false);
    setStatusMessage("All tracks generated!");
  };

  const sendToMixer = useSendToMixer({
    adId,
    stream: "voices",
    versionId: draftVersionId,
    onUpdate,
    flush,
  });

  const handleSendToMixer = async () => {
    const sent = await sendToMixer();
    setStatusMessage(
      sent ? "Voices sent to mixer!" : "Failed to send to mixer",
    );
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

  // Backwards compat: playAllState is deprecated — state now comes from the
  // centralized audioPlaybackStore — but legacy consumers may still read it.
  useEffect(() => {
    if (playAllState) {
      playAllState.current = { isPlaying: isPlayingAll, isGenerating };
    }
  }, [playAllState, isPlayingAll, isGenerating]);

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setVoiceTracks(draftVersion.voiceTracks);
  };

  // Compute button text based on audio status (from embedded generatedUrl)
  const getGenerateButtonText = (): string => {
    const tracksWithAudio = voiceTracks.filter((t) => !!t.generatedUrl).length;
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
    <>
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
        // Per-track play (generate if needed)
        onPlay={handlePlay}
        trackGenerationStatus={trackGenerationStatus}
        generateButtonText={getGenerateButtonText()}
      />
      <VersionIterationInput
        adId={adId}
        stream="voices"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        onNewBlankVersion={onNewBlankVersion}
        disabled={!voiceTracks.every((t) => !!t.generatedUrl)}
        disabledReason="Generate all voice tracks before requesting changes"
        expandRef={iterationExpandRef}
      />
    </>
  );
}
