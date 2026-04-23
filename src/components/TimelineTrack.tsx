import React, { useState, useRef, useEffect, useMemo } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/solid";
import { MixerTrack, useMixerStore } from "@/store/mixerStore";
import { useWaveform } from "@/hooks/useWaveform";

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
   * the opt/alt modifier (force an absolute anchor vs proximity-derived);
   * `allowPastFormat` signals the user held shift to override the soft
   * format-duration clamp.
   */
  onDrop?: (
    trackId: string,
    dropSeconds: number,
    forceAbsolute: boolean,
    allowPastFormat: boolean
  ) => void;
  /**
   * Called when a tail-trim (right-edge) drag completes. `newTrim` is the
   * post-drag trim window clamped to [0, sourceDuration]. Null signals
   * "clear trim" — not used by the edge-drag path today but supported so
   * the data-flow contract matches the eventual reset-to-seed action.
   */
  onTrim?: (trackId: string, newTrim: { start: number; end: number } | null) => void;
  /** This track is the currently-hovered one (the "inspected" clip). */
  isHovered?: boolean;
  /** This track is the outbound anchor target of the currently-hovered track. */
  isHoverTarget?: boolean;
  /** This track is anchored to the currently-hovered track (inbound dependent). */
  isHoverDependent?: boolean;
  /** Track is muted — ribbon dims; silent in render/playback. */
  isMuted?: boolean;
  /** Track is in the solo group — ribbon highlights. */
  isSoloed?: boolean;
  /** At least one track on the timeline is soloed and this one isn't (implicit mute). */
  isImplicitlyMuted?: boolean;
  /** Store actions threaded from MixerPanel so the dropdown can flip state. */
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
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
  onTrim,
  isHoverTarget = false,
  isHoverDependent = false,
  isHovered = false,
  isMuted = false,
  isSoloed = false,
  isImplicitlyMuted = false,
  onToggleMute,
  onToggleSolo,
}: TimelineTrackProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Drag state. `ribbonRef` is the ribbon DOM node so we can measure the
  // timeline container width at drag-start without threading a ref down.
  // `trimHandleRef` is the dedicated right-edge trim handle — pointer-downs
  // whose target is inside that element put the session into trim mode.
  const ribbonRef = useRef<HTMLDivElement>(null);
  const trimHandleRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    originX: number;
    pxPerSecond: number;
    mode: "reposition" | "trimEnd";
    originSeconds: number;
    /** Effective duration at drag-start; drives trim-preview pixel math. */
    originEffectiveDuration: number;
    dragStarted: boolean;
  } | null>(null);
  const setDragPreview = useMixerStore((s) => s.setDragPreview);
  const dragPreview = useMixerStore((s) =>
    s.dragPreview?.trackId === track.id ? s.dragPreview : null
  );
  const setTrimPreview = useMixerStore((s) => s.setTrimPreview);
  const trimPreview = useMixerStore((s) =>
    s.trimPreview?.trackId === track.id ? s.trimPreview : null
  );
  const setHoveredTrackId = useMixerStore((s) => s.setHoveredTrackId);
  const anyDragInProgress = useMixerStore(
    (s) => s.dragPreview !== null || s.trimPreview !== null
  );
  const DRAG_THRESHOLD_PX = 4;

  // Waveform peaks for this clip. Decoded lazily on mount; cached by URL
  // so reposition/trim remounts reuse the same data. Renders as an SVG
  // symmetric envelope inside the ribbon behind the title text.
  const { peaks } = useWaveform(track.url, 200);
  const waveformPath = useMemo(() => buildWaveformPath(peaks), [peaks]);

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
    if (e.button !== 0) return;
    if (!onDrop && !onTrim) return;

    // Ignore pointerdowns inside the menu button — it owns its click handler
    // and we don't want drag capture stealing its tap.
    if (menuRef.current?.contains(e.target as Node)) return;

    const timelineContainer = ribbonRef.current?.closest(
      ".timeline"
    ) as HTMLElement | null;
    if (!timelineContainer) return;
    const rect = timelineContainer.getBoundingClientRect();
    if (rect.width <= 0 || totalDuration <= 0) return;

    // Hit-test the dedicated trim handle. If the user grabbed that, we switch
    // the session into tail-trim mode (resize right edge). Otherwise it's a
    // reposition drag.
    const isTrim = trimHandleRef.current?.contains(e.target as Node) ?? false;

    dragSessionRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      pxPerSecond: rect.width / totalDuration,
      mode: isTrim ? "trimEnd" : "reposition",
      originSeconds: track.actualStartTime,
      originEffectiveDuration: track.actualDuration,
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

    if (session.mode === "trimEnd") {
      // Clamp the live preview so the ribbon doesn't visually invert or
      // extend past the raw source duration. The final persisted value is
      // clamped again server-side for defense in depth.
      const sourceDuration = track.duration ?? session.originEffectiveDuration;
      const minEffectivePx = 0.1 * session.pxPerSecond;
      const maxEffectiveSeconds = Math.max(
        sourceDuration - (track.trim?.start ?? 0),
        0.1
      );
      const maxDeltaPx =
        (maxEffectiveSeconds - session.originEffectiveDuration) *
        session.pxPerSecond;
      const minDeltaPx = minEffectivePx - session.originEffectiveDuration * session.pxPerSecond;
      const clampedDelta = Math.max(minDeltaPx, Math.min(maxDeltaPx, deltaPx));
      setTrimPreview({
        trackId: track.id,
        edge: "end",
        deltaPx: clampedDelta,
      });
      return;
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
      // Short tap — play/pause path (reposition mode only; a tap on the trim
      // handle with no drag is a no-op).
      if (session.mode === "reposition") handlePlayPause();
      setDragPreview(null);
      setTrimPreview(null);
      return;
    }

    if (session.mode === "trimEnd") {
      // Compute the new trim window and PATCH. Keep the preview set until
      // the server confirms + SWR hydrates, same flash-avoidance pattern as
      // reposition drags.
      const deltaPx = e.clientX - session.originX;
      const sourceDuration = track.duration ?? session.originEffectiveDuration;
      const trimStart = track.trim?.start ?? 0;
      const newEffective = Math.max(
        0.1,
        Math.min(
          sourceDuration - trimStart,
          session.originEffectiveDuration + deltaPx / session.pxPerSecond
        )
      );
      const newTrim = {
        start: trimStart,
        end: trimStart + newEffective,
      };
      try {
        await onTrim?.(track.id, newTrim);
      } finally {
        setTrimPreview(null);
      }
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
      await onDrop?.(track.id, dropSeconds, e.altKey, e.shiftKey);
    } finally {
      setDragPreview(null);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    setDragPreview(null);
    setTrimPreview(null);
    dragSessionRef.current = null;
  };

  // While dragging this specific track, render from the preview so the ribbon
  // follows the cursor with no server round-trip. When no drag is active,
  // fall through to the server-provided actualStartTime.
  const visibleTranslatePx = dragPreview?.deltaPx ?? 0;
  /**
   * Live width delta for in-flight trim preview. Added to the ribbon's base
   * width via CSS calc so the visual keeps pace with the cursor with no
   * server round-trip. Cleared when the patch resolves in onTrim.
   */
  const trimWidthDeltaPx = trimPreview?.deltaPx ?? 0;

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
          data-track-ribbon="true"
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
          className={`absolute h-full rounded-full backdrop-blur-sm overflow-hidden ${
            track.type === "voice"
              ? "bg-white/15 border border-white/20"
              : track.type === "music"
              ? "bg-wb-blue/20 border border-wb-blue/25"
              : "bg-red-500/20 border border-red-500/25"
          } ${isMenuOpen ? "z-50" : "z-0"} ${
            dragPreview ? "cursor-grabbing opacity-80" : "cursor-grab"
          } ${
            // Hovered clip gets a bright white ring so you can see which one
            // you're actually inspecting. The relationship glows (below) live
            // on the OTHER clips — never on the hovered clip itself.
            isHovered
              ? "ring-2 ring-white/80 ring-offset-1 ring-offset-black/50"
              : ""
          } ${
            // Mute/solo visual state. Soloed tracks get a yellow ring that
            // reads as "this one is isolated." Muted (or implicitly muted
            // because something else is soloed) ribbons dim to ~35% — still
            // visible so you can unmute, but clearly stepped-back.
            isSoloed
              ? "ring-2 ring-yellow-400/70"
              : ""
          } ${isMuted || isImplicitlyMuted ? "opacity-35" : ""}`}
          style={{
            left: `${left}%`,
            width:
              trimWidthDeltaPx !== 0
                ? `calc(${width}% + ${trimWidthDeltaPx}px)`
                : `${width}%`,
            minWidth: "8px",
            transform: visibleTranslatePx
              ? `translateX(${visibleTranslatePx}px)`
              : undefined,
            touchAction: "none",
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

          {/* Waveform envelope. Symmetric around the ribbon's vertical
              center, scaled to fit via preserveAspectRatio="none". Sits
              behind the title text — lower opacity on voice (dark text
              on light ribbon needs more contrast) than music/sfx. */}
          {waveformPath && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 200 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={waveformPath}
                fill={track.type === "voice" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)"}
              />
            </svg>
          )}

          {/* Anchor-relationship glow overlays. Half-ribbon gradients that
              point toward the connection edge:
                - Outbound target (this clip is anchored to BY the hover):
                  glow on the right half, brightest at the right edge —
                  that's where `relativeTo(this, "end")` anchors land.
                - Inbound dependent (this clip anchors TO the hover): glow
                  on the left half, brightest at the left edge — that's
                  where this clip's own start connects to the hovered
                  clip's end. */}
          {isHoverTarget && (
            <div
              className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-r from-transparent to-white/40 pointer-events-none"
              aria-hidden="true"
            />
          )}
          {isHoverDependent && (
            <div
              className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-l from-transparent to-white/40 pointer-events-none"
              aria-hidden="true"
            />
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

          {/* Tail-trim handle — thin vertical bar at the inner side of the
              menu area. Clicking+dragging horizontally resizes the clip's
              right edge, writing overrides.trim.end. Visible only on hover
              of the ribbon (opacity 0 otherwise) so it doesn't clutter. */}
          {onTrim && (
            <div
              ref={trimHandleRef}
              className={`absolute right-6 top-1 bottom-1 w-[3px] rounded-sm bg-white/50 hover:bg-white/80 cursor-ew-resize z-[2] transition-opacity ${
                isHovered || trimPreview ? "opacity-100" : "opacity-0"
              }`}
              aria-label="Trim tail"
            />
          )}

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
                {onToggleMute && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onToggleMute(track.id);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center justify-between"
                  >
                    <span>{isMuted ? "Unmute" : "Mute"}</span>
                    {isMuted && <span className="text-xs text-gray-400">M</span>}
                  </button>
                )}
                {onToggleSolo && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onToggleSolo(track.id);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center justify-between border-t border-white/10"
                  >
                    <span>{isSoloed ? "Unsolo" : "Solo"}</span>
                    {isSoloed && <span className="text-xs text-yellow-400">S</span>}
                  </button>
                )}
                {(onToggleMute || onToggleSolo) && (
                  <div className="border-t border-white/10" />
                )}
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

/**
 * Build an SVG path string for a symmetric waveform envelope. Maps `peaks`
 * (length N, values in [0, 1]) into a viewBox of 200×100 with the wave
 * mirrored around y=50. Returns null for empty inputs so callers can skip
 * rendering entirely (avoids an empty <path> node in the DOM).
 */
function buildWaveformPath(peaks: number[]): string | null {
  if (!peaks || peaks.length === 0) return null;
  const width = 200;
  const height = 100;
  const center = height / 2;
  const n = peaks.length;
  const stepX = width / n;

  // Build a closed polygon: top edge left→right, then bottom edge right→left.
  // Each bucket is drawn as a vertical bar of half-height proportional to peak;
  // the polygon interpolates between them to produce a smooth envelope.
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * stepX;
    const half = Math.max(0.5, peaks[i] * (center - 1)); // min 1px so silent stretches still draw
    top.push(`${x.toFixed(2)},${(center - half).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)},${(center + half).toFixed(2)}`);
  }
  return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}
