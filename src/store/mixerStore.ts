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
  };
  // UI state
  isLoading?: boolean;
};

// Calculate timing for tracks based on relationships
type CalculatedTrack = MixerTrack & {
  actualStartTime: number;
  actualDuration: number;
};

interface MixerState {
  // Track collections
  tracks: MixerTrack[];
  calculatedTracks: CalculatedTrack[];
  totalDuration: number;

  // Volume settings
  trackVolumes: Record<string, number>;

  // Loading states
  loadingStates: Record<string, boolean>;
  audioErrors: Record<string, boolean>;

  // Export/preview state
  isExporting: boolean;
  previewUrl: string | null;

  // Calculated audio durations cache
  audioDurations: Record<string, number>;

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
}

// Helper function to get default volume based on track type
const getDefaultVolume = (type: "voice" | "music" | "soundfx"): number => {
  switch (type) {
    case "voice":
      return 1.0;
    case "music":
      return 0.25;
    case "soundfx":
      return 0.7;
    default:
      return 1.0;
  }
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
    set((state) => ({
      audioDurations: {
        ...state.audioDurations,
        [id]: duration,
      },
    }));

    // Recalculate timings with the new duration info
    get().calculateTimings();
  },

  calculateTimings: () => {
    const { tracks, audioDurations } = get();

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
      if (track.duration && !isNaN(track.duration)) {
        return track.duration;
      }

      // Use cached duration if available
      if (audioDurations[track.id] && !isNaN(audioDurations[track.id])) {
        return audioDurations[track.id];
      }

      // Fall back to default duration
      return 3; // Default to 3 seconds
    };

    // We'll use this map to keep track of calculated start times
    const trackStartTimes = new Map<string, number>();

    // Result array to build
    const result: CalculatedTrack[] = [];

    // First, identify tracks with explicit start times
    validTracks.forEach((track) => {
      if (track.startTime !== undefined) {
        const actualDuration = getTrackDuration(track);
        result.push({
          ...track,
          actualStartTime: track.startTime,
          actualDuration,
        });
        trackStartTimes.set(track.id, track.startTime);
      }
    });

    // Identify groups of concurrent tracks
    const concurrentGroups = new Map<string, MixerTrack[]>();

    validTracks.forEach((track) => {
      if (
        track.isConcurrent &&
        track.concurrentGroup &&
        !trackStartTimes.has(track.id)
      ) {
        if (!concurrentGroups.has(track.concurrentGroup)) {
          concurrentGroups.set(track.concurrentGroup, []);
        }
        concurrentGroups.get(track.concurrentGroup)?.push(track);
      }
    });

    // Process voice tracks first (prioritize voices)
    const voiceTracks = validTracks.filter(
      (t) =>
        t.type === "voice" &&
        !trackStartTimes.has(t.id) &&
        (!t.isConcurrent || !t.concurrentGroup)
    );

    if (voiceTracks.length > 0) {
      // Position the first voice track at the beginning if not explicitly positioned
      const firstVoice = voiceTracks[0];
      if (firstVoice && !trackStartTimes.has(firstVoice.id)) {
        const actualDuration = getTrackDuration(firstVoice);
        result.push({
          ...firstVoice,
          actualStartTime: 0,
          actualDuration,
        });
        trackStartTimes.set(firstVoice.id, 0);

        // Process the rest of the voice tracks
        let currentTime = actualDuration;
        for (let i = 1; i < voiceTracks.length; i++) {
          const voiceTrack = voiceTracks[i];
          if (trackStartTimes.has(voiceTrack.id)) continue;

          if (voiceTrack.playAfter) {
            // Use playAfter logic for this voice track
            let startTime = currentTime;
            if (voiceTrack.playAfter === "previous") {
              // Play after the previous voice track
              const prevTrack = voiceTracks[i - 1];
              if (trackStartTimes.has(prevTrack.id)) {
                const prevStart = trackStartTimes.get(prevTrack.id) || 0;
                const prevDuration = getTrackDuration(prevTrack);
                startTime = prevStart + prevDuration;

                // Apply overlap if specified
                if (voiceTrack.overlap && voiceTrack.overlap > 0) {
                  startTime = Math.max(
                    prevStart,
                    startTime - voiceTrack.overlap
                  );
                }
              }
            } else {
              // Find referenced track by ID
              const refTrack = validTracks.find(
                (t) => t.id === voiceTrack.playAfter
              );
              if (refTrack && trackStartTimes.has(refTrack.id)) {
                const refStart = trackStartTimes.get(refTrack.id) || 0;
                const refDuration = getTrackDuration(refTrack);
                startTime = refStart + refDuration;

                // Apply overlap if specified
                if (voiceTrack.overlap && voiceTrack.overlap > 0) {
                  startTime = Math.max(
                    refStart,
                    startTime - voiceTrack.overlap
                  );
                }
              }
            }

            const actualDuration = getTrackDuration(voiceTrack);
            result.push({
              ...voiceTrack,
              actualStartTime: startTime,
              actualDuration,
            });
            trackStartTimes.set(voiceTrack.id, startTime);
            currentTime = startTime + actualDuration;
          } else {
            // Sequential placement
            const actualDuration = getTrackDuration(voiceTrack);
            result.push({
              ...voiceTrack,
              actualStartTime: currentTime,
              actualDuration,
            });
            trackStartTimes.set(voiceTrack.id, currentTime);
            currentTime += actualDuration;
          }
        }
      }
    }

    // Process concurrent voice groups
    concurrentGroups.forEach((groupTracks) => {
      if (groupTracks.length === 0) return;

      // Determine start time based on playAfter/overlap of first track in group
      const firstTrack = groupTracks[0];
      let groupStartTime = 0;

      if (firstTrack.playAfter) {
        if (firstTrack.playAfter === "previous") {
          // Find the latest end time of tracks processed so far
          if (result.length > 0) {
            const latestEndTime = Math.max(
              ...result.map((t) => t.actualStartTime + t.actualDuration)
            );
            groupStartTime = latestEndTime;

            // Apply overlap if specified
            if (firstTrack.overlap && firstTrack.overlap > 0) {
              groupStartTime = Math.max(0, groupStartTime - firstTrack.overlap);
            }
          }
        } else {
          // Look for specific track to play after
          const refTrackId = firstTrack.playAfter;
          const refTrackIndex = result.findIndex((t) => t.id === refTrackId);

          if (refTrackIndex !== -1) {
            const refTrack = result[refTrackIndex];
            groupStartTime = refTrack.actualStartTime + refTrack.actualDuration;

            // Apply overlap if specified
            if (firstTrack.overlap && firstTrack.overlap > 0) {
              groupStartTime = Math.max(
                refTrack.actualStartTime,
                groupStartTime - firstTrack.overlap
              );
            }
          }
        }
      } else if (result.length === 0) {
        // If no other tracks are placed yet, start at the beginning
        groupStartTime = 0;
      } else {
        // Default: place after the last track
        groupStartTime = Math.max(
          ...result.map((t) => t.actualStartTime + t.actualDuration)
        );
      }

      // Place all tracks in the concurrent group at the same starting point
      groupTracks.forEach((track) => {
        const actualDuration = getTrackDuration(track);
        result.push({
          ...track,
          actualStartTime: groupStartTime,
          actualDuration,
        });
        trackStartTimes.set(track.id, groupStartTime);
      });
    });

    // Now handle music tracks - place at beginning or alongside voice tracks
    const musicTrack = validTracks.find(
      (t) => t.type === "music" && !trackStartTimes.has(t.id)
    );

    if (musicTrack) {
      // Music starts at the beginning by default
      const startTime = 0;
      const actualDuration = getTrackDuration(musicTrack);

      // Find the end time of the last voice track
      const lastVoiceEndTime = result
        .filter((t) => t.type === "voice")
        .reduce((maxEnd, track) => {
          const end = track.actualStartTime + track.actualDuration;
          return Math.max(maxEnd, end);
        }, 0);

      // If we have voice tracks, fade out music 2-3 seconds after the last voice ends
      // Otherwise use full music duration
      let adjustedDuration = actualDuration;
      if (lastVoiceEndTime > 0) {
        // Add a small amount (2-3 seconds) of music after the last voice ends
        adjustedDuration = Math.min(actualDuration, lastVoiceEndTime + 3);
      }

      result.push({
        ...musicTrack,
        actualStartTime: startTime,
        actualDuration: adjustedDuration,
      });
      trackStartTimes.set(musicTrack.id, startTime);
    }

    // Handle sound FX tracks with relative positioning
    validTracks
      .filter((t) => t.type === "soundfx" && !trackStartTimes.has(t.id))
      .forEach((track) => {
        // Find the end time of all voice tracks
        const voiceTracks = result.filter((t) => t.type === "voice");
        const lastVoiceEndTime =
          voiceTracks.length > 0
            ? Math.max(
                ...voiceTracks.map((t) => t.actualStartTime + t.actualDuration)
              )
            : 0;

        if (track.startTime !== undefined) {
          // Handle explicit start times
          const actualDuration = getTrackDuration(track);
          result.push({
            ...track,
            actualStartTime: track.startTime,
            actualDuration,
          });
          trackStartTimes.set(track.id, track.startTime);
        } else if (track.playAfter) {
          // Special case: If playAfter is "start", position at the beginning
          if (track.playAfter === "start") {
            const actualDuration = getTrackDuration(track);
            result.push({
              ...track,
              actualStartTime: 0, // Position at the start of the timeline
              actualDuration,
            });
            trackStartTimes.set(track.id, 0);
          } else if (track.playAfter === "previous") {
            // Find the previous track in the list
            const trackIndex = validTracks.indexOf(track);
            let referenceTrack: MixerTrack | undefined;

            if (trackIndex > 0) {
              referenceTrack = validTracks[trackIndex - 1];
            } else if (result.length > 0) {
              // If this is the first track but we already have placed tracks, use the last placed track
              referenceTrack = result[result.length - 1];
            }

            if (referenceTrack && trackStartTimes.has(referenceTrack.id)) {
              const referenceStartTime =
                trackStartTimes.get(referenceTrack.id) || 0;
              const referenceDuration = getTrackDuration(referenceTrack);
              const referenceEndTime = referenceStartTime + referenceDuration;

              // Calculate start time based on playAfter and overlap
              let startTime = referenceEndTime;
              if (track.overlap && track.overlap > 0) {
                startTime = Math.max(
                  referenceStartTime,
                  referenceEndTime - track.overlap
                );
              }

              const actualDuration = getTrackDuration(track);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration,
              });

              trackStartTimes.set(track.id, startTime);
            } else {
              // If reference track not found, place after all voice tracks
              const startTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 0;
              const actualDuration = getTrackDuration(track);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration,
              });
              trackStartTimes.set(track.id, startTime);
            }
          } else {
            // Find by track ID
            const referenceTrack = validTracks.find(
              (t) => t.id === track.playAfter
            );

            if (referenceTrack && trackStartTimes.has(referenceTrack.id)) {
              const referenceStartTime =
                trackStartTimes.get(referenceTrack.id) || 0;
              const referenceDuration = getTrackDuration(referenceTrack);
              const referenceEndTime = referenceStartTime + referenceDuration;

              // Calculate start time based on playAfter and overlap
              let startTime = referenceEndTime;
              if (track.overlap && track.overlap > 0) {
                startTime = Math.max(
                  referenceStartTime,
                  referenceEndTime - track.overlap
                );
              }

              const actualDuration = getTrackDuration(track);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration,
              });

              trackStartTimes.set(track.id, startTime);
            } else {
              // If reference track not found, place after all voice tracks
              const startTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 0;
              const actualDuration = getTrackDuration(track);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration,
              });
              trackStartTimes.set(track.id, startTime);
            }
          }
        } else {
          // For sound effects with no explicit timing, distribute them evenly across the timeline
          // or place at the beginning by default
          const actualDuration = getTrackDuration(track);
          result.push({
            ...track,
            actualStartTime: 0,
            actualDuration,
          });
          trackStartTimes.set(track.id, 0);
        }
      });

    // Process any remaining tracks
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

    // Calculate total duration - use the latest end time
    const totalDuration =
      result.length > 0
        ? Math.ceil(
            Math.max(...result.map((t) => t.actualStartTime + t.actualDuration))
          )
        : 0;

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
