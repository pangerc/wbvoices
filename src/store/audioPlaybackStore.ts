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
  generatingCreative: boolean; // LLM is creating drafts
  generatingVoice: boolean;
  generatingVoiceTrackIndex: number | null;
  generatingVoiceVersionId: string | null; // Which version is generating
  generatingMusic: boolean;
  generatingSfx: boolean;
  generatingSfxVersionId: string | null; // Which SFX version is generating
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
  setGeneratingCreative: (generating: boolean) => void;
  setGeneratingVoice: (generating: boolean, trackIndex?: number | null, versionId?: string | null) => void;
  setGeneratingMusic: (generating: boolean) => void;
  setGeneratingSfx: (generating: boolean, versionId?: string | null) => void;
  setGeneratingMix: (generating: boolean) => void;

  // Sequential playback
  playSequence: (urls: string[], baseSource: Omit<AudioSource, "url">) => void;
  appendToSequence: (url: string) => void; // Add track to playing sequence (or start if not playing)
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

  generatingCreative: false,
  generatingVoice: false,
  generatingVoiceTrackIndex: null,
  generatingVoiceVersionId: null,
  generatingMusic: false,
  generatingSfx: false,
  generatingSfxVersionId: null,
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
    // Note: Don't set audio.src = "" as it triggers a browser error event

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
  setGeneratingCreative: (generating) => set({ generatingCreative: generating }),
  setGeneratingVoice: (generating, trackIndex = null, versionId = null) =>
    set({
      generatingVoice: generating,
      generatingVoiceTrackIndex: generating ? trackIndex : null,
      generatingVoiceVersionId: generating ? versionId : null,
    }),
  setGeneratingMusic: (generating) => set({ generatingMusic: generating }),
  setGeneratingSfx: (generating, versionId = null) =>
    set({
      generatingSfx: generating,
      generatingSfxVersionId: generating ? versionId : null,
    }),
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

  // Append a URL to an active sequence (or start sequence if not playing)
  appendToSequence: (url) => {
    const { isPlayingSequence, sequenceUrls, sequenceBaseSource } = get();

    if (isPlayingSequence) {
      // Add to existing sequence
      set({ sequenceUrls: [...sequenceUrls, url] });
    } else if (sequenceBaseSource) {
      // We have base source from a previous sequence setup, restart with this URL
      get().playSequence([url], sequenceBaseSource);
    }
    // If no base source, caller should use playSequence first
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
        isPlaying: true, // Keep playback state active for sequence continuation
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
        // Keep sequenceBaseSource - appendToSequence may need it for late arrivals
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
