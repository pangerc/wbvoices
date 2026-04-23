import React, { useState, useRef, useEffect } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
import { MixerTrack, useMixerStore } from "@/store/mixerStore";

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

// Helper function to get glass props based on track type
export function getTrackGlassProps(type: "voice" | "music" | "soundfx") {
  switch (type) {
    case "voice":
      return {
        className: "rounded-full",
        style: {
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
        },
        displacementScale: 24,
        blurAmount: 0.03,
        elasticity: 0.15,
        cornerRadius: 100,
      };
    case "music":
      return {
        className: "rounded-full",
        style: {
          backgroundColor: "rgba(47, 125, 250, 0.12)",
          border: "1px solid rgba(47, 125, 250, 0.2)",
        },
        displacementScale: 28,
        blurAmount: 0.04,
        elasticity: 0.2,
        cornerRadius: 100,
      };
    case "soundfx":
      return {
        className: "rounded-full",
        style: {
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
        },
        displacementScale: 28,
        blurAmount: 0.04,
        elasticity: 0.2,
        cornerRadius: 100,
      };
    default:
      return {
        className: "rounded-full",
        style: {
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        },
        displacementScale: 20,
        blurAmount: 0.02,
        elasticity: 0.1,
        cornerRadius: 100,
      };
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
  // Track action callbacks
  onChangeVoice?: () => void;
  onChangeMusic?: () => void;
  onChangeSoundFx?: () => void;
  onRemove?: (trackId: string) => void;
  /**
   * Called when a drop completes. `dropSeconds` is the new timeline position
   * of the dragged track's left edge; `forceAbsolute` signals the user held
   * the opt/alt modifier (force an absolute anchor vs proximity-derived).
   */
  onDrop?: (trackId: string, dropSeconds: number, forceAbsolute: boolean) => void;
  /** This track is the outbound anchor target of the currently-hovered track. */
  isHoverTarget?: boolean;
  /** This track is anchored to the currently-hovered track (inbound dependent). */
  isHoverDependent?: boolean;
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
  onChangeVoice,
  onChangeMusic,
  onChangeSoundFx,
  onRemove,
  onDrop,
  isHoverTarget = false,
  isHoverDependent = false,
}: TimelineTrackProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Drag state. `ribbonRef` is the ribbon DOM node so we can measure the
  // timeline container width at drag-start without threading a ref down.
  const ribbonRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    originX: number;
    pxPerSecond: number;
    originSeconds: number;
    dragStarted: boolean;
  } | null>(null);
  const setDragPreview = useMixerStore((s) => s.setDragPreview);
  const dragPreview = useMixerStore((s) =>
    s.dragPreview?.trackId === track.id ? s.dragPreview : null
  );
  const setHoveredTrackId = useMixerStore((s) => s.setHoveredTrackId);
  const anyDragInProgress = useMixerStore((s) => s.dragPreview !== null);
  const DRAG_THRESHOLD_PX = 4;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isMenuOpen]);

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

  // Handle download
  const handleDownload = async () => {
    try {
      const response = await fetch(track.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${cleanTrackLabel(track.label)}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download track:", error);
    }
  };

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

  // ============ Drag lifecycle ============
  //
  // Distinguishes click (play/pause) from drag (reposition) by movement
  // threshold. Drag promotes on first pointermove past DRAG_THRESHOLD_PX.

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary button, not when clicking menu / audio controls nested inside.
    if (e.button !== 0) return;
    if (!onDrop) return;
    const timelineContainer = ribbonRef.current?.closest(
      ".timeline"
    ) as HTMLElement | null;
    if (!timelineContainer) return;
    const rect = timelineContainer.getBoundingClientRect();
    if (rect.width <= 0 || totalDuration <= 0) return;

    dragSessionRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      pxPerSecond: rect.width / totalDuration,
      originSeconds: track.actualStartTime,
      dragStarted: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    const deltaPx = e.clientX - session.originX;

    if (!session.dragStarted) {
      if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
      session.dragStarted = true;
    }

    const deltaSeconds = deltaPx / session.pxPerSecond;
    const dropSeconds = Math.max(0, session.originSeconds + deltaSeconds);
    setDragPreview({
      trackId: track.id,
      deltaPx,
      dropSeconds,
      forceAbsolute: e.altKey,
    });
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer was never captured (rare race). Ignore.
    }
    dragSessionRef.current = null;

    if (!session.dragStarted) {
      // Short tap — play/pause path. No anchor to persist.
      handlePlayPause();
      setDragPreview(null);
      return;
    }

    // Keep dragPreview set (ribbon stays translated to drop position) until
    // the PATCH resolves and SWR hydrates. This prevents the "jump back,
    // then jump forward" flash: the ribbon holds its dropped position during
    // the network round-trip, then lands once the server's new actualStartTime
    // flows through.
    const deltaPx = e.clientX - session.originX;
    const deltaSeconds = deltaPx / session.pxPerSecond;
    const dropSeconds = Math.max(0, session.originSeconds + deltaSeconds);
    try {
      await onDrop?.(track.id, dropSeconds, e.altKey);
    } finally {
      setDragPreview(null);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    setDragPreview(null);
    dragSessionRef.current = null;
  };

  // While dragging this specific track, render from the preview so the ribbon
  // follows the cursor with no server round-trip. When no drag is active,
  // fall through to the server-provided actualStartTime.
  const visibleTranslatePx = dragPreview?.deltaPx ?? 0;

  // Get background color for the progress overlay
  const getProgressColor = (type: "voice" | "music" | "soundfx") => {
    switch (type) {
      case "voice":
        return "bg-white/30";
      case "music":
        return "bg-wb-blue/30";
      case "soundfx":
        return "bg-red-500/30";
      default:
        return "bg-white/30";
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
          ref={ribbonRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onMouseEnter={() => {
            if (anyDragInProgress) return;
            setHoveredTrackId(track.id);
          }}
          onMouseLeave={() => {
            if (anyDragInProgress) return;
            setHoveredTrackId(null);
          }}
          className={`absolute h-full rounded-full backdrop-blur-sm ${
            track.type === "voice"
              ? "bg-white/15 border border-white/20"
              : track.type === "music"
              ? "bg-wb-blue/20 border border-wb-blue/25"
              : "bg-red-500/20 border border-red-500/25"
          } ${isMenuOpen ? "z-50" : "z-0"} ${
            dragPreview ? "cursor-grabbing opacity-80" : "cursor-grab"
          } ${
            // Anchor-relationship highlighting. Cyan = the dragged hover track
            // is anchored TO this one (outbound); Amber = this track is
            // anchored to the hover target (inbound dependent). The two rings
            // are mutually exclusive in practice — a slot can only reference
            // one other, and the hovered slot can only have one target.
            isHoverTarget
              ? "ring-2 ring-cyan-400/70 ring-offset-1 ring-offset-black/40"
              : isHoverDependent
              ? "ring-2 ring-amber-400/60 ring-offset-1 ring-offset-black/40"
              : ""
          }`}
          style={{
            left: `${left}%`,
            width: `${width}%`, // Use exact width based on actual duration
            minWidth: "8px", // Use minWidth instead of percentage to ensure visibility
            transform: visibleTranslatePx
              ? `translateX(${visibleTranslatePx}px)`
              : undefined,
            touchAction: "none", // let pointer events drive drag, not the browser
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

          {/* Track title. Click-to-play/pause is now handled by the ribbon's
              pointer-up click path (distinguishes tap from drag). */}
          <div className="px-3 py-1 h-full flex items-center pointer-events-none">
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

          {/* Handle with menu */}
          <div className="absolute right-1 top-0 h-full w-4 flex items-center" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="cursor-pointer hover:opacity-70 transition-opacity"
              title="Track actions"
            >
              <EllipsisVerticalIcon className="h-3 w-3 text-black" />
            </button>

            {/* Dropdown menu */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
                {track.type === "voice" && onChangeVoice && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onChangeVoice();
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    Change voice
                  </button>
                )}
                {track.type === "music" && onChangeMusic && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onChangeMusic();
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    Change music
                  </button>
                )}
                {track.type === "soundfx" && onChangeSoundFx && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onChangeSoundFx();
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    Change effect
                  </button>
                )}
                {onRemove && (track.type === "music" || track.type === "soundfx") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onRemove(track.id);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/10"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    handleDownload();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors border-t border-white/10"
                >
                  Download
                </button>
              </div>
            )}
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
