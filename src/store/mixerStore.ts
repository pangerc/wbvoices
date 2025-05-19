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
      const { tracks } = get();
      const track = tracks.find((t) => t.id === id);

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
        const measuredDuration = audioDurations[track.id];
        console.log(
          `Using measured duration for ${track.label}: ${measuredDuration}s`
        );
        return measuredDuration;
      }

      // Second priority: use track's explicit duration if set
      if (track.duration && !isNaN(track.duration)) {
        console.log(
          `Using explicit duration for ${track.label}: ${track.duration}s`
        );
        return track.duration;
      }

      // For voice tracks, be a bit more generous with the default
      if (track.type === "voice") {
        console.log(`Using default voice duration for ${track.label}: 4s`);
        return 4; // Default for voice is 4 seconds
      }

      // Fall back to default duration for other track types
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

    // Process voice tracks based on explicit timing data if available
    if (voiceTracks.length > 0) {
      console.log(`Processing ${voiceTracks.length} voice tracks...`);

      // Step 1: First scan all voice tracks for metadata with their actual start times/durations
      for (const track of voiceTracks) {
        // Use the most accurate duration available
        const actualDuration = getTrackDuration(track);

        // Add support for explicit start times in metadata - need to check if this exists
        // since it's not in the original type definition
        if (
          track.metadata &&
          "startTime" in track.metadata &&
          track.metadata.startTime !== undefined
        ) {
          // Use explicit timing from metadata if available
          const explicitStartTime = track.metadata.startTime as number;
          console.log(
            `Using explicit start time for "${track.label}": ${explicitStartTime}s`
          );

          result.push({
            ...track,
            actualStartTime: explicitStartTime,
            actualDuration,
          });
          trackStartTimes.set(track.id, explicitStartTime);

          // Update lastVoiceEndTime if this track extends beyond current value
          const trackEndTime = explicitStartTime + actualDuration;
          if (trackEndTime > lastVoiceEndTime) {
            lastVoiceEndTime = trackEndTime;
          }
        }
      }

      // Step 2: Position remaining tracks sequentially
      // Position first voice track - check for explicit startTime on the track
      if (voiceTracks.length > 0 && !trackStartTimes.has(voiceTracks[0].id)) {
        const firstVoice = voiceTracks[0];
        const actualDuration = getTrackDuration(firstVoice);

        // Check if this track has an explicit startTime property
        const explicitStartTime =
          firstVoice.startTime !== undefined && !isNaN(firstVoice.startTime)
            ? firstVoice.startTime
            : startingOffset;

        result.push({
          ...firstVoice,
          actualStartTime: explicitStartTime,
          actualDuration,
        });
        trackStartTimes.set(firstVoice.id, explicitStartTime);
        lastVoiceEndTime = explicitStartTime + actualDuration;
        console.log(
          `Positioned first voice track "${firstVoice.label}" at ${explicitStartTime}s with duration ${actualDuration}s (ends at ${lastVoiceEndTime}s)`
        );
      }

      // Process remaining voice tracks in sequence
      for (let i = 1; i < voiceTracks.length; i++) {
        const voiceTrack = voiceTracks[i];

        // Skip if already positioned in step 1
        if (trackStartTimes.has(voiceTrack.id)) {
          console.log(
            `Skipping "${voiceTrack.label}" as it's already positioned`
          );
          continue;
        }

        // Use the most accurate duration available
        const actualDuration = getTrackDuration(voiceTrack);

        // If playAfter is specified, find that track and position after it
        if (voiceTrack.playAfter) {
          const referenceTrack = result.find(
            (t) => t.id === voiceTrack.playAfter
          );
          if (referenceTrack) {
            const refEndTime =
              referenceTrack.actualStartTime + referenceTrack.actualDuration;
            const startTime = Math.round(refEndTime * 100) / 100; // Round to 2 decimal places

            console.log(
              `Positioning "${voiceTrack.label}" at ${startTime}s after "${referenceTrack.label}" (which ends at ${refEndTime}s)`
            );

            result.push({
              ...voiceTrack,
              actualStartTime: startTime,
              actualDuration,
            });
            trackStartTimes.set(voiceTrack.id, startTime);
            lastVoiceEndTime = Math.max(
              lastVoiceEndTime,
              startTime + actualDuration
            );
            continue;
          }
        }

        // Default sequential positioning if no specific instructions
        // Get the previous track in the result array
        const prevTrack = result.find((t) => t.id === voiceTracks[i - 1].id);
        if (prevTrack) {
          const prevEndTime =
            prevTrack.actualStartTime + prevTrack.actualDuration;
          let startTime = Math.round(prevEndTime * 100) / 100; // Round to 2 decimal places

          // Apply overlap if specified
          if (voiceTrack.overlap && voiceTrack.overlap > 0) {
            startTime = Math.max(
              prevTrack.actualStartTime,
              prevEndTime - voiceTrack.overlap
            );
            startTime = Math.round(startTime * 100) / 100; // Round again after calculation
          }

          console.log(
            `Positioning "${voiceTrack.label}" at ${startTime}s after "${prevTrack.label}" (which ends at ${prevEndTime}s)`
          );

          result.push({
            ...voiceTrack,
            actualStartTime: startTime,
            actualDuration,
          });
          trackStartTimes.set(voiceTrack.id, startTime);
          lastVoiceEndTime = Math.max(
            lastVoiceEndTime,
            startTime + actualDuration
          );
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

        // For visualization in the timeline, limit music to match voice content
        // This prevents the timeline from being stretched too far by very long music tracks
        // We'll make music stop about 0.5s before the last voice track ends
        const visualDuration =
          voiceEndTime > 0
            ? Math.min(actualDuration, voiceEndTime)
            : Math.min(actualDuration, 30); // Reasonable default if no voice tracks

        console.log(
          `Positioning music track ${musicTrack.label} with display duration ${visualDuration}s (actual: ${actualDuration}s, voice end: ${voiceEndTime}s)`
        );

        result.push({
          ...musicTrack,
          actualStartTime: 0,
          actualDuration: visualDuration,
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

    // Calculate total duration directly from track timings
    // Find the maximum end time of all tracks (excluding music tracks with originalDuration)
    const excludeMusicForLength = result.some(
      (t) => t.type === "voice" || t.type === "soundfx"
    );

    const calculatedMaxDuration =
      result.length > 0
        ? Math.max(
            ...result.map((t) => {
              // For music tracks when we have voice/soundfx, use their visualDuration, not originalDuration
              if (excludeMusicForLength && t.type === "music") {
                return t.actualStartTime + t.actualDuration;
              }
              return t.actualStartTime + t.actualDuration;
            })
          )
        : 0;

    // Round up to the nearest half-second for clean display
    const totalDuration = Math.ceil(calculatedMaxDuration * 2) / 2;

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
    console.log(
      "Total timeline duration:",
      totalDuration,
      "(exact end time:",
      calculatedMaxDuration + ")"
    );

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
