import React, { useEffect, useRef, useState, useCallback } from "react";
import { createMix, TrackTiming } from "@/utils/audio-mixer";
import { useMixerStore, MixerTrack } from "@/store/mixerStore";
import {
  TimelineTrack,
  TimelineTrackData,
  getDefaultVolumeForType,
} from "@/components/TimelineTrack";
import { ResetButton } from "@/components/ui/ResetButton";
import { VolumeToggleButton } from "@/components/ui/VolumeToggleButton";
import { PlayButton } from "@/components/ui/PlayButton";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { useParams } from "next/navigation";
import { uploadMixedAudioToBlob } from "@/utils/blob-storage";

type MixerPanelProps = {
  isGeneratingVoice?: boolean;
  isGeneratingMusic?: boolean;
  isGeneratingSoundFx?: boolean;
  resetForm: () => void;
};

export function MixerPanel({
  isGeneratingVoice = false,
  isGeneratingMusic = false,
  isGeneratingSoundFx = false,
  resetForm,
}: MixerPanelProps) {
  const params = useParams();
  const projectId = params.id as string;
  const { updateProject } = useProjectHistoryStore();

  // Get data and actions from store
  const {
    tracks,
    calculatedTracks,
    totalDuration,
    trackVolumes,
    audioErrors,
    loadingStates,
    isExporting,
    previewUrl,
    // We'll use removeTrack later when implementing full error handling
    // removeTrack,
    setTrackVolume,
    setTrackLoading,
    setTrackError,
    setAudioDuration,
    setPreviewUrl,
    setIsExporting,
    clearTracks,
  } = useMixerStore();

  // Reference to the timeline container for measuring width
  const timelineRef = useRef<HTMLDivElement>(null);

  // Track references map for audio elements
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  // Separate tracks by type for easier rendering
  const voiceTracks = tracks.filter((track) => track.type === "voice");
  const musicTracks = tracks.filter((track) => track.type === "music");
  const soundFxTracks = tracks.filter((track) => {
    if (track.type !== "soundfx") return false;

    // Basic URL validation - this helps filter out placeholder tracks
    const hasValidUrl =
      track.url &&
      (track.url.startsWith("blob:") ||
        track.url.startsWith("http:") ||
        track.url.startsWith("https:"));

    // Debug soundFx URL validation
    console.log(`SoundFx track "${track.label}" URL validation:`, {
      id: track.id,
      url: track.url,
      isValid: hasValidUrl,
    });

    return hasValidUrl;
  });

  // Handle audio error
  const handleAudioError = (id: string, label: string) => {
    console.error(`Error with audio for ${label}`);
    setTrackError(id, true);

    // Schedule a retry after a short delay
    setTimeout(() => {
      const audio = audioRefs.current[id];
      if (audio) {
        console.log(`Retrying load for ${label}...`);
        audio.load();
      }
    }, 500);
  };

  // Check if a track is in a loading state
  const isTrackLoading = (track: MixerTrack) => {
    // If audio has already loaded or errors are cleared, never show loading
    const audioElement = audioRefs.current[track.id];
    if (audioElement && audioElement.readyState >= 3) return false;

    // If there's an error loading this track, don't show loading animation
    if (audioErrors[track.id]) return false;

    // If the track is explicitly marked as loaded, don't show loading
    if (loadingStates[track.id] === false) return false;

    // For tracks that appear in the timeline view, never show as loading
    const calculatedTrack = calculatedTracks.find((t) => t.id === track.id);
    if (calculatedTrack) return false;

    // Check track-specific loading state first
    if (track.isLoading) return true;
    if (loadingStates[track.id]) return true;

    // Only check global generation state for tracks that don't have readyState or haven't been processed
    if (!audioElement) {
      if (track.type === "voice" && isGeneratingVoice) return true;
      if (track.type === "music" && isGeneratingMusic) return true;
      if (track.type === "soundfx" && isGeneratingSoundFx) return true;
    }

    return false;
  };

  // Track when audio becomes available - mark as loaded
  const handleAudioLoaded = (id: string) => {
    console.log(`Audio loaded for ${id}`);
    setTrackLoading(id, false);

    // Also clear any errors
    if (audioErrors[id]) {
      setTrackError(id, false);
    }
  };

  // Build audio refs for each track
  useEffect(() => {
    // Create audio elements to measure actual durations
    tracks.forEach((track) => {
      // If we already have a working audio element for this track, don't recreate it
      if (audioRefs.current[track.id] && !audioErrors[track.id]) {
        // If it's already loaded, mark it as loaded in our state
        const existingAudio = audioRefs.current[track.id];
        if (existingAudio && existingAudio.readyState >= 3) {
          handleAudioLoaded(track.id);
        }
        return;
      }

      if (!audioRefs.current[track.id]) {
        const audio = new Audio(track.url);

        // Add error handling for blob URL issues
        audio.onerror = () => {
          handleAudioError(track.id, track.label);
          // We'll keep the reference to retry loading later
        };

        // Handle successful load
        audio.onloadeddata = () => {
          handleAudioLoaded(track.id);
        };

        // Also handle canplaythrough event
        audio.oncanplaythrough = () => {
          handleAudioLoaded(track.id);
        };

        audioRefs.current[track.id] = audio;

        // Add event listener to update duration when metadata is loaded
        audio.addEventListener("loadedmetadata", () => {
          if (audio.duration && !isNaN(audio.duration)) {
            // Clear any previous error for this track
            if (audioErrors[track.id]) {
              setTrackError(track.id, false);
            }
            // Save actual duration
            setAudioDuration(track.id, audio.duration);

            // Debug sound FX track durations
            if (track.type === "soundfx") {
              console.log(
                `Setting duration for soundFx track "${track.label}":`,
                {
                  id: track.id,
                  actualDuration: audio.duration,
                  url: track.url,
                }
              );
            }

            // Mark as loaded
            handleAudioLoaded(track.id);
          }
        });

        // Force load metadata
        audio.load();
      } else if (audioRefs.current[track.id]) {
        // Always try to reload, even if no error, to ensure proper loading
        const audio = audioRefs.current[track.id];
        if (audio) {
          audio.load();
        }
      }
    });

    // Set up auto-retry mechanism for all tracks
    const retryTimeout = setTimeout(() => {
      const errorIds = Object.keys(audioErrors).filter((id) => audioErrors[id]);
      if (errorIds.length > 0) {
        console.log("Auto-retrying failed audio loads...");
        errorIds.forEach((id) => {
          const audio = audioRefs.current[id];
          if (audio) {
            audio.load();
          }
        });
      }
    }, 1000);

    // Cleanup function
    return () => {
      clearTimeout(retryTimeout);
    };
  }, [tracks, audioErrors]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper function to upload mixed audio and update project
  const uploadAndUpdateProject = async (blob: Blob, localPreviewUrl: string) => {
    if (!projectId) {
      console.warn('No project ID available for mixed audio upload');
      return { permanentUrl: localPreviewUrl, downloadUrl: localPreviewUrl };
    }

    try {
      console.log('📤 Uploading mixed audio to Vercel blob storage...');
      const { url: permanentUrl, downloadUrl } = await uploadMixedAudioToBlob(blob, projectId);
      console.log('✅ Mixed audio uploaded to blob:', permanentUrl);
      console.log('✅ Download URL generated:', downloadUrl);

      // Load current project to get existing preview data
      const { loadProjectFromRedis } = useProjectHistoryStore.getState();
      const currentProject = await loadProjectFromRedis(projectId);

      if (currentProject) {
        // Update project with the permanent mixed audio URL
        await updateProject(projectId, {
          preview: {
            brandName: currentProject.preview?.brandName || "",
            slogan: currentProject.preview?.slogan || "",
            destinationUrl: currentProject.preview?.destinationUrl || "",
            cta: currentProject.preview?.cta || "Learn More",
            logoUrl: currentProject.preview?.logoUrl,
            visualUrl: currentProject.preview?.visualUrl,
            mixedAudioUrl: permanentUrl,
          },
          lastModified: Date.now(),
        });
        console.log('✅ Project updated with permanent mixed audio URL');
      } else {
        console.warn('⚠️ Could not load current project, only updating lastModified');
        await updateProject(projectId, {
          lastModified: Date.now(),
        });
      }

      return { permanentUrl, downloadUrl };
    } catch (error) {
      console.error('❌ Failed to upload mixed audio or update project:', error);
      // Return the local preview URL as fallback
      return { permanentUrl: localPreviewUrl, downloadUrl: localPreviewUrl };
    }
  };

  // Handle local reset
  const handleReset = () => {
    // Clean up preview URL if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Clear all tracks
    clearTracks();

    // Call parent reset
    resetForm();
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const voiceUrls = voiceTracks.map((t) => t.url);
      const musicUrl = musicTracks.length > 0 ? musicTracks[0].url : null;
      const soundFxUrls = soundFxTracks.map((t) => t.url);

      // Prepare timing information for the mixer
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => {
        const timing = {
          id: track.id,
          url: track.url,
          type: track.type,
          startTime: track.actualStartTime,
          duration: track.actualDuration,
          gain: trackVolumes[track.id] || getDefaultVolumeForType(track.type),
        };

        // IMPORTANT: Use the visualized duration for music to match the timeline
        // We used to use originalDuration here, but that creates an inconsistency
        // between what's shown and what's heard
        if (track.type === "music" && track.metadata?.originalDuration) {
          // Only add a small fade-out buffer if needed
          const playbackDuration = track.actualDuration;
          timing.duration = playbackDuration;
          console.log(
            `Using visualized music duration for mixing: ${timing.duration}s (original was ${track.metadata.originalDuration}s)`
          );
        }

        // Debug timing info
        console.log(`Track timing for ${track.label} (${track.type}):`, {
          startTime: timing.startTime,
          duration: timing.duration,
          gain: timing.gain,
        });

        return timing;
      });

      // Sort timing info to ensure correct playback order (important for sound effects before voices)
      timingInfo.sort((a, b) => a.startTime - b.startTime);
      console.log(
        "Sorted timing info for mixer:",
        timingInfo.map((t) => ({
          id: t.id,
          type: t.type,
          startTime: t.startTime,
          duration: t.duration,
        }))
      );

      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo
      );

      // Upload to blob storage and update project
      const localPreviewUrl = URL.createObjectURL(blob);
      const { permanentUrl, downloadUrl } = await uploadAndUpdateProject(blob, localPreviewUrl);

      // Create download link using Vercel's downloadUrl for forced download
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up local URL
      URL.revokeObjectURL(localPreviewUrl);

      console.log(`✅ Audio exported successfully`);
      console.log(`📊 Audio specs: 44.1kHz, 16-bit, Stereo WAV, -16 LUFS, -2.0 dBTP peak limit`);
    } catch (error) {
      console.error("Failed to export mix:", error);
    } finally {
      setIsExporting(false);
    }
  };

  // Add state for playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // For tracking if volume has changed
  const hasVolumeChangedRef = useRef(false);

  // Effect to invalidate preview when volume changes
  useEffect(() => {
    // Skip this effect during initial render
    if (!hasVolumeChangedRef.current) {
      hasVolumeChangedRef.current = true;
      return;
    }

    // Avoid regenerating preview when not playing
    if (!previewUrl || !isPlaying) {
      return;
    }

    // Use a debounce to prevent rapid regeneration
    const debounceTime = 500; // ms
    const debounceTimerId = setTimeout(() => {
      console.log(
        "Volume settings changed, regenerating preview on next play..."
      );

      // Instead of regenerating immediately, just invalidate the current preview
      // so it will be regenerated on next play
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
        setIsPlaying(false);
      }
    }, debounceTime);

    return () => clearTimeout(debounceTimerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackVolumes]);

  const handlePreview = async () => {
    try {
      // Always regenerate the preview regardless of existing URL
      setIsExporting(true);
      console.log("Generating preview mix...");

      // Clean up previous preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      // Make sure we have all valid URLs for tracks
      const voiceUrls = voiceTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http"))
        )
        .map((t) => t.url);

      const musicUrl =
        musicTracks.length > 0 && musicTracks[0].url
          ? musicTracks[0].url
          : null;

      const soundFxUrls = soundFxTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http"))
        )
        .map((t) => t.url);

      // Log what we're mixing to debug
      console.log("Audio sources for mixing:", {
        voiceCount: voiceUrls.length,
        hasMusic: !!musicUrl,
        soundFxCount: soundFxUrls.length,
      });

      // Debug calculated tracks
      console.log("All calculated tracks:", calculatedTracks);
      console.log("Total duration:", totalDuration);
      console.log("Track sources:", { voiceUrls, musicUrl, soundFxUrls });

      // Prepare timing information for the mixer
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => {
        const timing = {
          id: track.id,
          url: track.url,
          type: track.type,
          startTime: track.actualStartTime,
          duration: track.actualDuration,
          gain: trackVolumes[track.id] || getDefaultVolumeForType(track.type),
        };

        // IMPORTANT: Use the visualized duration for music to match the timeline
        // We used to use originalDuration here, but that creates an inconsistency
        // between what's shown and what's heard
        if (track.type === "music" && track.metadata?.originalDuration) {
          // Only add a small fade-out buffer if needed
          const playbackDuration = track.actualDuration;
          timing.duration = playbackDuration;
          console.log(
            `Using visualized music duration for mixing: ${timing.duration}s (original was ${track.metadata.originalDuration}s)`
          );
        }

        // Debug timing info
        console.log(`Track timing for ${track.label} (${track.type}):`, {
          startTime: timing.startTime,
          duration: timing.duration,
          gain: timing.gain,
        });

        return timing;
      });

      // Sort timing info to ensure correct playback order (important for sound effects before voices)
      timingInfo.sort((a, b) => a.startTime - b.startTime);
      console.log(
        "Sorted timing info for mixer:",
        timingInfo.map((t) => ({
          id: t.id,
          type: t.type,
          startTime: t.startTime,
          duration: t.duration,
        }))
      );

      // Create the mixed audio
      console.log("Creating mix with timing:", timingInfo);
      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo
      );

      const localPreviewUrl = URL.createObjectURL(blob);
      console.log("Mixed audio blob created:", localPreviewUrl);
      
      // Upload to blob storage and update project (async, don't block preview)
      uploadAndUpdateProject(blob, localPreviewUrl).catch(error => {
        console.error("Background upload failed:", error);
      });
      
      setPreviewUrl(localPreviewUrl);

      // Set up the playback audio element if it doesn't exist yet
      if (!playbackAudioRef.current) {
        console.log("Creating new Audio element");
        const audio = new Audio();

        // Set up event listeners before setting the source
        audio.addEventListener("canplaythrough", () => {
          console.log("Audio can play through");
        });

        audio.addEventListener("error", (e) => {
          console.error("Audio playback error:", e);
        });

        audio.addEventListener("ended", () => {
          console.log("Audio playback ended");
          setIsPlaying(false);
          setPlaybackPosition(0);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        });

        // Set the source AFTER adding all event listeners
        audio.src = localPreviewUrl;
        playbackAudioRef.current = audio;
      } else {
        // If audio element exists, update its source
        console.log("Updating existing Audio element source");
        const audio = playbackAudioRef.current;

        // Pause first to avoid abort errors
        if (!audio.paused) {
          audio.pause();
        }

        // Reset audio to avoid carrying over state
        audio.currentTime = 0;

        // Update source
        audio.src = localPreviewUrl;
      }

      // Try to preload
      if (playbackAudioRef.current) {
        playbackAudioRef.current.load();
      }

      console.log("Preview generation completed");
      return localPreviewUrl; // Return the URL for chaining
    } catch (error) {
      console.error("Failed to create preview:", error);
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handlePlayPause = async () => {
    console.log("Play/Pause button clicked, current state:", {
      isPlaying,
      hasPreviewUrl: !!previewUrl,
      hasAudioRef: !!playbackAudioRef.current,
    });

    // If currently playing, stop (not pause) and reset
    if (isPlaying) {
      console.log("Stopping playback and resetting");
      const audio = playbackAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
        setPlaybackPosition(0);

        // Revoke old preview URL to force regeneration next time
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }

        // Stop the animation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      } else {
        console.error("Audio element not found when trying to stop");
      }
      return;
    }

    // Handle play
    try {
      // Always regenerate the preview to ensure we have the latest mix with all tracks
      console.log("Generating new preview mix...");
      const url = await handlePreview();
      if (!url) {
        console.error("Failed to generate preview");
        return;
      }

      // At this point we should have a valid playback audio reference
      const audio = playbackAudioRef.current;
      if (!audio) {
        console.error(
          "Audio element still not available after preview generation"
        );
        return;
      }

      // Start playback
      console.log("Starting playback with audio element:", audio);
      try {
        await audio.play();
        console.log("Playback started successfully");
        setIsPlaying(true);
        startPlaybackAnimation();
      } catch (error) {
        console.error("Playback failed:", error);
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Error in play/pause handler:", error);
      setIsPlaying(false);
    }
  };

  const startPlaybackAnimation = useCallback(() => {
    console.log("Starting playback animation");

    // Cancel any existing animation before starting a new one
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const updatePosition = () => {
      const audio = playbackAudioRef.current;
      if (!audio) {
        console.warn("No audio element available for animation");
        return;
      }

      if (audio.paused || audio.ended) {
        console.log("Audio paused or ended, stopping animation");
        setIsPlaying(false);
        setPlaybackPosition(0);
        return;
      }

      // Only update position if we have valid duration and current time
      if (
        audio.duration &&
        !isNaN(audio.duration) &&
        !isNaN(audio.currentTime)
      ) {
        const position = (audio.currentTime / audio.duration) * 100;
        setPlaybackPosition(position);

        // Debug every second or so
        if (Math.floor(audio.currentTime) % 2 === 0) {
          console.log(
            `Playback progress: ${position.toFixed(
              1
            )}% (${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(
              1
            )}s)`
          );
        }
      }

      // Continue the animation
      animationFrameRef.current = requestAnimationFrame(updatePosition);
    };

    // Start the animation
    animationFrameRef.current = requestAnimationFrame(updatePosition);
  }, [setIsPlaying, setPlaybackPosition]);

  // Hidden audio element for playback
  const HiddenAudio = () => (
    <audio
      ref={(el) => {
        // Only use this ref if we don't already have a playback ref
        if (el && !playbackAudioRef.current) {
          console.log("Audio element reference created from JSX");
          playbackAudioRef.current = el;

          el.addEventListener("canplaythrough", () => {
            console.log("Audio can play through (mounted element)");
          });

          el.addEventListener("error", (e) => {
            console.error("Audio playback error (mounted element):", e);
          });

          el.addEventListener("play", () => {
            console.log("Audio play event from mounted element");
            setIsPlaying(true);
            startPlaybackAnimation();
          });

          el.addEventListener("pause", () => {
            console.log("Audio pause event from mounted element");
            setIsPlaying(false);
          });
        }
      }}
      style={{ display: "none" }}
      controls={false}
      onEnded={() => {
        console.log("Audio playback ended (onEnded event)");
        setIsPlaying(false);
        setPlaybackPosition(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }}
      preload="auto"
      src={previewUrl || undefined}
    />
  );

  // Create a function to sync play state and UI state
  const ensureCorrectPlayState = useCallback(() => {
    if (!playbackAudioRef.current) return;

    const audio = playbackAudioRef.current;
    const isAudioPlaying =
      !audio.paused && !audio.ended && audio.currentTime > 0;

    // If our UI state doesn't match the actual audio state, fix it
    if (isPlaying !== isAudioPlaying) {
      console.log("Fixing play state mismatch:", {
        uiState: isPlaying,
        audioState: isAudioPlaying,
      });
      setIsPlaying(isAudioPlaying);

      if (isAudioPlaying && !animationFrameRef.current) {
        startPlaybackAnimation();
      }
    }
  }, [isPlaying, startPlaybackAnimation]);

  // Effect to monitor playback state
  useEffect(() => {
    let syncInterval: NodeJS.Timeout | null = null;

    if (previewUrl && playbackAudioRef.current) {
      syncInterval = setInterval(ensureCorrectPlayState, 500);
    }

    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [previewUrl, ensureCorrectPlayState]);

  // Custom volume change handler to add a delay
  const handleVolumeChange = (trackId: string, value: number) => {
    console.log(`Setting volume for track ${trackId} to ${value}`);
    setTrackVolume(trackId, value);
  };

  // Format seconds as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Adjust markers to make sure they go to exactly the total duration
  const getTotalMarkers = () => {
    // For durations that are exact seconds (like 19.0), include that second
    // For durations with partial seconds (like 19.2), round up to the next second (20)
    return Math.ceil(totalDuration) + (Number.isInteger(totalDuration) ? 1 : 0);
  };

  // Render loading animation for a track
  const renderLoadingAnimation = (trackType: "voice" | "music" | "soundfx") => {
    let color = "bg-sky-300";
    if (trackType === "music") color = "bg-sky-700";
    if (trackType === "soundfx") color = "bg-red-700";

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

  // Create state to track playing status for each track
  const [playingTracks, setPlayingTracks] = React.useState<{
    [key: string]: boolean;
  }>({});

  // Create state to track playback progress for each track
  const [playbackProgress, setPlaybackProgress] = React.useState<{
    [key: string]: number;
  }>({});

  // Create state to track volume drawer visibility
  const [isVolumeDrawerOpen, setIsVolumeDrawerOpen] = React.useState(false);

  // Set up play/pause event listeners for audio elements
  useEffect(() => {
    // Set up event listeners for all audio elements
    Object.keys(audioRefs.current).forEach((trackId) => {
      const audio = audioRefs.current[trackId];
      if (!audio) return;

      // Add play event listener
      const handlePlay = () => {
        setPlayingTracks((prev) => ({ ...prev, [trackId]: true }));
      };

      // Add pause event listener
      const handlePause = () => {
        setPlayingTracks((prev) => ({ ...prev, [trackId]: false }));
      };

      // Add ended event listener
      const handleEnded = () => {
        setPlayingTracks((prev) => ({ ...prev, [trackId]: false }));
        setPlaybackProgress((prev) => ({ ...prev, [trackId]: 0 }));
      };

      // Add timeupdate event listener for progress tracking
      const handleTimeUpdate = () => {
        if (audio.duration) {
          const progress = (audio.currentTime / audio.duration) * 100;
          setPlaybackProgress((prev) => ({ ...prev, [trackId]: progress }));
        }
      };

      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("timeupdate", handleTimeUpdate);

      // Return cleanup function for this specific audio element
      return () => {
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
      };
    });
  }, [tracks, calculatedTracks]);

  // Debug calculated tracks for each type
  useEffect(() => {
    if (calculatedTracks.length > 0) {
      const voiceCalcTracks = calculatedTracks.filter(
        (t) => t.type === "voice"
      );
      const musicCalcTracks = calculatedTracks.filter(
        (t) => t.type === "music"
      );
      const soundFxCalcTracks = calculatedTracks.filter(
        (t) => t.type === "soundfx"
      );

      console.log("Calculated tracks analysis:", {
        totalDuration,
        voiceTracks: voiceCalcTracks.map((t) => ({
          id: t.id,
          label: t.label,
          start: t.actualStartTime,
          duration: t.actualDuration,
          percentOfTotal: (t.actualDuration / totalDuration) * 100,
        })),
        musicTracks: musicCalcTracks.map((t) => ({
          id: t.id,
          label: t.label,
          start: t.actualStartTime,
          duration: t.actualDuration,
          percentOfTotal: (t.actualDuration / totalDuration) * 100,
        })),
        soundFxTracks: soundFxCalcTracks.map((t) => ({
          id: t.id,
          label: t.label,
          start: t.actualStartTime,
          duration: t.actualDuration,
          percentOfTotal: (t.actualDuration / totalDuration) * 100,
        })),
      });
    }
  }, [calculatedTracks, totalDuration]);

  // Function to handle setting audio reference
  const handleAudioRef = (id: string) => (element: HTMLAudioElement | null) => {
    audioRefs.current[id] = element;
  };

  return (
    <div className="py-8 text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">
            Make It All Come Together
          </h1>
          <h2 className="font-medium mb-12">
            Preview and export your fully produced audio ad. Ready when you are.{" "}
          </h2>
        </div>
        {/* Reset button */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />

          {tracks.length > 0 && (
            <>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-wb-blue/30 hover:border-wb-blue/50 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:bg-gray-700/50 disabled:border-gray-600/30 disabled:text-gray-400 rounded-full text-white transition-all duration-200"
              >
                {isExporting ? "Exporting..." : "Export"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Timeline visualization with embedded audio controls */}
      {calculatedTracks.length > 0 && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg ">Timeline</h3>
            <PlayButton
              isPlaying={isPlaying}
              onClick={handlePlayPause}
              disabled={isExporting || tracks.length === 0}
            />
          </div>
          <div
            ref={timelineRef}
            className="relative bg-white/3 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden timeline"
          >
            {/* Playback indicator line - positioned absolutely and doesn't interfere with mouse events */}
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-green-500 z-10 pointer-events-none"
                style={{ left: `${playbackPosition}%` }}
              />
            )}

            {/* Time markers */}
            <div
              className={`h-7 border-b border-white/20 mb-4 relative px-2 ${
                isVolumeDrawerOpen ? "opacity-0" : ""
              }`}
            >
              {/* Create markers that properly span the entire duration */}
              {Array.from({ length: getTotalMarkers() }).map((_, i) => {
                // Calculate position based on actual seconds, not just percentage
                const seconds = i;
                const percent = (seconds / totalDuration) * 100;

                return (
                  <div
                    key={i}
                    className="absolute top-0 h-3 border-l border-white/30"
                    style={{ left: `${percent}%` }}
                  >
                    <div className="absolute top-3 text-xs text-gray-400 transform -translate-x-1/2">
                      {formatTime(seconds)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* timeline with audio tracks */}
            <div
              className={`px-4 pb-4 ${
                isVolumeDrawerOpen
                  ? "bg-gradient-to-r from-transparent to-gray-900/80"
                  : ""
              }`}
            >
              {/* Voice tracks */}
              {calculatedTracks
                .filter((track) => track.type === "voice")
                .map((track) => (
                  <TimelineTrack
                    key={track.id}
                    track={track as TimelineTrackData}
                    totalDuration={totalDuration}
                    isVolumeDrawerOpen={isVolumeDrawerOpen}
                    trackVolume={
                      trackVolumes[track.id] || getDefaultVolumeForType("voice")
                    }
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => {
                      const audio = audioRefs.current[track.id];
                      if (audio && audio.duration && !isNaN(audio.duration)) {
                        setAudioDuration(track.id, audio.duration);
                      }
                      handleAudioLoaded(track.id);
                    }}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                  />
                ))}

              {/* Music tracks */}
              {calculatedTracks
                .filter((track) => track.type === "music")
                .map((track) => (
                  <TimelineTrack
                    key={track.id}
                    track={track as TimelineTrackData}
                    totalDuration={totalDuration}
                    isVolumeDrawerOpen={isVolumeDrawerOpen}
                    trackVolume={
                      trackVolumes[track.id] || getDefaultVolumeForType("music")
                    }
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => {
                      const audio = audioRefs.current[track.id];
                      if (audio && audio.duration && !isNaN(audio.duration)) {
                        setAudioDuration(track.id, audio.duration);
                      }
                      handleAudioLoaded(track.id);
                    }}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                  />
                ))}

              {/* Sound FX tracks */}
              {calculatedTracks
                .filter((track) => track.type === "soundfx")
                .map((track) => (
                  <TimelineTrack
                    key={track.id}
                    track={track as TimelineTrackData}
                    totalDuration={totalDuration}
                    isVolumeDrawerOpen={isVolumeDrawerOpen}
                    trackVolume={
                      trackVolumes[track.id] ||
                      getDefaultVolumeForType("soundfx")
                    }
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => {
                      const audio = audioRefs.current[track.id];
                      if (audio && audio.duration && !isNaN(audio.duration)) {
                        setAudioDuration(track.id, audio.duration);
                      }
                      handleAudioLoaded(track.id);
                    }}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                  />
                ))}
            </div>

            {/* Volume Controls Toggle */}
            <div className="absolute top-0 right-0">
              <VolumeToggleButton
                isOpen={isVolumeDrawerOpen}
                onClick={() => setIsVolumeDrawerOpen(!isVolumeDrawerOpen)}
              />
            </div>

            <div className="px-4 text-xs text-gray-400 mt-2 mb-2 italic">
              Total duration: {formatTime(totalDuration)}
            </div>
          </div>
        </div>
      )}

      {/* Loading states for asset generation */}
      <div className="mt-8">
        {isGeneratingVoice && voiceTracks.length === 0 && (
          <div className="text-2xl">{renderLoadingAnimation("voice")}</div>
        )}

        {isGeneratingMusic && musicTracks.length === 0 && (
          <div className="text-2xl">{renderLoadingAnimation("music")}</div>
        )}

        {isGeneratingSoundFx && soundFxTracks.length === 0 && (
          <div className="text-2xl">{renderLoadingAnimation("soundfx")}</div>
        )}
      </div>

      {/* Hidden audio element for playback */}
      <HiddenAudio />

      {/* Add visible indicator for debugging */}
      <div className="text-xs text-gray-500 mt-4">
        {isPlaying
          ? "Playing: " + Math.round(playbackPosition) + "%"
          : previewUrl
          ? "Ready to play"
          : "No preview generated"}
      </div>
    </div>
  );
}
