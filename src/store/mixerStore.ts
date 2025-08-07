import { create } from "zustand";
import { LegacyTimelineCalculator } from "@/services/legacyTimelineCalculator";

// Timeline calculation: Using battle-tested heuristic approach

// Unified Track type for the mixer
export type MixerTrack = {
  id: string;
  url: string;
  label: string;
  type: "voice" | "music" | "soundfx";
  // Timing properties
  startTime?: number;
  duration?: number;
  playAfter?: string;
  overlap?: number;
  // Volume control
  volume?: number;
  // Concurrent speech grouping
  concurrentGroup?: string;
  isConcurrent?: boolean;
  // Optional metadata to preserve provider-specific information
  metadata?: {
    voiceId?: string;
    voiceProvider?: string;
    scriptText?: string;
    promptText?: string;
    originalDuration?: number;
    // Add support for explicit timing in metadata
    startTime?: number;
    endTime?: number;
  };
  // UI state
  isLoading?: boolean;
};

// Calculate timing for tracks based on relationships
type CalculatedTrack = MixerTrack & {
  actualStartTime: number;
  actualDuration: number;
};

// Default volume levels for different track types
const getDefaultVolume = (type: "voice" | "music" | "soundfx"): number => {
  switch (type) {
    case "voice":
      return 1.0; // 100%
    case "music":
      return 0.3; // 30%
    case "soundfx":
      return 0.7; // 70%
    default:
      return 1.0;
  }
};

// State definition
type MixerState = {
  // Track data
  tracks: MixerTrack[];
  calculatedTracks: CalculatedTrack[];
  totalDuration: number;
  trackVolumes: { [key: string]: number };
  loadingStates: { [key: string]: boolean };
  audioErrors: { [key: string]: boolean };
  audioDurations: { [key: string]: number };
  isExporting: boolean;
  previewUrl: string | null;

  // Actions
  addTrack: (track: MixerTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<MixerTrack>) => void;
  setTrackVolume: (id: string, volume: number) => void;
  setTrackLoading: (id: string, isLoading: boolean) => void;
  setTrackError: (id: string, hasError: boolean) => void;
  setAudioDuration: (id: string, duration: number) => void;
  calculateTimings: () => void;
  setPreviewUrl: (url: string | null) => void;
  setIsExporting: (isExporting: boolean) => void;
  clearTracks: (type?: "voice" | "music" | "soundfx") => void;
};

export const useMixerStore = create<MixerState>((set, get) => ({
  // Initial state
  tracks: [],
  calculatedTracks: [],
  totalDuration: 0,
  trackVolumes: {},
  loadingStates: {},
  audioErrors: {},
  isExporting: false,
  previewUrl: null,
  audioDurations: {},

  // Actions
  addTrack: (track) => {
    const { tracks, trackVolumes } = get();

    // Ensure the track has an ID
    const newTrack = {
      ...track,
      id:
        track.id ||
        `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };

    // Set default volume if not provided
    if (!trackVolumes[newTrack.id]) {
      set((state) => ({
        trackVolumes: {
          ...state.trackVolumes,
          [newTrack.id]: newTrack.volume || getDefaultVolume(newTrack.type),
        },
        loadingStates: {
          ...state.loadingStates,
          [newTrack.id]: true,
        },
      }));
    }

    set({ tracks: [...tracks, newTrack] });

    // Recalculate timings
    get().calculateTimings();
  },

  removeTrack: (id) => {
    const { tracks } = get();
    set({ tracks: tracks.filter((track) => track.id !== id) });

    // Recalculate timings
    get().calculateTimings();
  },

  updateTrack: (id, updates) => {
    const { tracks } = get();
    set({
      tracks: tracks.map((track) =>
        track.id === id ? { ...track, ...updates } : track
      ),
    });

    // Recalculate timings if timing-related properties changed
    if (
      "startTime" in updates ||
      "duration" in updates ||
      "playAfter" in updates ||
      "overlap" in updates ||
      "isConcurrent" in updates ||
      "concurrentGroup" in updates
    ) {
      get().calculateTimings();
    }
  },

  setTrackVolume: (id, volume) => {
    set((state) => ({
      trackVolumes: {
        ...state.trackVolumes,
        [id]: volume,
      },
    }));
  },

  setTrackLoading: (id, isLoading) => {
    set((state) => ({
      loadingStates: {
        ...state.loadingStates,
        [id]: isLoading,
      },
    }));
  },

  setTrackError: (id, hasError) => {
    set((state) => ({
      audioErrors: {
        ...state.audioErrors,
        [id]: hasError,
      },
    }));
  },

  setAudioDuration: (id, duration) => {
    // Only update if the duration is valid
    if (duration && !isNaN(duration) && duration > 0) {
      const { tracks, audioDurations } = get();
      const track = tracks.find((t) => t.id === id);

      // Check if duration hasn't changed to prevent redundant updates
      const existingDuration = audioDurations[id];
      if (existingDuration && Math.abs(existingDuration - duration) < 0.01) {
        // Duration is essentially the same, skip update
        return;
      }

      console.log(
        `Setting accurate duration for track ${id} (${
          track?.label || "unknown"
        }): ${duration}s`
      );

      // Store accurate duration
      set((state) => ({
        audioDurations: {
          ...state.audioDurations,
          [id]: duration,
        },
      }));

      // Also update the duration property on the track itself if it's different
      if (
        track &&
        (!track.duration || Math.abs(track.duration - duration) > 0.1)
      ) {
        console.log(
          `Updating explicit track duration from ${track.duration}s to ${duration}s`
        );
        get().updateTrack(id, { duration });
      }

      // Trigger recalculation with new duration
      get().calculateTimings();
    } else {
      console.warn(`Invalid duration for track ${id}: ${duration}`);
    }
  },

  calculateTimings: () => {
    const { tracks, audioDurations } = get();

    // Use battle-tested heuristic calculator
    console.log("🔧 Using Legacy Timeline Calculator (heuristic-based)");
    const result = LegacyTimelineCalculator.calculateTimings(tracks, audioDurations);
    
    set({
      calculatedTracks: result.calculatedTracks,
      totalDuration: result.totalDuration,
    });
  },

  setPreviewUrl: (url) => {
    // Clean up previous URL if there was one
    const { previewUrl } = get();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    set({ previewUrl: url });
  },

  setIsExporting: (isExporting) => {
    set({ isExporting });
  },

  clearTracks: (type) => {
    const { tracks } = get();

    if (type) {
      // Remove only tracks of the specified type
      set({
        tracks: tracks.filter((track) => track.type !== type),
      });
    } else {
      // Remove all tracks
      set({ tracks: [] });
    }

    // Recalculate timings
    get().calculateTimings();
  },
}));
