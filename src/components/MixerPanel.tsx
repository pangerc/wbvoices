import React, { useState, useEffect, useRef } from "react";
import { createMix, TrackTiming } from "@/utils/audio-mixer";

// Helper function to clean track labels
function cleanTrackLabel(label: string): string {
  // Remove duration indicators like (30s), (15s), etc.
  return label.replace(/\s*\(\d+s\)\s*$/i, "");
}

type Track = {
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
  // Loading state
  isLoading?: boolean;
};

type MixerPanelProps = {
  tracks: Track[];
  onRemoveTrack?: (index: number) => void;
  resetForm: () => void;
  // Add props to indicate which asset types are being generated
  isGeneratingVoice?: boolean;
  isGeneratingMusic?: boolean;
  isGeneratingSoundFx?: boolean;
};

export function MixerPanel({
  tracks,
  onRemoveTrack,
  resetForm,
  isGeneratingVoice = false,
  isGeneratingMusic = false,
  isGeneratingSoundFx = false,
}: MixerPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Track loading states
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );
  const voiceTracks = tracks.filter((track) => track.type === "voice");
  const musicTracks = tracks.filter((track) => track.type === "music");
  const soundFxTracks = tracks.filter((track) => {
    if (track.type !== "soundfx") return false;

    // Basic URL validation - this helps filter out placeholder tracks
    return (
      track.url &&
      (track.url.startsWith("blob:") ||
        track.url.startsWith("http:") ||
        track.url.startsWith("https:"))
    );
  });

  // Track which URLs have errors
  const [audioErrors, setAudioErrors] = useState<{ [url: string]: boolean }>(
    {}
  );
  // Track references map for audio elements
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  // Preserve existing audio references when tracks change
  const prevTracksRef = useRef<Track[]>([]);

  // Track volume controls (default values)
  const [trackVolumes, setTrackVolumes] = useState<{ [url: string]: number }>(
    {}
  );

  // State for track timing calculation
  const [calculatedTracks, setCalculatedTracks] = useState<
    Array<Track & { actualStartTime: number; actualDuration: number }>
  >([]);
  const [totalDuration, setTotalDuration] = useState(0);

  // Reference to the timeline container for measuring width
  const timelineRef = useRef<HTMLDivElement>(null);

  // Handle audio error
  const handleAudioError = (url: string, label: string) => {
    console.error(`Error with audio for ${label}`);
    setAudioErrors((prev) => ({
      ...prev,
      [url]: true,
    }));

    // Schedule a retry after a short delay
    setTimeout(() => {
      const audio = audioRefs.current[url];
      if (audio) {
        console.log(`Retrying load for ${label}...`);
        audio.load();
      }
    }, 500);
  };

  // Check if a track is in a loading state
  const isTrackLoading = (track: Track) => {
    // If audio has already loaded or errors are cleared, never show loading
    const audioElement = audioRefs.current[track.url];
    if (audioElement && audioElement.readyState >= 3) return false;

    // If there's an error loading this track, don't show loading animation
    if (audioErrors[track.url]) return false;

    // If the track is explicitly marked as loaded, don't show loading
    if (loadingStates[track.url] === false) return false;

    // For tracks that appear in the timeline view, never show as loading
    const calculatedTrack = calculatedTracks.find((t) => t.url === track.url);
    if (calculatedTrack) return false;

    // Check track-specific loading state first
    if (track.isLoading) return true;
    if (loadingStates[track.url]) return true;

    // Only check global generation state for tracks that don't have readyState or haven't been processed
    if (!audioElement) {
      if (track.type === "voice" && isGeneratingVoice) return true;
      if (track.type === "music" && isGeneratingMusic) return true;
      if (track.type === "soundfx" && isGeneratingSoundFx) return true;
    }

    return false;
  };

  // Track when audio becomes available - mark as loaded
  const handleAudioLoaded = (url: string) => {
    console.log(`Audio loaded for ${url}`);
    setLoadingStates((prev) => {
      const updated = { ...prev };
      updated[url] = false; // Explicitly mark as NOT loading (rather than deleting)
      return updated;
    });

    // Also clear any errors
    if (audioErrors[url]) {
      setAudioErrors((prev) => {
        const updated = { ...prev };
        delete updated[url];
        return updated;
      });
    }
  };

  // Update loading states when tracks change
  useEffect(() => {
    // Determine which tracks are new by comparing with previous tracks
    const prevUrls = new Set(prevTracksRef.current.map((t) => t.url));
    const newTracks = tracks.filter((t) => !prevUrls.has(t.url));

    // Mark new tracks as loading
    if (newTracks.length > 0) {
      const newLoadingStates: Record<string, boolean> = {};
      newTracks.forEach((track) => {
        newLoadingStates[track.url] = true;
      });
      setLoadingStates((prev) => ({ ...prev, ...newLoadingStates }));
    }

    // Update the previous tracks reference
    prevTracksRef.current = [...tracks];
  }, [tracks]);

  // Initialize track volumes with defaults based on type
  useEffect(() => {
    const initialVolumes: { [url: string]: number } = {};
    tracks.forEach((track) => {
      if (!trackVolumes[track.url]) {
        switch (track.type) {
          case "voice":
            initialVolumes[track.url] = track.volume || 1.0;
            break;
          case "music":
            initialVolumes[track.url] = track.volume || 0.25;
            break;
          case "soundfx":
            initialVolumes[track.url] = track.volume || 0.7;
            break;
        }
      }
    });

    if (Object.keys(initialVolumes).length > 0) {
      setTrackVolumes((prev) => ({ ...prev, ...initialVolumes }));
    }
  }, [tracks]);

  // Handle volume change
  const handleVolumeChange = (url: string, volume: number) => {
    setTrackVolumes((prev) => ({
      ...prev,
      [url]: volume,
    }));
  };

  // Build audio refs for each track
  useEffect(() => {
    // Preserve existing audio elements
    const existingRefs = audioRefs.current;

    // Create audio elements to measure actual durations
    tracks.forEach((track) => {
      // If we already have a working audio element for this URL, don't recreate it
      if (existingRefs[track.url] && !audioErrors[track.url]) {
        // If it's already loaded, mark it as loaded in our state
        const existingAudio = existingRefs[track.url];
        if (existingAudio && existingAudio.readyState >= 3) {
          handleAudioLoaded(track.url);
        }
        return;
      }

      if (!audioRefs.current[track.url]) {
        const audio = new Audio(track.url);

        // Add error handling for blob URL issues
        audio.onerror = () => {
          handleAudioError(track.url, track.label);
          // We'll keep the reference to retry loading later
        };

        // Handle successful load
        audio.onloadeddata = () => {
          handleAudioLoaded(track.url);
        };

        // Also handle canplaythrough event
        audio.oncanplaythrough = () => {
          handleAudioLoaded(track.url);
        };

        audioRefs.current[track.url] = audio;

        // Add event listener to update duration when metadata is loaded
        audio.addEventListener("loadedmetadata", () => {
          if (audio.duration && !isNaN(audio.duration)) {
            // Clear any previous error for this URL
            if (audioErrors[track.url]) {
              setAudioErrors((prev) => {
                const updated = { ...prev };
                delete updated[track.url];
                return updated;
              });
            }
            // Recalculate timing with actual duration
            calculateTimingWithActualDurations();
            // Mark as loaded
            handleAudioLoaded(track.url);
          }
        });

        // Force load metadata
        audio.load();
      } else if (audioRefs.current[track.url]) {
        // Always try to reload, even if no error, to ensure proper loading
        const audio = audioRefs.current[track.url];
        if (audio) {
          audio.load();
        }
      }
    });

    // Set up auto-retry mechanism for all tracks
    const retryTimeout = setTimeout(() => {
      const hasErrors = Object.keys(audioErrors).length > 0;
      if (hasErrors) {
        console.log("Auto-retrying failed audio loads...");
        Object.keys(audioErrors).forEach((url) => {
          const audio = audioRefs.current[url];
          if (audio) {
            audio.load();
          }
        });
      }
    }, 1000);

    // Cleanup function
    return () => {
      clearTimeout(retryTimeout);

      // Don't remove the audio elements when the component reloads
      // Just clean up event listeners
      Object.values(audioRefs.current).forEach((audio) => {
        if (audio) {
          audio.removeEventListener(
            "loadedmetadata",
            calculateTimingWithActualDurations
          );
        }
      });
    };
  }, [tracks, audioErrors]);

  // Function to get actual duration from an audio element
  const getActualDuration = (url: string): number => {
    const audio = audioRefs.current[url];
    if (audio && audio.duration && !isNaN(audio.duration)) {
      return audio.duration;
    }
    return 3; // Default to 3 seconds if duration not available
  };

  // Calculate timing with actual durations from audio elements
  const calculateTimingWithActualDurations = () => {
    if (tracks.length === 0) {
      setCalculatedTracks([]);
      setTotalDuration(0);
      return;
    }

    // Filter out invalid tracks (like ones with invalid or missing URLs)
    const validTracks = tracks.filter((track) => {
      const audio = audioRefs.current[track.url];
      if (!audio) return false;

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

    // Calculate timing relationship for tracks with actual durations
    const tracksWithTiming = calculateTrackTiming(validTracks);
    setCalculatedTracks(tracksWithTiming);

    // Calculate total duration - use the latest end time
    if (tracksWithTiming.length === 0) {
      setTotalDuration(0);
    } else {
      const maxEndTime = Math.max(
        ...tracksWithTiming.map((t) => t.actualStartTime + t.actualDuration)
      );
      setTotalDuration(Math.ceil(maxEndTime));
    }
  };

  // Calculate track timing on component mount and when tracks change
  useEffect(() => {
    if (tracks.length === 0) {
      setCalculatedTracks([]);
      setTotalDuration(0);
      return;
    }

    // Filter out invalid tracks
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

    // Initial calculation (will be updated when audio metadata loads)
    const tracksWithTiming = calculateTrackTiming(validTracks);
    setCalculatedTracks(tracksWithTiming);

    // Calculate total duration
    if (tracksWithTiming.length === 0) {
      setTotalDuration(0);
    } else {
      const maxEndTime = Math.max(
        ...tracksWithTiming.map((t) => t.actualStartTime + t.actualDuration)
      );
      setTotalDuration(Math.ceil(maxEndTime));
    }
  }, [tracks]);

  // Handle local reset
  const handleReset = () => {
    // Clean up preview URL if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    resetForm();
  };

  // Modify the calculateTrackTiming function to handle music and sound effect timing better
  const calculateTrackTiming = (
    trackList: Track[]
  ): Array<Track & { actualStartTime: number; actualDuration: number }> => {
    const result: Array<
      Track & {
        actualStartTime: number;
        actualDuration: number;
      }
    > = [];

    // Guard against empty track list
    if (!trackList || trackList.length === 0) {
      return result;
    }

    // We'll use this map to keep track of calculated start times
    const trackStartTimes = new Map<string, number>();

    // First, identify groups of concurrent tracks
    const concurrentGroups = new Map<string, Track[]>();

    // Identify tracks with explicit start times first
    trackList.forEach((track) => {
      if (track.startTime !== undefined) {
        const actualDuration = getActualDuration(track.url);
        result.push({
          ...track,
          actualStartTime: track.startTime,
          actualDuration: track.duration || actualDuration,
        });
        trackStartTimes.set(track.url, track.startTime);
      }
    });

    // Group concurrent tracks
    trackList.forEach((track) => {
      if (
        track.isConcurrent &&
        track.concurrentGroup &&
        !trackStartTimes.has(track.url)
      ) {
        if (!concurrentGroups.has(track.concurrentGroup)) {
          concurrentGroups.set(track.concurrentGroup, []);
        }
        concurrentGroups.get(track.concurrentGroup)?.push(track);
      }
    });

    // Process voice tracks first (prioritize voices)
    const voiceTracks = trackList.filter(
      (t) =>
        t.type === "voice" &&
        !trackStartTimes.has(t.url) &&
        (!t.isConcurrent || !t.concurrentGroup)
    );
    if (voiceTracks.length > 0) {
      // Position the first voice track at the beginning if not explicitly positioned
      const firstVoice = voiceTracks[0];
      if (firstVoice && !trackStartTimes.has(firstVoice.url)) {
        const actualDuration = getActualDuration(firstVoice.url);
        result.push({
          ...firstVoice,
          actualStartTime: 0,
          actualDuration: firstVoice.duration || actualDuration,
        });
        trackStartTimes.set(firstVoice.url, 0);

        // Process the rest of the voice tracks
        let currentTime = firstVoice.duration || actualDuration;
        for (let i = 1; i < voiceTracks.length; i++) {
          const voiceTrack = voiceTracks[i];
          if (trackStartTimes.has(voiceTrack.url)) continue;

          if (voiceTrack.playAfter) {
            // Use playAfter logic for this voice track
            let startTime = currentTime;
            if (voiceTrack.playAfter === "previous") {
              // Play after the previous voice track
              const prevTrack = voiceTracks[i - 1];
              if (trackStartTimes.has(prevTrack.url)) {
                const prevStart = trackStartTimes.get(prevTrack.url) || 0;
                const prevDuration =
                  prevTrack.duration || getActualDuration(prevTrack.url);
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
              // Find referenced track by URL
              const refTrack = trackList.find(
                (t) => t.url === voiceTrack.playAfter
              );
              if (refTrack && trackStartTimes.has(refTrack.url)) {
                const refStart = trackStartTimes.get(refTrack.url) || 0;
                const refDuration =
                  refTrack.duration || getActualDuration(refTrack.url);
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

            const actualDuration = getActualDuration(voiceTrack.url);
            result.push({
              ...voiceTrack,
              actualStartTime: startTime,
              actualDuration: actualDuration || voiceTrack.duration || 3,
            });
            trackStartTimes.set(voiceTrack.url, startTime);
            currentTime = startTime + (voiceTrack.duration || actualDuration);
          } else {
            // Sequential placement
            const actualDuration = getActualDuration(voiceTrack.url);
            result.push({
              ...voiceTrack,
              actualStartTime: currentTime,
              actualDuration: actualDuration || voiceTrack.duration || 3,
            });
            trackStartTimes.set(voiceTrack.url, currentTime);
            currentTime += voiceTrack.duration || actualDuration;
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
          const refTrackUrl = firstTrack.playAfter;
          const refTrackIndex = result.findIndex((t) => t.url === refTrackUrl);

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
        const actualDuration = getActualDuration(track.url);
        result.push({
          ...track,
          actualStartTime: groupStartTime,
          actualDuration: actualDuration || track.duration || 3,
        });
        trackStartTimes.set(track.url, groupStartTime);
      });
    });

    // Now handle music tracks - place at beginning or alongside voice tracks
    const musicTrack = trackList.find(
      (t) => t.type === "music" && !trackStartTimes.has(t.url)
    );
    if (musicTrack) {
      // Music starts at the beginning by default
      const startTime = 0;
      const actualDuration = getActualDuration(musicTrack.url);

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
        actualDuration: adjustedDuration || actualDuration || 3,
      });
      trackStartTimes.set(musicTrack.url, startTime);
    }

    // Handle sound FX tracks with relative positioning
    trackList
      .filter((t) => t.type === "soundfx" && !trackStartTimes.has(t.url))
      .forEach((track) => {
        // First, check if this is the final sound effect
        const soundFxTracks = trackList.filter(
          (t) =>
            t.type === "soundfx" &&
            (t.url.startsWith("blob:") ||
              t.url.startsWith("http:") ||
              t.url.startsWith("https:"))
        );
        const isFinalSoundEffect =
          soundFxTracks.indexOf(track) === soundFxTracks.length - 1;

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
          const actualDuration = getActualDuration(track.url);
          result.push({
            ...track,
            actualStartTime: track.startTime,
            actualDuration: actualDuration || track.duration || 3,
          });
          trackStartTimes.set(track.url, track.startTime);
        } else if (track.playAfter) {
          // Special case: If playAfter is "start", position at the beginning
          if (track.playAfter === "start") {
            const actualDuration = getActualDuration(track.url);
            result.push({
              ...track,
              actualStartTime: 0, // Position at the start of the timeline
              actualDuration: actualDuration || track.duration || 3,
            });
            trackStartTimes.set(track.url, 0);
          } else if (track.playAfter === "previous") {
            // Find the previous track in the list
            const trackIndex = trackList.indexOf(track);
            let referenceTrack: Track | undefined;

            if (trackIndex > 0) {
              referenceTrack = trackList[trackIndex - 1];
            } else if (result.length > 0) {
              // If this is the first track but we already have placed tracks, use the last placed track
              referenceTrack = result[result.length - 1];
            }

            if (referenceTrack && trackStartTimes.has(referenceTrack.url)) {
              const referenceStartTime =
                trackStartTimes.get(referenceTrack.url) || 0;
              const referenceDuration =
                referenceTrack.duration ||
                getActualDuration(referenceTrack.url);
              const referenceEndTime = referenceStartTime + referenceDuration;

              // Calculate start time based on playAfter and overlap
              let startTime = referenceEndTime;
              if (track.overlap && track.overlap > 0) {
                startTime = Math.max(
                  referenceStartTime,
                  referenceEndTime - track.overlap
                );
              }

              const actualDuration = getActualDuration(track.url);
              const duration = actualDuration || track.duration || 3;
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration: duration,
              });

              trackStartTimes.set(track.url, startTime);
            } else {
              // If reference track not found, place after all voice tracks
              const startTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 0;
              const actualDuration = getActualDuration(track.url);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration: actualDuration || track.duration || 3,
              });
              trackStartTimes.set(track.url, startTime);
            }
          } else {
            // Find by URL
            let referenceTrack = trackList.find(
              (t) => t.url === track.playAfter
            );

            // If not found by URL, try finding a voice with that ID (might be a voice ID)
            if (!referenceTrack) {
              referenceTrack = trackList.find(
                (t) =>
                  t.type === "voice" && t.label.includes(track.playAfter || "")
              );
            }

            if (referenceTrack && trackStartTimes.has(referenceTrack.url)) {
              const referenceStartTime =
                trackStartTimes.get(referenceTrack.url) || 0;
              const referenceDuration =
                referenceTrack.duration ||
                getActualDuration(referenceTrack.url);
              const referenceEndTime = referenceStartTime + referenceDuration;

              // Calculate start time based on playAfter and overlap
              let startTime = referenceEndTime;
              if (track.overlap && track.overlap > 0) {
                startTime = Math.max(
                  referenceStartTime,
                  referenceEndTime - track.overlap
                );
              }

              const actualDuration = getActualDuration(track.url);
              const duration = actualDuration || track.duration || 3;
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration: duration,
              });

              trackStartTimes.set(track.url, startTime);
            } else {
              // If reference track not found, place after all voice tracks
              const startTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 0;
              const actualDuration = getActualDuration(track.url);
              result.push({
                ...track,
                actualStartTime: startTime,
                actualDuration: actualDuration || track.duration || 3,
              });
              trackStartTimes.set(track.url, startTime);
            }
          }
        } else if (isFinalSoundEffect && lastVoiceEndTime > 0) {
          // Special case for final sound effect with no timing
          const actualDuration = getActualDuration(track.url);
          // Position the sound effect to start slightly before the last voice ends
          const startTime = Math.max(0, lastVoiceEndTime - 0.5);

          result.push({
            ...track,
            actualStartTime: startTime,
            actualDuration: actualDuration || track.duration || 3,
          });
          trackStartTimes.set(track.url, startTime);
        } else {
          // For sound effects with no explicit timing, distribute them evenly across the timeline
          // Find the total duration of all voice tracks
          const voiceDuration = lastVoiceEndTime;

          // Place sound effects at the beginning by default, or distribute if we have multiple
          const untimed = trackList.filter(
            (t) =>
              t.type === "soundfx" &&
              !trackStartTimes.has(t.url) &&
              !t.playAfter &&
              t.startTime === undefined
          );

          if (untimed.length > 1) {
            // Count how many sound effects we've already positioned with no timing info
            const positionedCount = result.filter(
              (t) =>
                t.type === "soundfx" &&
                !t.playAfter &&
                t.startTime === undefined
            ).length;

            // Calculate position based on distribution across voice duration
            const position = (positionedCount / untimed.length) * voiceDuration;
            const actualDuration = getActualDuration(track.url);

            result.push({
              ...track,
              actualStartTime: position,
              actualDuration: actualDuration || track.duration || 3,
            });
            trackStartTimes.set(track.url, position);
          } else {
            // If it's the only sound effect with no timing, place at beginning
            const actualDuration = getActualDuration(track.url);
            result.push({
              ...track,
              actualStartTime: 0,
              actualDuration: actualDuration || track.duration || 3,
            });
            trackStartTimes.set(track.url, 0);
          }
        }
      });

    // Process any remaining tracks
    trackList.forEach((track) => {
      // Skip already processed tracks
      if (trackStartTimes.has(track.url)) return;

      // Default placement - after all existing tracks
      const latestEndTime =
        result.length > 0
          ? Math.max(...result.map((t) => t.actualStartTime + t.actualDuration))
          : 0;

      const actualDuration = getActualDuration(track.url);
      const duration = actualDuration || track.duration || 3;
      result.push({
        ...track,
        actualStartTime: latestEndTime,
        actualDuration: duration,
      });
      trackStartTimes.set(track.url, latestEndTime);
    });

    return result;
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const voiceUrls = voiceTracks.map((t) => t.url);
      const musicUrl = musicTracks.length > 0 ? musicTracks[0].url : null;
      const soundFxUrls = soundFxTracks.map((t) => t.url);

      // Prepare timing information for the mixer
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => ({
        id: track.url,
        url: track.url,
        type: track.type,
        startTime: track.actualStartTime,
        duration: track.actualDuration,
        gain: trackVolumes[track.url],
      }));

      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo
      );

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mixed-audio.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export mix:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreview = async () => {
    try {
      setIsExporting(true);
      // Clean up previous preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      const voiceUrls = voiceTracks.map((t) => t.url);
      const musicUrl = musicTracks.length > 0 ? musicTracks[0].url : null;
      const soundFxUrls = soundFxTracks.map((t) => t.url);

      // Prepare timing information for the mixer
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => ({
        id: track.url,
        url: track.url,
        type: track.type,
        startTime: track.actualStartTime,
        duration: track.actualDuration,
        gain: trackVolumes[track.url],
      }));

      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo
      );
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error("Failed to create preview:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRemovePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Helper function to get colors based on track type
  const getTrackColor = (type: "voice" | "music" | "soundfx") => {
    switch (type) {
      case "voice":
        return "bg-sky-800 border-sky-500";
      case "music":
        return "bg-green-800 border-green-500";
      case "soundfx":
        return "bg-orange-800 border-orange-500";
      default:
        return "bg-gray-800 border-gray-500";
    }
  };

  // Format seconds as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get width percentage for timeline elements
  const getWidthPercent = (start: number, duration: number) => {
    if (totalDuration === 0) return { left: 0, width: 0 };
    const leftPercent = (start / totalDuration) * 100;
    const widthPercent = (duration / totalDuration) * 100;
    return { left: leftPercent, width: widthPercent };
  };

  // Clean up preview URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Render loading animation for a track
  const renderLoadingAnimation = (trackType: "voice" | "music" | "soundfx") => {
    let color = "bg-sky-300";
    if (trackType === "music") color = "bg-green-300";
    if (trackType === "soundfx") color = "bg-orange-300";

    return (
      <div className="flex items-center space-x-2 py-2 px-1">
        <div
          className={`w-2 h-2 ${color} rounded-full animate-pulse delay-0`}
        ></div>
        <div
          className={`w-2 h-2 ${color} rounded-full animate-pulse delay-150`}
        ></div>
        <div
          className={`w-2 h-2 ${color} rounded-full animate-pulse delay-300`}
        ></div>
        <div className="text-sm ml-2 text-gray-600">
          {trackType === "voice" && "Generating voice..."}
          {trackType === "music" && "Generating music..."}
          {trackType === "soundfx" && "Generating sound effect..."}
        </div>
      </div>
    );
  };

  // Render the audio player or error message for a track
  const renderAudioPlayer = (track: Track) => {
    // Show loading animation if track is loading
    if (isTrackLoading(track)) {
      return renderLoadingAnimation(track.type);
    }

    // Show error message if there's an issue with the audio
    if (audioErrors[track.url]) {
      return (
        <div className="bg-red-50 p-3 rounded text-red-600 text-sm mb-2">
          <div className="flex justify-between items-center">
            <div>
              <p>Unable to play audio. The file might be invalid.</p>
              <p className="text-xs mt-1">
                Try removing and recreating this track.
              </p>
              <button
                onClick={() => {
                  const audio = audioRefs.current[track.url];
                  if (audio) {
                    console.log(`Manual retry for ${track.label}...`);
                    audio.load();
                  }
                }}
                className="text-sm mt-1 underline text-red-700 hover:text-red-800"
              >
                Retry loading
              </button>
            </div>
            {onRemoveTrack && (
              <button
                onClick={() => onRemoveTrack(tracks.indexOf(track))}
                className="text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      );
    }

    // Show the audio player
    return (
      <audio
        controls
        src={track.url}
        className="w-full"
        ref={(el) => {
          if (el) {
            audioRefs.current[track.url] = el;
          }
          return undefined;
        }}
        onLoadedMetadata={() => {
          calculateTimingWithActualDurations();
          handleAudioLoaded(track.url);
        }}
        onError={() => handleAudioError(track.url, track.label)}
      >
        Your browser does not support the audio element.
      </audio>
    );
  };

  return (
    <div className="p-8 h-full bg-black text-white">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">STUDIO</h1>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase ml-12 ">
          Mixing Session
        </h2>
        <button
          onClick={handleReset}
          className="bg-gray-800 px-2.5 py-1.5 text-sm text-white ring-1 ring-inset ring-gray-700 hover:bg-gray-700"
        >
          Start Over
        </button>
      </div>

      {/* Timeline visualization */}
      {calculatedTracks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-2">Timeline</h3>
          <div
            ref={timelineRef}
            className="relative h-auto bg-gray-900 border border-gray-700 rounded p-2 overflow-x-auto"
          >
            {/* Time markers */}
            <div className="h-6 border-b border-gray-700 mb-2 relative">
              {[...Array(Math.min(11, totalDuration + 1))].map((_, i) => {
                const timePosition = i * (totalDuration / 10);
                const percent = (timePosition / totalDuration) * 100;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-3 border-l border-gray-600"
                    style={{ left: `${percent}%` }}
                  >
                    <div className="absolute top-3 text-xs text-gray-400 transform -translate-x-1/2">
                      {formatTime(timePosition)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Track visualizations by type */}
            <div className="space-y-2 pt-4">
              {/* Voice tracks */}
              {calculatedTracks
                .filter(
                  (t) =>
                    t.type === "voice" &&
                    t.url &&
                    (t.url.startsWith("blob:") ||
                      t.url.startsWith("http:") ||
                      t.url.startsWith("https:"))
                )
                .map((track, idx) => {
                  const { left, width } = getWidthPercent(
                    track.actualStartTime,
                    track.actualDuration
                  );
                  return (
                    <div className="relative h-8" key={`voice-${idx}`}>
                      <div
                        className={`absolute h-full rounded border ${getTrackColor(
                          "voice"
                        )} p-1 text-xs truncate`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {cleanTrackLabel(track.label)}
                      </div>
                    </div>
                  );
                })}

              {/* Music tracks */}
              {calculatedTracks
                .filter(
                  (t) =>
                    t.type === "music" &&
                    t.url &&
                    (t.url.startsWith("blob:") ||
                      t.url.startsWith("http:") ||
                      t.url.startsWith("https:"))
                )
                .map((track, idx) => {
                  const { left, width } = getWidthPercent(
                    track.actualStartTime,
                    track.actualDuration
                  );
                  return (
                    <div className="relative h-8" key={`music-${idx}`}>
                      <div
                        className={`absolute h-full rounded border ${getTrackColor(
                          "music"
                        )} p-1 text-xs truncate`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {cleanTrackLabel(track.label)}
                      </div>
                    </div>
                  );
                })}

              {/* Sound FX tracks */}
              {calculatedTracks
                .filter(
                  (t) =>
                    t.type === "soundfx" &&
                    t.url &&
                    (t.url.startsWith("blob:") ||
                      t.url.startsWith("http:") ||
                      t.url.startsWith("https:"))
                )
                .map((track, idx) => {
                  const { left, width } = getWidthPercent(
                    track.actualStartTime,
                    track.actualDuration
                  );
                  return (
                    <div className="relative h-8" key={`fx-${idx}`}>
                      <div
                        className={`absolute h-full rounded border ${getTrackColor(
                          "soundfx"
                        )} p-1 text-xs truncate`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {cleanTrackLabel(track.label)}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="text-xs text-gray-400 mt-2 italic">
              Total duration: {formatTime(totalDuration)}
            </div>
          </div>
        </div>
      )}

      {/* Track lists */}
      {(voiceTracks.length > 0 || isGeneratingVoice) && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Voice Tracks</h3>
          <div className="space-y-4">
            {isGeneratingVoice && voiceTracks.length === 0 && (
              <div className="p-4 bg-gray-800">
                {renderLoadingAnimation("voice")}
              </div>
            )}

            {voiceTracks.map((track, index) => {
              const calculatedTrack = calculatedTracks.find(
                (t) => t.url === track.url
              );
              return (
                <div key={index} className="p-4 bg-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-300">
                      {cleanTrackLabel(track.label)}
                    </p>
                    <div className="flex items-center gap-2">
                      {calculatedTrack && (
                        <span className="text-xs bg-sky-900 px-2 py-1 rounded border border-sky-800">
                          Starts at:{" "}
                          {formatTime(calculatedTrack.actualStartTime)}
                          {calculatedTrack.actualDuration && (
                            <span className="ml-1">
                              (Duration:{" "}
                              {calculatedTrack.actualDuration.toFixed(1)}s)
                            </span>
                          )}
                        </span>
                      )}
                      {onRemoveTrack && (
                        <button
                          onClick={() => onRemoveTrack(tracks.indexOf(track))}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div>{renderAudioPlayer(track)}</div>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-sm whitespace-nowrap">Volume:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackVolumes[track.url] || 1.0}
                      onChange={(e) =>
                        handleVolumeChange(
                          track.url,
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full"
                    />
                    <span className="text-sm whitespace-nowrap">
                      {Math.round((trackVolumes[track.url] || 1.0) * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(musicTracks.length > 0 || isGeneratingMusic) && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Music Track</h3>
          <div className="space-y-4">
            {isGeneratingMusic && musicTracks.length === 0 && (
              <div className="p-4 bg-gray-800">
                {renderLoadingAnimation("music")}
              </div>
            )}

            {musicTracks.map((track, index) => {
              const calculatedTrack = calculatedTracks.find(
                (t) => t.url === track.url
              );
              return (
                <div key={index} className="p-4 bg-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-300">
                      {cleanTrackLabel(track.label)}
                    </p>
                    <div className="flex items-center gap-2">
                      {calculatedTrack && (
                        <span className="text-xs bg-green-900 px-2 py-1 rounded border border-green-800">
                          Duration: {calculatedTrack.actualDuration.toFixed(1)}s
                        </span>
                      )}
                      {onRemoveTrack && (
                        <button
                          onClick={() => onRemoveTrack(tracks.indexOf(track))}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div>{renderAudioPlayer(track)}</div>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-sm whitespace-nowrap">Volume:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackVolumes[track.url] || 0.25}
                      onChange={(e) =>
                        handleVolumeChange(
                          track.url,
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full"
                    />
                    <span className="text-sm whitespace-nowrap">
                      {Math.round((trackVolumes[track.url] || 0.25) * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(soundFxTracks.length > 0 || isGeneratingSoundFx) && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Sound FX Tracks</h3>
          <div className="space-y-4">
            {isGeneratingSoundFx && soundFxTracks.length === 0 && (
              <div className="p-4 bg-gray-800">
                {renderLoadingAnimation("soundfx")}
              </div>
            )}

            {soundFxTracks.map((track, index) => {
              const calculatedTrack = calculatedTracks.find(
                (t) => t.url === track.url
              );
              return (
                <div key={index} className="p-4 bg-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-300">
                      {cleanTrackLabel(track.label)}
                    </p>
                    <div className="flex items-center gap-2">
                      {calculatedTrack && (
                        <span className="text-xs bg-orange-900 px-2 py-1 rounded border border-orange-800">
                          Starts at:{" "}
                          {formatTime(calculatedTrack.actualStartTime)}
                          {calculatedTrack.actualDuration && (
                            <span className="ml-1">
                              (Duration:{" "}
                              {calculatedTrack.actualDuration.toFixed(1)}s)
                            </span>
                          )}
                        </span>
                      )}
                      {onRemoveTrack && (
                        <button
                          onClick={() => onRemoveTrack(tracks.indexOf(track))}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div>{renderAudioPlayer(track)}</div>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-sm whitespace-nowrap">Volume:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={trackVolumes[track.url] || 0.7}
                      onChange={(e) =>
                        handleVolumeChange(
                          track.url,
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full"
                    />
                    <span className="text-sm whitespace-nowrap">
                      {Math.round((trackVolumes[track.url] || 0.7) * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Final Mix</h3>
          <div className="p-4 bg-gray-800">
            {previewUrl ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm text-gray-300">Mixed Audio Preview</p>
                  <button
                    onClick={handleRemovePreview}
                    className="text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <audio controls src={previewUrl} className="w-full mb-4">
                  Your browser does not support the audio element.
                </audio>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full px-4 py-2 bg-white text-black hover:bg-sky-500 hover:text-white disabled:opacity-50"
                >
                  {isExporting ? "Downloading..." : "Download Mix"}
                </button>
              </div>
            ) : (
              <button
                onClick={handlePreview}
                disabled={isExporting}
                className="w-full px-4 py-2 bg-white text-black text-lg font-semibold hover:bg-sky-500 hover:text-white disabled:opacity-50"
              >
                {isExporting ? "Processing..." : "Preview Mix"}
              </button>
            )}
          </div>
        </div>
      )}

      {tracks.length === 0 &&
        !isGeneratingVoice &&
        !isGeneratingMusic &&
        !isGeneratingSoundFx && (
          <p className="text-center text-gray-400 mt-12">
            No tracks available. Generate some voice, music, or sound FX tracks
            to get started.
          </p>
        )}
    </div>
  );
}
