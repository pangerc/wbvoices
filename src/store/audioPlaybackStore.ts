import { create } from "zustand";

// ============ Types ============

export type AudioSourceType =
  | "mixer-preview" // Mixed preview from MixerPanel
  | "voice-track" // Single voice track preview
  | "voice-all" // Sequential playback of all voice tracks
  | "music-library" // Music library preview
  | "music-generated" // Generated music preview
  | "sfx-preview" // Sound effect preview
  | "final-preview"; // SpotifyPreview component

export type AudioSource = {
  type: AudioSourceType;
  url: string;
  trackIndex?: number; // For voice tracks
  trackId?: string; // For music/sfx tracks
  versionId?: string; // For version-scoped sources
};

type AudioPlaybackState = {
  // Core playback state
  isPlaying: boolean;
  currentSource: AudioSource | null;
  currentTime: number;
  duration: number;

  // Centralized generation state
  generatingVoice: boolean;
  generatingVoiceTrackIndex: number | null;
  generatingMusic: boolean;
  generatingSfx: boolean;
  generatingMix: boolean;

  // Sequential playback support
  isPlayingSequence: boolean;
  sequenceIndex: number;
  sequenceUrls: string[];
  sequenceBaseSource: Omit<AudioSource, "url"> | null;

  // Actions
  play: (source: AudioSource) => void;
  pause: () => void;
  stop: () => void;
  seekTo: (time: number) => void;

  // Generation state setters
  setGeneratingVoice: (generating: boolean, trackIndex?: number | null) => void;
  setGeneratingMusic: (generating: boolean) => void;
  setGeneratingSfx: (generating: boolean) => void;
  setGeneratingMix: (generating: boolean) => void;

  // Sequential playback
  playSequence: (urls: string[], baseSource: Omit<AudioSource, "url">) => void;
  stopSequence: () => void;

  // Internal (called by audio element events)
  _onTimeUpdate: (time: number) => void;
  _onDurationChange: (duration: number) => void;
  _onEnded: () => void;
  _onError: () => void;
};

// ============ Singleton Audio Element ============

let audioElement: HTMLAudioElement | null = null;

const getOrCreateAudioElement = (): HTMLAudioElement => {
  if (typeof window === "undefined") {
    throw new Error("Audio can only be used in browser");
  }

  if (!audioElement) {
    audioElement = new Audio();

    // Wire up event listeners once
    audioElement.addEventListener("timeupdate", () => {
      useAudioPlaybackStore.getState()._onTimeUpdate(audioElement!.currentTime);
    });

    audioElement.addEventListener("durationchange", () => {
      useAudioPlaybackStore.getState()._onDurationChange(audioElement!.duration);
    });

    audioElement.addEventListener("ended", () => {
      useAudioPlaybackStore.getState()._onEnded();
    });

    audioElement.addEventListener("error", () => {
      useAudioPlaybackStore.getState()._onError();
    });
  }

  return audioElement;
};

// ============ Store ============

export const useAudioPlaybackStore = create<AudioPlaybackState>((set, get) => ({
  // Initial state
  isPlaying: false,
  currentSource: null,
  currentTime: 0,
  duration: 0,

  generatingVoice: false,
  generatingVoiceTrackIndex: null,
  generatingMusic: false,
  generatingSfx: false,
  generatingMix: false,

  isPlayingSequence: false,
  sequenceIndex: 0,
  sequenceUrls: [],
  sequenceBaseSource: null,

  // Play action - stops current, starts new
  play: (source) => {
    const audio = getOrCreateAudioElement();
    const { currentSource, isPlaying } = get();

    // If exact same source is playing, treat as toggle (pause)
    if (
      isPlaying &&
      currentSource?.type === source.type &&
      currentSource?.url === source.url &&
      currentSource?.trackIndex === source.trackIndex
    ) {
      audio.pause();
      set({ isPlaying: false });
      return;
    }

    // Stop current and start new
    audio.pause();
    audio.src = source.url;
    audio.currentTime = 0;

    set({
      currentSource: source,
      currentTime: 0,
      duration: 0, // Will be set by durationchange event
      // Clear any sequence state when playing single track
      isPlayingSequence: false,
      sequenceIndex: 0,
      sequenceUrls: [],
      sequenceBaseSource: null,
    });

    audio
      .play()
      .then(() => set({ isPlaying: true }))
      .catch((err) => {
        console.error("Playback failed:", err);
        set({ isPlaying: false, currentSource: null });
      });
  },

  pause: () => {
    const audio = getOrCreateAudioElement();
    audio.pause();
    set({ isPlaying: false });
  },

  stop: () => {
    const audio = getOrCreateAudioElement();
    audio.pause();
    audio.currentTime = 0;
    audio.src = ""; // Clear source

    set({
      isPlaying: false,
      currentSource: null,
      currentTime: 0,
      duration: 0,
      isPlayingSequence: false,
      sequenceIndex: 0,
      sequenceUrls: [],
      sequenceBaseSource: null,
    });
  },

  seekTo: (time) => {
    const audio = getOrCreateAudioElement();
    if (audio.src) {
      audio.currentTime = time;
      set({ currentTime: time });
    }
  },

  // Generation state setters
  setGeneratingVoice: (generating, trackIndex = null) =>
    set({
      generatingVoice: generating,
      generatingVoiceTrackIndex: generating ? trackIndex : null,
    }),
  setGeneratingMusic: (generating) => set({ generatingMusic: generating }),
  setGeneratingSfx: (generating) => set({ generatingSfx: generating }),
  setGeneratingMix: (generating) => set({ generatingMix: generating }),

  // Sequential playback
  playSequence: (urls, baseSource) => {
    if (urls.length === 0) return;

    set({
      isPlayingSequence: true,
      sequenceIndex: 0,
      sequenceUrls: urls,
      sequenceBaseSource: baseSource,
    });

    // Start first track
    get().play({ ...baseSource, url: urls[0] } as AudioSource);
    // Re-set sequence state after play() clears it
    set({
      isPlayingSequence: true,
      sequenceIndex: 0,
      sequenceUrls: urls,
      sequenceBaseSource: baseSource,
    });
  },

  stopSequence: () => {
    get().stop();
  },

  // Internal event handlers
  _onTimeUpdate: (time) => {
    set({ currentTime: time });
  },

  _onDurationChange: (duration) => {
    if (duration && !isNaN(duration) && isFinite(duration)) {
      set({ duration });
    }
  },

  _onEnded: () => {
    const { isPlayingSequence, sequenceIndex, sequenceUrls, sequenceBaseSource } =
      get();

    if (isPlayingSequence && sequenceIndex < sequenceUrls.length - 1) {
      // Play next in sequence
      const nextIndex = sequenceIndex + 1;
      const audio = getOrCreateAudioElement();
      audio.src = sequenceUrls[nextIndex];

      set({
        sequenceIndex: nextIndex,
        currentSource: sequenceBaseSource
          ? { ...sequenceBaseSource, url: sequenceUrls[nextIndex], trackIndex: nextIndex }
          : null,
        currentTime: 0,
      });

      audio.play().catch(console.error);
    } else {
      // Sequence complete or single track ended
      set({
        isPlaying: false,
        currentSource: null,
        currentTime: 0,
        isPlayingSequence: false,
        sequenceIndex: 0,
        sequenceUrls: [],
        sequenceBaseSource: null,
      });
    }
  },

  _onError: () => {
    console.error("Audio playback error");
    set({
      isPlaying: false,
      currentSource: null,
      isPlayingSequence: false,
    });
  },
}));
