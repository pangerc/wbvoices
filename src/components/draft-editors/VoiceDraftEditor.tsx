"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { ScripterPanel } from "@/components/ScripterPanel";
import type { VoiceVersion, VersionId, VoiceTrackGenerationStatus } from "@/types/versions";
import type { VoiceTrack, Provider } from "@/types";
import { generateAndPersistTrack } from "@/lib/voice-utils";
import { useMixerStore } from "@/store/mixerStore";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useVoicePlaybackState, usePlaybackActions } from "@/hooks/useAudioPlayback";
import { VersionIterationInput } from "@/components/ui";

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
  onUpdate: () => void;
  onGenerateAll?: () => void; // Callback to expose generateAudio to parent
  // Callbacks to expose playAll and sendToMixer to parent (for DraftAccordion header buttons)
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => void) | null>;
  /** @deprecated State now comes from centralized audioPlaybackStore */
  playAllState?: React.MutableRefObject<{ isPlaying: boolean; isGenerating: boolean } | null>;
}

export function VoiceDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onGenerateAll,
  onPlayAllRef,
  onSendToMixerRef,
  playAllState,
}: VoiceDraftEditorProps) {
  // Migrate on load if needed
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>(() =>
    migrateVoiceTracks(draftVersion)
  );
  const [statusMessage, setStatusMessage] = useState("");

  // Use centralized audio playback store - THIS IS THE KEY FIX for state sync issues!
  const { isPlaying, isPlayingAll, isGenerating, generatingTrackIndex, playingTrackIndex } =
    useVoicePlaybackState(draftVersionId);
  const { play, stop, playSequence, stopSequence, setGeneratingVoice } = usePlaybackActions();

  // Infer language and provider from existing voice tracks
  // This ensures ScripterPanel loads the correct voices for this version
  const selectedLanguage = useMemo(() => {
    const firstTrackWithVoice = draftVersion.voiceTracks.find(t => t.voice?.language);
    return firstTrackWithVoice?.voice?.language || "en";
  }, [draftVersion.voiceTracks]);

  const selectedProvider = useMemo(() => {
    const firstTrackWithVoice = draftVersion.voiceTracks.find(t => t.voice?.provider);
    return firstTrackWithVoice?.voice?.provider || "elevenlabs";
  }, [draftVersion.voiceTracks]);

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
  // Invalidates embedded generatedUrl if content-affecting fields changed
  const updateVoiceTrack = async (
    index: number,
    updates: Partial<VoiceTrack>
  ) => {
    const newTracks = [...voiceTracks];

    // Check if content-affecting fields changed
    const contentFields = ['text', 'voice', 'voiceInstructions', 'speed'];
    const contentChanged = contentFields.some(field => field in updates);

    // If content changed and track has URL, invalidate it
    if (contentChanged && newTracks[index].generatedUrl) {
      newTracks[index] = { ...newTracks[index], ...updates, generatedUrl: undefined };
    } else {
      newTracks[index] = { ...newTracks[index], ...updates };
    }

    setVoiceTracks(newTracks);

    // Persist to backend (voiceTracks now includes embedded URLs)
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
    setGeneratingVoice(true, index);
    setStatusMessage(`Generating track ${index + 1}...`);

    try {
      const result = await generateAndPersistTrack(
        track,
        { adId, versionId: draftVersionId, trackIndex: index },
        { defaultProvider: selectedProvider as Provider }
      );

      // Update local state with embedded URL
      setVoiceTracks(tracks => {
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

      onUpdate(); // Refresh parent state
    } catch (error) {
      console.error("Failed to generate track:", error);
      setStatusMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
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
    tracks?: VoiceTrack[]
  ): Promise<VoiceTrack[]> => {
    setGeneratingVoice(true);

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

      setStatusMessage(`Generating ${indicesToGenerate.length} remaining track(s)...`);
    } else {
      // Generate all tracks that have voice and text
      tracksToGenerate.forEach((track, index) => {
        if (track.voice && track.text.trim()) {
          indicesToGenerate.push(index);
        }
      });
      setStatusMessage(`Generating ${indicesToGenerate.length} voice track(s)...`);
    }

    const effectiveProvider = (provider || selectedProvider) as Provider;
    const updatedTracks = [...voiceTracks];
    let successCount = 0;
    let failCount = 0;

    // Generate each track sequentially using voice-utils
    for (const index of indicesToGenerate) {
      const track = tracksToGenerate[index];
      setGeneratingVoice(true, index); // Show spinner on this track via centralized store
      setStatusMessage(`Generating track ${index + 1}/${indicesToGenerate.length}...`);

      try {
        const result = await generateAndPersistTrack(
          track,
          { adId, versionId: draftVersionId, trackIndex: index },
          { defaultProvider: effectiveProvider }
        );

        // Update track with embedded URL
        updatedTracks[index] = { ...updatedTracks[index], generatedUrl: result.audioUrl };
        successCount++;
      } catch (error) {
        console.error(`Failed to generate track ${index}:`, error);
        failCount++;
      }
    }

    setVoiceTracks(updatedTracks);

    if (failCount > 0) {
      setStatusMessage(`Generated ${successCount}/${indicesToGenerate.length} tracks (${failCount} failed)`);
    } else {
      setStatusMessage(`All ${successCount} voice tracks generated successfully!`);
    }

    onUpdate(); // Reload the stream
    setGeneratingVoice(false); // Clear generation state

    return updatedTracks; // Return for caller to use immediately
  };

  // Smart header play: if all tracks have audio, play all; otherwise generate missing then play
  // Now uses centralized audioPlaybackStore's playSequence for state sync
  const handlePlayAll = async () => {
    // If already playing all, stop using the centralized store
    if (isPlayingAll) {
      stopSequence();
      return;
    }

    // Check which tracks need generation
    const tracksNeedingAudio = voiceTracks.filter(
      (t) => t.voice && t.text.trim() && !t.generatedUrl
    );

    // Use current tracks or generate missing ones (returns updated tracks to avoid stale state)
    let tracksToPlay = voiceTracks;
    if (tracksNeedingAudio.length > 0) {
      tracksToPlay = await generateAudio(selectedProvider as Provider);
    }

    // Collect all URLs for sequential playback
    const urls = tracksToPlay
      .filter((t) => t.generatedUrl)
      .map((t) => t.generatedUrl!);

    if (urls.length > 0) {
      // Play all sequentially using centralized store
      playSequence(urls, {
        type: "voice-all",
        versionId: draftVersionId,
      });
    }
  };

  // Send voice tracks to the mixer (clears existing voice tracks, adds new ones)
  const handleSendToMixer = () => {
    const { clearTracks, addTrack } = useMixerStore.getState();

    // Clear existing voice tracks from mixer
    clearTracks("voice");

    // Convert and add each track that has generated audio
    voiceTracks.forEach((track, index) => {
      if (track.generatedUrl && track.voice) {
        addTrack({
          id: `voice-${draftVersionId}-${index}`,
          url: track.generatedUrl,
          label: track.voice.name || `Voice ${index + 1}`,
          type: "voice",
          playAfter: index === 0 ? "start" : "previous",
          overlap: track.overlap || 0,
          metadata: {
            voiceId: track.voice.id,
            voiceProvider: track.voice.provider,
            scriptText: track.text,
          },
        });
      }
    });

    setStatusMessage("Voices sent to mixer!");
  };

  // Expose handlePlayAll and handleSendToMixer to parent via refs
  // Note: playAllState ref is deprecated - state now comes from centralized audioPlaybackStore
  useEffect(() => {
    if (onPlayAllRef) {
      onPlayAllRef.current = handlePlayAll;
    }
    if (onSendToMixerRef) {
      onSendToMixerRef.current = handleSendToMixer;
    }
    // Backwards compat: still update ref for any legacy consumers, but prefer using the hook
    if (playAllState) {
      playAllState.current = { isPlaying: isPlayingAll, isGenerating };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPlayAllRef, onSendToMixerRef, playAllState, isPlayingAll, isGenerating]);

  // Reset form (not used in draft mode)
  const resetForm = () => {
    setVoiceTracks(draftVersion.voiceTracks);
  };

  // Compute button text based on audio status (from embedded generatedUrl)
  const getGenerateButtonText = (): string => {
    const tracksWithAudio = voiceTracks.filter(t => !!t.generatedUrl).length;
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
        disabled={!voiceTracks.every(t => !!t.generatedUrl)}
        onActivateDraft={async () => {
          const res = await fetch(`/api/ads/${adId}/voices/${draftVersionId}/activate`, {
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
