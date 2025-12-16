import { useAudioPlaybackStore, AudioSourceType } from "@/store/audioPlaybackStore";
import { useShallow } from "zustand/react/shallow";

/**
 * Check if a specific source type is currently playing
 */
export function useIsSourcePlaying(
  sourceType: AudioSourceType,
  identifier?: { trackIndex?: number; trackId?: string; versionId?: string }
): boolean {
  return useAudioPlaybackStore((state) => {
    if (!state.isPlaying || !state.currentSource) return false;
    if (state.currentSource.type !== sourceType) return false;

    if (identifier) {
      if (
        identifier.trackIndex !== undefined &&
        state.currentSource.trackIndex !== identifier.trackIndex
      ) {
        return false;
      }
      if (
        identifier.trackId !== undefined &&
        state.currentSource.trackId !== identifier.trackId
      ) {
        return false;
      }
      if (
        identifier.versionId !== undefined &&
        state.currentSource.versionId !== identifier.versionId
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Hook for VoiceDraftEditor - all voice playback state in one subscription
 */
export function useVoicePlaybackState(versionId: string) {
  return useAudioPlaybackStore(
    useShallow((state) => {
      const isVoiceSource =
        state.currentSource?.type === "voice-track" ||
        state.currentSource?.type === "voice-all";
      const matchesVersion = state.currentSource?.versionId === versionId;

      // Only show generating state if it's for THIS version
      const generatingMatchesVersion = state.generatingVoiceVersionId === versionId;

      return {
        isPlaying: state.isPlaying && isVoiceSource && matchesVersion,
        isPlayingAll:
          state.isPlayingSequence &&
          state.currentSource?.type === "voice-all" &&
          matchesVersion,
        isGenerating: state.generatingVoice && generatingMatchesVersion,
        generatingTrackIndex: generatingMatchesVersion ? state.generatingVoiceTrackIndex : null,
        playingTrackIndex:
          state.isPlaying &&
          state.currentSource?.type === "voice-track" &&
          matchesVersion
            ? (state.currentSource.trackIndex ?? null)
            : state.isPlayingSequence &&
                state.currentSource?.type === "voice-all" &&
                matchesVersion
              ? state.sequenceIndex
              : null,
      };
    })
  );
}

/**
 * Hook for DraftAccordion header - reactive play/generating state
 * This is the key fix for Issue #2 - now reactive instead of ref-based!
 */
export function useDraftAccordionState(
  type: "voice" | "music" | "sfx",
  versionId?: string
) {
  return useAudioPlaybackStore(
    useShallow((state) => {
      // For voice type, only show generating if version matches
      const isGenerating =
        type === "voice"
          ? state.generatingVoice && (!versionId || state.generatingVoiceVersionId === versionId)
          : type === "music"
            ? state.generatingMusic
            : state.generatingSfx;

      // Check if any audio from this type is playing
      const sourceTypes: AudioSourceType[] =
        type === "voice"
          ? ["voice-track", "voice-all"]
          : type === "music"
            ? ["music-library", "music-generated"]
            : ["sfx-preview"];

      const isPlaying =
        state.isPlaying &&
        state.currentSource !== null &&
        sourceTypes.includes(state.currentSource.type) &&
        (!versionId || state.currentSource.versionId === versionId);

      return { isPlaying, isGenerating };
    })
  );
}

/**
 * Hook for MixerPanel - preview playback state
 */
export function useMixerPlaybackState() {
  return useAudioPlaybackStore(
    useShallow((state) => ({
      isPlaying:
        state.isPlaying && state.currentSource?.type === "mixer-preview",
      currentTime: state.currentTime,
      duration: state.duration,
      isGenerating: state.generatingMix,
    }))
  );
}

/**
 * Hook for MusicPanel library - track preview state
 */
export function useMusicLibraryPlayback(trackId: string) {
  return useAudioPlaybackStore((state) => ({
    isPlaying:
      state.isPlaying &&
      state.currentSource?.type === "music-library" &&
      state.currentSource?.trackId === trackId,
  }));
}

/**
 * Hook for any component that just needs to know if something is playing globally
 */
export function useIsAnyPlaying() {
  return useAudioPlaybackStore((state) => state.isPlaying);
}

/**
 * Hook for MusicDraftEditor - music generation and playback state
 */
export function useMusicDraftState(versionId: string) {
  return useAudioPlaybackStore(
    useShallow((state) => ({
      isGenerating: state.generatingMusic,
      isPlaying:
        state.isPlaying &&
        state.currentSource?.type === "music-generated" &&
        state.currentSource?.versionId === versionId,
    }))
  );
}

/**
 * Hook for SfxDraftEditor - sfx generation and playback state
 */
export function useSfxDraftState(versionId: string) {
  return useAudioPlaybackStore(
    useShallow((state) => ({
      isGenerating: state.generatingSfx,
      isPlaying:
        state.isPlaying &&
        state.currentSource?.type === "sfx-preview" &&
        state.currentSource?.versionId === versionId,
    }))
  );
}

/**
 * Get playback actions without subscribing to state changes
 * Useful for event handlers
 */
export function usePlaybackActions() {
  return useAudioPlaybackStore(
    useShallow((state) => ({
      play: state.play,
      pause: state.pause,
      stop: state.stop,
      seekTo: state.seekTo,
      playSequence: state.playSequence,
      appendToSequence: state.appendToSequence,
      stopSequence: state.stopSequence,
      setGeneratingVoice: state.setGeneratingVoice,
      setGeneratingMusic: state.setGeneratingMusic,
      setGeneratingSfx: state.setGeneratingSfx,
      setGeneratingMix: state.setGeneratingMix,
    }))
  );
}
