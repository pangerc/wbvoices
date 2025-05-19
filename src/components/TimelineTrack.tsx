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

    // Calculate position as percentage of total duration
    const leftPercent = (start / totalDuration) * 100;
    const widthPercent = (duration / totalDuration) * 100;

    // Ensure the track doesn't extend beyond the timeline
    const adjustedWidth =
      start + duration > totalDuration
        ? ((totalDuration - start) / totalDuration) * 100
        : widthPercent;

    return {
      left: Math.max(0, leftPercent),
      width: Math.max(0, adjustedWidth),
    };
  };

  const { left, width } = getWidthPercent(
    track.actualStartTime,
    track.actualDuration
  );

  // Debug information only for voice tracks to reduce console spam
  if (track.type === "voice") {
    console.log(`Voice track "${track.label}":`, {
      id: track.id,
      actualStartTime: track.actualStartTime,
      actualDuration: track.actualDuration,
      totalDuration,
      calculatedWidth: width,
      calculatedLeft: left,
      endsAt: track.actualStartTime + track.actualDuration,
    });
  }

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
            width: `${Math.max(width, 5)}%`, // Ensure minimum width for visibility
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
