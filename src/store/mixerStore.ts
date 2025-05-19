import { create } from "zustand";

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
      console.log(`Setting accurate duration for track ${id}: ${duration}s`);
      set((state) => ({
        audioDurations: {
          ...state.audioDurations,
          [id]: duration,
        },
      }));

      // Recalculate timings with the new duration info
      get().calculateTimings();
    } else {
      console.warn(`Invalid duration for track ${id}: ${duration}`);
    }
  },

  calculateTimings: () => {
    const { tracks, audioDurations } = get();

    console.log(
      "Recalculating track timings. Available durations:",
      audioDurations
    );

    if (tracks.length === 0) {
      set({ calculatedTracks: [], totalDuration: 0 });
      return;
    }

    // Filter out invalid tracks (like ones with invalid or missing URLs)
    const validTracks = tracks.filter((track) => {
      // Validate URL - must be a valid blob or http URL
      if (
        !track.url ||
        !(
          track.url.startsWith("blob:") ||
          track.url.startsWith("http:") ||
          track.url.startsWith("https:")
        )
      ) {
        return false;
      }

      return true;
    });

    if (validTracks.length === 0) {
      set({ calculatedTracks: [], totalDuration: 0 });
      return;
    }

    // Helper function to get actual duration from track
    const getTrackDuration = (track: MixerTrack): number => {
      // First priority: use cached audio duration from actual audio element measurement
      if (audioDurations[track.id] && !isNaN(audioDurations[track.id])) {
        console.log(
          `Using measured duration for ${track.label}: ${
            audioDurations[track.id]
          }s`
        );
        return audioDurations[track.id];
      }

      // Second priority: use track's explicit duration if set
      if (track.duration && !isNaN(track.duration)) {
        console.log(
          `Using explicit duration for ${track.label}: ${track.duration}s`
        );
        return track.duration;
      }

      // Fall back to default duration
      console.log(`Using default duration for ${track.label}: 3s`);
      return 3; // Default to 3 seconds
    };

    // We'll use this map to keep track of calculated start times
    const trackStartTimes = new Map<string, number>();

    // Result array to build
    const result: CalculatedTrack[] = [];

    // Group tracks by type for easier processing
    const voiceTracks = validTracks.filter((track) => track.type === "voice");
    const musicTracks = validTracks.filter((track) => track.type === "music");
    const soundFxTracks = validTracks.filter(
      (track) => track.type === "soundfx"
    );

    // First, handle sound effects with "playAfter: start"
    const introSoundFxTracks = soundFxTracks.filter(
      (track) => track.playAfter === "start"
    );

    let startingOffset = 0;

    // Process intro sound effects first and calculate their total duration
    if (introSoundFxTracks.length > 0) {
      console.log(
        `Found ${introSoundFxTracks.length} intro sound effects that play at start`
      );

      // Sort intro sound effects by their overlap (if any)
      introSoundFxTracks.sort((a, b) => {
        const overlapA = a.overlap || 0;
        const overlapB = b.overlap || 0;
        return overlapA - overlapB; // Sort by overlap amount (ascending)
      });

      // Position each intro sound effect sequentially
      let currentEndTime = 0;

      introSoundFxTracks.forEach((track) => {
        if (trackStartTimes.has(track.id)) return; // Skip if already positioned

        const actualDuration = getTrackDuration(track);
        const startTime = Math.max(0, currentEndTime - (track.overlap || 0));

        result.push({
          ...track,
          actualStartTime: startTime,
          actualDuration,
        });

        trackStartTimes.set(track.id, startTime);
        currentEndTime = startTime + actualDuration;
        console.log(
          `Positioned intro sound effect "${track.label}" at ${startTime}s (duration: ${actualDuration}s)`
        );
      });

      // Update starting offset for voice tracks to begin after intro effects
      startingOffset = currentEndTime;
      console.log(
        `Setting voice tracks to start at offset ${startingOffset}s due to intro sound effects`
      );
    }

    let lastVoiceEndTime = startingOffset;

    if (voiceTracks.length > 0) {
      // Position the first voice track after any sound effects
      const firstVoice = voiceTracks[0];
      if (firstVoice && !trackStartTimes.has(firstVoice.id)) {
        const actualDuration = getTrackDuration(firstVoice);
        result.push({
          ...firstVoice,
          actualStartTime: startingOffset,
          actualDuration,
        });
        trackStartTimes.set(firstVoice.id, startingOffset);
        lastVoiceEndTime = startingOffset + actualDuration;
        console.log(
          `Positioned first voice track "${firstVoice.label}" at ${startingOffset}s`
        );

        // Process the rest of the voice tracks sequentially
        for (let i = 1; i < voiceTracks.length; i++) {
          const voiceTrack = voiceTracks[i];

          // Skip if already positioned
          if (trackStartTimes.has(voiceTrack.id)) continue;

          // By default, each voice track plays after the previous voice track
          const prevTrack = result.find((t) => t.id === voiceTracks[i - 1].id);
          if (prevTrack) {
            const prevStartTime = prevTrack.actualStartTime;
            const prevDuration = prevTrack.actualDuration;
            const prevEndTime = prevStartTime + prevDuration;

            // Calculate where this track should start
            const actualDuration = getTrackDuration(voiceTrack);
            let startTime = prevEndTime;

            // Apply overlap if specified
            if (voiceTrack.overlap && voiceTrack.overlap > 0) {
              startTime = Math.max(
                prevStartTime,
                prevEndTime - voiceTrack.overlap
              );
            }

            console.log(
              `Positioning voice track ${voiceTrack.label} at ${startTime}s (after ${prevTrack.label})`
            );

            result.push({
              ...voiceTrack,
              actualStartTime: startTime,
              actualDuration,
            });

            trackStartTimes.set(voiceTrack.id, startTime);
            lastVoiceEndTime = startTime + actualDuration;
          }
        }
      }
    }

    // Calculate the total voice duration for determining music length
    const voiceEndTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 3; // Default to at least 3 seconds

    // Position music tracks - typically at the beginning with full timeline duration
    if (musicTracks.length > 0) {
      // We'll use just the first music track
      const musicTrack = musicTracks[0];
      if (!trackStartTimes.has(musicTrack.id)) {
        // Use the actual music duration from the audio element if available
        const actualDuration = getTrackDuration(musicTrack);

        // For visualization in the timeline, we'll limit music to just slightly past the voice content
        // This prevents the timeline from being stretched too far by very long music tracks
        const finalDuration = Math.min(
          actualDuration,
          voiceEndTime + 2.0 // Limit to voice end + 2 seconds for timeline display
        );

        console.log(
          `Positioning music track ${musicTrack.label} with display duration ${finalDuration}s (actual: ${actualDuration}s, voice end: ${voiceEndTime}s)`
        );

        result.push({
          ...musicTrack,
          actualStartTime: 0,
          actualDuration: finalDuration,
          // Store the original duration for mixing/export
          metadata: {
            ...musicTrack.metadata,
            originalDuration: actualDuration,
          },
        });
        trackStartTimes.set(musicTrack.id, 0);
      }
    }

    // Process sound effects with explicit timing
    soundFxTracks.forEach((track) => {
      // Skip already processed tracks (like intro sound effects)
      if (trackStartTimes.has(track.id)) return;

      // Process tracks with explicit start times
      if (track.startTime !== undefined && track.startTime >= 0) {
        const actualDuration = getTrackDuration(track);
        result.push({
          ...track,
          actualStartTime: track.startTime,
          actualDuration,
        });
        trackStartTimes.set(track.id, track.startTime);
        return;
      }

      // Handle tracks that should play after another track
      if (track.playAfter) {
        // Skip "start" case - we already handled those earlier
        if (track.playAfter === "start") {
          return; // Skip because we already processed intro sound effects
        }

        // Handle "previous" case - play after previous track in list
        if (track.playAfter === "previous") {
          const trackIndex = soundFxTracks.indexOf(track);
          const prevSoundFx =
            trackIndex > 0 ? soundFxTracks[trackIndex - 1] : null;

          if (prevSoundFx && trackStartTimes.has(prevSoundFx.id)) {
            const prevStartTime = trackStartTimes.get(prevSoundFx.id) || 0;
            const prevDuration = getTrackDuration(prevSoundFx);
            const prevEndTime = prevStartTime + prevDuration;

            let startTime = prevEndTime;
            // Apply overlap if specified
            if (track.overlap && track.overlap > 0) {
              startTime = Math.max(prevStartTime, prevEndTime - track.overlap);
            }

            const actualDuration = getTrackDuration(track);
            result.push({
              ...track,
              actualStartTime: startTime,
              actualDuration,
            });
            trackStartTimes.set(track.id, startTime);
            return;
          } else {
            // If no previous sound FX found, place after voice tracks
            const actualDuration = getTrackDuration(track);
            result.push({
              ...track,
              actualStartTime: lastVoiceEndTime,
              actualDuration,
            });
            trackStartTimes.set(track.id, lastVoiceEndTime);
            return;
          }
        }

        // Handle play after specific track ID
        const referenceTrack = result.find((t) => t.id === track.playAfter);
        if (referenceTrack) {
          const refStartTime = referenceTrack.actualStartTime;
          const refDuration = referenceTrack.actualDuration;
          const refEndTime = refStartTime + refDuration;

          let startTime = refEndTime;
          // Apply overlap if specified
          if (track.overlap && track.overlap > 0) {
            startTime = Math.max(refStartTime, refEndTime - track.overlap);
          }

          const actualDuration = getTrackDuration(track);
          result.push({
            ...track,
            actualStartTime: startTime,
            actualDuration,
          });
          trackStartTimes.set(track.id, startTime);
          return;
        }
      }

      // Default placement for sound effects with no specific timing
      const actualDuration = getTrackDuration(track);
      result.push({
        ...track,
        actualStartTime: lastVoiceEndTime > 0 ? lastVoiceEndTime : 0,
        actualDuration,
      });
      trackStartTimes.set(
        track.id,
        lastVoiceEndTime > 0 ? lastVoiceEndTime : 0
      );
    });

    // Process any remaining tracks that haven't been positioned yet
    validTracks.forEach((track) => {
      // Skip already processed tracks
      if (trackStartTimes.has(track.id)) return;

      // Default placement - after all existing tracks
      const latestEndTime =
        result.length > 0
          ? Math.max(...result.map((t) => t.actualStartTime + t.actualDuration))
          : 0;

      const actualDuration = getTrackDuration(track);
      result.push({
        ...track,
        actualStartTime: latestEndTime,
        actualDuration,
      });
      trackStartTimes.set(track.id, latestEndTime);
    });

    // Calculate total duration - make sure it's at least 3 seconds with a small buffer
    const calculatedMaxDuration =
      result.length > 0
        ? Math.max(...result.map((t) => t.actualStartTime + t.actualDuration))
        : 0;

    // Ensure minimum timeline duration of 3 seconds
    const totalDuration = Math.max(Math.ceil(calculatedMaxDuration) + 0.5, 3.0);

    console.log(
      "Track timing calculation complete:",
      result.map((track) => ({
        id: track.id,
        label: track.label,
        type: track.type,
        start: track.actualStartTime,
        duration: track.actualDuration,
        end: track.actualStartTime + track.actualDuration,
      }))
    );
    console.log("Total timeline duration:", totalDuration);

    // DO NOT stretch music tracks to fill the timeline -
    // this causes timeline distortion and inconsistent playback
    // Instead, we'll handle the full music duration during mixing

    set({
      calculatedTracks: result,
      totalDuration,
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
