import React, { useEffect, useRef } from "react";
import { createMix, TrackTiming } from "@/utils/audio-mixer";
import { useMixerStore, MixerTrack } from "@/store/mixerStore";
import {
  TimelineTrack,
  TimelineTrackData,
  getDefaultVolumeForType,
} from "@/components/TimelineTrack";

type NewMixerPanelProps = {
  isGeneratingVoice?: boolean;
  isGeneratingMusic?: boolean;
  isGeneratingSoundFx?: boolean;
  resetForm: () => void;
};

export function NewMixerPanel({
  isGeneratingVoice = false,
  isGeneratingMusic = false,
  isGeneratingSoundFx = false,
  resetForm,
}: NewMixerPanelProps) {
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
  }, [tracks, audioErrors]);

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
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => ({
        id: track.id,
        url: track.url,
        type: track.type,
        startTime: track.actualStartTime,
        duration: track.actualDuration,
        gain: trackVolumes[track.id] || getDefaultVolumeForType(track.type),
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

      // Debug calculated tracks
      console.log("All calculated tracks:", calculatedTracks);

      // Debug totalDuration
      console.log("Total duration:", totalDuration);

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

        // Debug soundFx timing info
        if (track.type === "soundfx") {
          console.log("SoundFx timing info:", timing);
        }

        return timing;
      });

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

  // Format seconds as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
          <button
            onClick={handleReset}
            className="text-sm text-white hover:underline hover:cursor-pointer"
          >
            <svg
              viewBox="-0.5 -0.5 16 16"
              xmlns="http://www.w3.org/2000/svg"
              height="16"
              width="16"
              className="ml-2 h-4 w-auto"
            >
              <path
                d="m11.465 5.75 -2.375 -4.1762500000000005a1.875 1.875 0 0 0 -3.25 0l-0.66125 1.14375"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="M7.46375 12.5625H12.1875a1.875 1.875 0 0 0 1.625 -2.8125l-0.8125 -1.40625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m3.4962500000000003 5.53 -2.375 4.21875a1.875 1.875 0 0 0 1.625 2.8125h1.9075"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m9.338750000000001 10.68625 -1.875 1.875 1.875 1.875"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m12.151250000000001 3.18625 -0.68625 2.56125 -2.56125 -0.68625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m0.935 6.21625 2.56125 -0.68625 0.68625 2.56125"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
            </svg>
          </button>

          {tracks.length > 0 && (
            <>
              <button
                onClick={handlePreview}
                disabled={isExporting}
                className="px-6 py-3 bg-sky-600 hover:bg-green-700 rounded-full text-white  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? "Generating..." : "Preview"}
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="px-6 py-3 bg-sky-600 hover:bg-green-700 rounded-full text-white  disabled:opacity-50 disabled:cursor-not-allowed"
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
          <h3 className="text-lg font-semibold mb-2">Timeline</h3>
          <div
            ref={timelineRef}
            className="relative bg-black/60 border border-gray-700 rounded-2xl overflow-hidden"
          >
            {/* Time markers */}
            <div
              className={`h-7 border-b border-gray-700 mb-4 relative px-2 ${
                isVolumeDrawerOpen ? "opacity-0" : ""
              }`}
            >
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

            {/* timeline with audio tracks */}
            <div className="px-4 pb-4">
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
                    onVolumeChange={(value) => setTrackVolume(track.id, value)}
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
                    onVolumeChange={(value) => setTrackVolume(track.id, value)}
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
                    onVolumeChange={(value) => setTrackVolume(track.id, value)}
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
              <button
                className={`px-3 py-1 rounded-t-full rounded-bl-full text-xs border-b border-gray-700 ${
                  isVolumeDrawerOpen
                    ? "bg-gray-600 text-white"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                }`}
                onClick={() => setIsVolumeDrawerOpen(!isVolumeDrawerOpen)}
              >
                {isVolumeDrawerOpen ? "Hide Volume" : "Volume"}
              </button>
            </div>

            <div className="px-4 text-xs text-gray-400 mt-2 mb-2 italic">
              Total duration: {formatTime(totalDuration)}
            </div>
          </div>
        </div>
      )}

      {/* Preview and Export buttons */}

      {/* Preview player */}
      {previewUrl && (
        <div className="mt-8 ">
          <div className="flex justify-between items-center mb-2">
            <p className="text-lg text-white">Mixed Audio Preview</p>
            <div className="flex items-center  gap-4 pb-2">
              <button
                onClick={handleRemovePreview}
                className="text-red-700 text-sm hover:text-red-300 pt-2"
              >
                Remove
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="mt-2 px-4 py-1 bg-sky-600 hover:bg-sky-300 rounded-full text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? "Exporting..." : "Save as File"}
              </button>
            </div>
          </div>
          <audio controls src={previewUrl} className="w-full" autoPlay>
            Your browser does not support the audio element.
          </audio>
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
    </div>
  );
}
