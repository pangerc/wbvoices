import React from "react";
import { MixerTrack } from "@/store/mixerStore";

// Helper function to clean track labels
export function cleanTrackLabel(label: string): string {
  // Remove duration indicators like (30s), (15s), etc.
  return label.replace(/\s*\(\d+s\)\s*$/i, "");
}

// Helper function to extract just the character name from the label
export function extractCharacterName(label: string): string {
  const parts = label.split(":");
  if (parts.length > 0) {
    return parts[0].trim();
  }
  return label;
}

// Helper function to get colors based on track type
export function getTrackColor(type: "voice" | "music" | "soundfx") {
  switch (type) {
    case "voice":
      return "bg-white border-gray-800";
    case "music":
      return "bg-sky-950 border-sky-900";
    case "soundfx":
      return "bg-red-950 border-red-800";
    default:
      return "bg-gray-800 border-gray-500";
  }
}

// Get default volume based on track type
export function getDefaultVolumeForType(
  type: "voice" | "music" | "soundfx"
): number {
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
}

// Extended type for tracks that includes calculated timeline properties
export interface TimelineTrackData extends MixerTrack {
  actualStartTime: number;
  actualDuration: number;
}

type TimelineTrackProps = {
  track: TimelineTrackData;
  totalDuration: number;
  isVolumeDrawerOpen: boolean;
  trackVolume: number;
  audioError: boolean;
  playingState: boolean;
  playbackProgress: number;
  audioRef: (element: HTMLAudioElement | null) => void;
  onVolumeChange: (value: number) => void;
  onAudioLoaded: () => void;
  onAudioError: () => void;
  isTrackLoading: boolean;
};

export function TimelineTrack({
  track,
  totalDuration,
  isVolumeDrawerOpen,
  trackVolume,
  audioError,
  playingState,
  playbackProgress,
  audioRef,
  onVolumeChange,
  onAudioLoaded,
  onAudioError,
  isTrackLoading,
}: TimelineTrackProps) {
  // Get width percentage for timeline elements
  const getWidthPercent = (start: number, duration: number) => {
    if (totalDuration === 0) return { left: 0, width: 0 };

    // The key insight: we need to use the REAL duration values directly
    // This means calculating percentages based on the actual timeline range
    // without any artificial scaling

    // Simple direct calculation - position and width are simply percentages
    // of where they fall within the total timeline duration
    const leftPercent = (start / totalDuration) * 100;
    const widthPercent = (duration / totalDuration) * 100;

    console.log(`Percentage calculation for "${track.label}":`, {
      start,
      duration,
      totalDuration,
      calculatedLeftPercent: leftPercent,
      calculatedWidthPercent: widthPercent,
    });

    // Make sure width is at least the expected percentage (don't artificially limit)
    // This is important for accurate visualization of track durations
    return {
      left: Math.max(0, leftPercent),
      width: Math.max(0, widthPercent),
    };
  };

  const { left, width } = getWidthPercent(
    track.actualStartTime,
    track.actualDuration
  );

  // Enhanced debug information for all track types
  console.log(`Track visualization for "${track.label}" (${track.type}):`, {
    id: track.id,
    actualStartTime: track.actualStartTime,
    actualDuration: track.actualDuration,
    totalDuration,
    calculatedWidth: width,
    calculatedLeft: left,
    endsAt: track.actualStartTime + track.actualDuration,
    // Debug percentage calculation (using actual track timing data)
    startPercent: (track.actualStartTime / totalDuration) * 100,
    durationPercent: (track.actualDuration / totalDuration) * 100,
    // Additional debug data to see timing relationships
    rawTrackEndTime: track.actualStartTime + track.actualDuration,
    contentRatio:
      (track.actualStartTime + track.actualDuration) / totalDuration,
    // Show pixel values for easier debugging
    containerWidth: document.querySelector(".timeline")?.clientWidth || 0,
    estimatedPixelLeft:
      (left / 100) * (document.querySelector(".timeline")?.clientWidth || 1000),
    estimatedPixelWidth:
      (width / 100) *
      (document.querySelector(".timeline")?.clientWidth || 1000),
  });

  // Handle play/pause toggle
  const handlePlayPause = () => {
    const audio = document.querySelector(
      `audio[data-track-id="${track.id}"]`
    ) as HTMLAudioElement;
    if (audio) {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    }
  };

  // Get background color for the progress overlay
  const getProgressColor = (type: "voice" | "music" | "soundfx") => {
    switch (type) {
      case "voice":
        return "bg-sky-500 bg-opacity-30";
      case "music":
        return "bg-sky-700 bg-opacity-30";
      case "soundfx":
        return "bg-red-700 bg-opacity-30";
      default:
        return "bg-sky-500 bg-opacity-30";
    }
  };

  return (
    <div className="relative h-6 mb-2 flex items-center">
      {!isTrackLoading && !audioError && (
        <audio
          src={track.url}
          ref={audioRef}
          data-track-id={track.id}
          onLoadedMetadata={(e) => {
            const audio = e.currentTarget;
            if (audio && audio.duration && !isNaN(audio.duration)) {
              onAudioLoaded();
            }
          }}
          onError={onAudioError}
          className="hidden"
        >
          Your browser does not support the audio element.
        </audio>
      )}

      {/* Track ribbon container */}
      <div
        className={`relative ${
          isVolumeDrawerOpen ? "w-[calc(100%-100px)]" : "w-full"
        } h-full`}
      >
        {/* The actual colored ribbon - positioned within the track container */}
        <div
          className={`absolute h-full rounded-full ${getTrackColor(
            track.type
          )}`}
          style={{
            left: `${left}%`,
            width: `${width}%`, // Use exact width based on actual duration
            minWidth: "8px", // Use minWidth instead of percentage to ensure visibility
          }}
        >
          {/* Progress overlay */}
          {playingState && (
            <div
              className={`absolute top-0 left-0 h-full ${getProgressColor(
                track.type
              )} rounded-full transition-all`}
              style={{
                width: `${playbackProgress || 0}%`,
              }}
            ></div>
          )}

          {/* Track title that triggers playback */}
          <div
            className="px-3 py-1 h-full flex items-center cursor-pointer"
            onClick={handlePlayPause}
          >
            <div
              className={`font-medium text-xs truncate ${
                track.type === "voice" ? "text-black" : ""
              }`}
            >
              {track.type === "voice"
                ? extractCharacterName(cleanTrackLabel(track.label))
                : cleanTrackLabel(track.label)}
            </div>
          </div>

          {/* Static handle on the right */}
          <div className="absolute right-1 top-1.5 h-full w-4 cursor-pointer ">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 10 10"
              height="10"
              width="10"
              className="h-3 w-auto "
            >
              <path
                fill="#000000"
                d="M1.7854166666666669 1.42875a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
              <path
                fill="#000000"
                d="M1.7854166666666669 5a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
              <path
                fill="#000000"
                d="M1.7854166666666669 8.571666666666667a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
              <path
                fill="#000000"
                d="M5.357083333333334 1.42875a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
              <path
                fill="#000000"
                d="M5.357083333333334 5a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
              <path
                fill="#000000"
                d="M5.357083333333334 8.571666666666667a1.42875 1.42875 0 1 0 2.8575 0 1.42875 1.42875 0 1 0 -2.8575 0"
                strokeWidth="1"
              ></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Integrated volume slider - visible only when volume mode is active */}
      {isVolumeDrawerOpen && (
        <div className="ml-4 w-[80px] flex-shrink-0">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={trackVolume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-1"
          />
        </div>
      )}
    </div>
  );
}
