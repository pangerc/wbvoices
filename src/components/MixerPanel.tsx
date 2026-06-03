import { LoudnessMeter } from "@/components/LoudnessMeter";
import { TimelineTrack, TimelineTrackData } from "@/components/TimelineTrack";
import { PlayButton, ResetButton } from "@/components/ui/buttons";
import { useMixerData } from "@/hooks/useMixerData";
import { MixerTrack, useMixerStore } from "@/store/mixerStore";
import { createMix, TrackTiming } from "@/utils/audio-mixer";
import { uploadMixedAudioToBlob } from "@/utils/blob-storage";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

type MixerPanelProps = {
  isGeneratingVoice?: boolean;
  isGeneratingMusic?: boolean;
  isGeneratingSoundFx?: boolean;
  resetForm: () => void;
  // Track action callbacks
  onChangeVoice?: () => void;
  onChangeMusic?: () => void;
  onChangeSoundFx?: () => void;
  onRemoveTrack?: (trackId: string) => void;
};

export function MixerPanel({
  isGeneratingVoice = false,
  isGeneratingMusic = false,
  isGeneratingSoundFx = false,
  resetForm,
  onChangeVoice,
  onChangeMusic,
  onChangeSoundFx,
  onRemoveTrack,
}: MixerPanelProps) {
  const params = useParams();
  const adId = params.id as string;

  // Fetch mixer state from Redis via SWR (source of truth)
  const {
    data: mixerSWR,
    patchAnchors,
    patchTrim,
    startNewTake,
    activateMixerVersion,
  } = useMixerData(adId);

  // Anchor-relationship hover highlighting. The hovered track and the two
  // derived slot ids (its ref target and the set of dependents that point at
  // it) are computed once and passed down as per-track flags — avoids each
  // TimelineTrack subscribing to the hover store with its own selector.
  const hoveredTrackId = useMixerStore((s) => s.hoveredTrackId);

  // Get data and actions from store
  const {
    tracks,
    calculatedTracks,
    totalDuration,
    formatDuration,
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
    setPreviewUrl,
    setIsExporting,
    setIsUploadingMix,
    setIsPreviewValid,
    setUploadError,
    clearTracks,
    hydrateFromMixer,
  } = useMixerStore();
  const mixerActiveVersionId = useMixerStore((s) => s.mixerActiveVersionId);
  const mixerActiveVersionStatus = useMixerStore(
    (s) => s.mixerActiveVersionStatus,
  );
  const mixerVersions = useMixerStore((s) => s.mixerVersions);
  const mutedTrackIds = useMixerStore((s) => s.mutedTrackIds);
  const soloedTrackIds = useMixerStore((s) => s.soloedTrackIds);
  const toggleMute = useMixerStore((s) => s.toggleMute);
  const toggleSolo = useMixerStore((s) => s.toggleSolo);
  const anyTrackSoloed = soloedTrackIds.size > 0;

  /**
   * Drop handler for timeline drags. Resolves the proximity anchor using the
   * slot ids surfaced on the track list and persists via PATCH. The server
   * forks a frozen mixer version into a draft if needed. Response is
   * optimistic-mutated back into SWR by patchAnchors.
   */
  const handleTrackDrop = useCallback(
    async (
      trackId: string,
      dropSeconds: number,
      forceAbsolute: boolean,
      allowPastFormat: boolean,
    ) => {
      const draggedTrack = tracks.find((t) => t.id === trackId);
      const draggedSlotId = draggedTrack?.slotId;
      if (!draggedSlotId) {
        console.warn(
          `[mixer-drop] track ${trackId} has no slotId; cannot persist anchor`,
        );
        return;
      }

      const others = calculatedTracks
        .filter((ct) => ct.id !== trackId)
        .map((ct) => {
          const slotId = tracks.find((t) => t.id === ct.id)?.slotId;
          if (!slotId) return null;
          return {
            slotId,
            startTime: ct.actualStartTime,
            duration: ct.actualDuration,
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);

      // Build the slot-id → referenced-slot-id map so anchorFromDrop can
      // detect cycles and fall back to absolute rather than produce an
      // un-resolvable graph (the resolver would bounce cyclic slots to t=0,
      // which manifests as clips collapsing onto each other).
      const existingRefs: Record<string, string | undefined> = {};
      for (const t of tracks) {
        if (t.slotId) existingRefs[t.slotId] = t.anchorRefSlotId;
      }

      const { anchorFromDrop } = await import("@/services/anchorFromDrop");
      const anchor = anchorFromDrop(draggedSlotId, dropSeconds, others, {
        forceAbsolute,
        existingRefs,
        formatDuration,
        allowPastFormat,
      });

      // Hydrate the store eagerly from the server response so the ribbon's
      // new `left: {%}` and the cleared drag preview land on the same render
      // frame. Relying on the existing SWR→useEffect→hydrateFromMixer chain
      // leaves one frame where the ribbon is at its stale position with the
      // drag translate cleared — visible as a flash.
      const updated = await patchAnchors({ [draggedSlotId]: anchor });
      if (updated) hydrateFromMixer(updated);
    },
    [tracks, calculatedTracks, formatDuration, patchAnchors, hydrateFromMixer],
  );

  /**
   * Start a new take. Server freezes the current draft (preserving it in
   * the take list), forks it, activates the new draft. Eager-hydrate so
   * the Takes menu flips to the new version id on the same render frame.
   */
  const handleNewTake = useCallback(async () => {
    const defaultLabel = new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const updated = await startNewTake(defaultLabel);
    if (updated) hydrateFromMixer(updated);
    setIsTakesMenuOpen(false);
  }, [startNewTake, hydrateFromMixer]);

  /**
   * Switch the active mixer version. Server auto-freezes any outgoing
   * draft first so no work is lost.
   */
  const handleActivateTake = useCallback(
    async (versionId: string) => {
      if (versionId === mixerActiveVersionId) {
        setIsTakesMenuOpen(false);
        return;
      }
      const updated = await activateMixerVersion(versionId);
      if (updated) hydrateFromMixer(updated);
      setIsTakesMenuOpen(false);
    },
    [activateMixerVersion, hydrateFromMixer, mixerActiveVersionId],
  );

  /**
   * Tail-trim handler. Persists a clamped trim window on the mixer draft
   * and eagerly hydrates the store from the server response so the ribbon
   * lands at its new width in one motion (same flash-avoidance pattern as
   * the reposition drop path).
   */
  const handleTrackTrim = useCallback(
    async (trackId: string, newTrim: { start: number; end: number } | null) => {
      const trimmedTrack = tracks.find((t) => t.id === trackId);
      const slotId = trimmedTrack?.slotId;
      if (!slotId) {
        console.warn(`[mixer-trim] track ${trackId} has no slotId; skipping`);
        return;
      }
      const updated = await patchTrim({ [slotId]: newTrim });
      if (updated) hydrateFromMixer(updated);
    },
    [tracks, patchTrim, hydrateFromMixer],
  );

  /**
   * Reset a track's anchor back to its stream-level seed. Sends a null
   * value to patchAnchors, which the server interprets as "re-derive from
   * the pinned stream version via anchorFromX translators" and writes
   * with origin=llm-seed.
   */
  const handleResetPosition = useCallback(
    async (trackId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      const slotId = track?.slotId;
      if (!slotId) {
        console.warn(`[mixer-reset] track ${trackId} has no slotId; skipping`);
        return;
      }
      const updated = await patchAnchors({ [slotId]: null });
      if (updated) hydrateFromMixer(updated);
    },
    [tracks, patchAnchors, hydrateFromMixer],
  );

  /**
   * The timeline's visible extent, hoisted early so `startPlaybackAnimation`
   * can use it as the denominator for the playhead position. Using
   * `audio.duration` (which matches totalDuration) would cause the playhead
   * to drift past the last clip when formatDuration > totalDuration,
   * because the timeline is wider than the content.
   */
  const displayDuration = Math.max(totalDuration, formatDuration ?? 0, 1);

  /**
   * Pointer-based seek + scrub on the timeline. Pointerdown outside any
   * track ribbon starts a scrub session: captures the pointer, seeks to
   * the initial position, then continues seeking on every pointermove
   * until release. Clicks inside a ribbon fall through to the ribbon's
   * own pointer handlers (play/pause, drag to reposition, edge-drag to
   * trim).
   *
   * If no audio is loaded yet (preview hasn't been generated), the
   * playhead still moves visually; next Play picks up from that position
   * via audio.currentTime.
   */
  const scrubSessionRef = useRef<{ pointerId: number } | null>(null);

  const seekToPointerX = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (rect.width <= 0 || displayDuration <= 0) return;
      const x = clientX - rect.left;
      const seconds = Math.max(
        0,
        Math.min(displayDuration, (x / rect.width) * displayDuration),
      );
      const percent = (seconds / displayDuration) * 100;
      const audio = playbackAudioRef.current;
      if (audio && audio.duration && !isNaN(audio.duration)) {
        audio.currentTime = Math.min(audio.duration, seconds);
      }
      setPlaybackPosition(percent);
    },
    [displayDuration],
  );

  const handleTimelinePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      // Track ribbons handle their own pointer events.
      if (target.closest("[data-track-ribbon]")) return;
      // Bail on any interactive control that lives in the timeline
      // chrome (kebab trigger button, dropdown menu, format-horizon
      // overlay, etc.). Capturing the pointer for scrubbing here would
      // steal their click events. Tags covered: buttons, inputs,
      // anchors, selects, and anything explicitly opted out via
      // data-no-timeline-scrub.
      if (
        target.closest(
          "button, input, select, textarea, a, [role='button'], [role='menuitem'], [data-no-timeline-scrub]",
        )
      ) {
        return;
      }
      scrubSessionRef.current = { pointerId: e.pointerId };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      seekToPointerX(e.clientX, e.currentTarget.getBoundingClientRect());
    },
    [seekToPointerX],
  );

  const handleTimelinePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = scrubSessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      seekToPointerX(e.clientX, e.currentTarget.getBoundingClientRect());
    },
    [seekToPointerX],
  );

  const handleTimelinePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = scrubSessionRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      scrubSessionRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer already released — ignore
      }
    },
    [],
  );

  // Hydrate Zustand store from SWR data (Redis is source of truth).
  // Server already calculated positions in rebuildMixer; client never recalculates.
  useEffect(() => {
    if (!mixerSWR?.tracks || mixerSWR.tracks.length === 0) return;

    const currentTrackIds = new Set(tracks.map((t) => t.id));
    const swrTrackIds = new Set(mixerSWR.tracks.map((t) => t.id));
    const currentTrackUrls = new Map(tracks.map((t) => [t.id, t.url]));

    const hasUrlChanges = mixerSWR.tracks.some(
      (swrTrack) => currentTrackUrls.get(swrTrack.id) !== swrTrack.url,
    );
    const hasPositionChanges = mixerSWR.calculatedTracks?.some((swrCalc) => {
      const local = calculatedTracks.find((c) => c.id === swrCalc.id);
      return !local || local.actualStartTime !== swrCalc.startTime;
    });

    const needsHydration =
      tracks.length === 0 ||
      currentTrackIds.size !== swrTrackIds.size ||
      ![...swrTrackIds].every((id) => currentTrackIds.has(id)) ||
      hasUrlChanges ||
      hasPositionChanges;

    if (needsHydration) {
      console.log("🔄 Hydrating mixer store from SWR", {
        swrTracks: mixerSWR.tracks.length,
        storeTracks: tracks.length,
        activeVersions: mixerSWR.activeVersions,
      });
      hydrateFromMixer(mixerSWR);
    }
  }, [mixerSWR]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reference to the timeline container for measuring width
  const timelineRef = useRef<HTMLDivElement>(null);

  // Track references map for audio elements
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});

  // Derive hover-role slot ids once per render. `hoveredRefSlotId` is the
  // anchor target of whatever track is currently hovered (outbound). Inbound
  // dependents are computed per-track below via `anchorRefSlotId ===
  // hoveredSlotId`.
  const hoveredTrack = tracks.find((t) => t.id === hoveredTrackId);
  const hoveredSlotId = hoveredTrack?.slotId;
  const hoveredRefSlotId = hoveredTrack?.anchorRefSlotId;
  const hoverRoleFor = (
    trackId: string,
    trackSlotId?: string,
    anchorRef?: string,
  ) => ({
    isHovered: trackId === hoveredTrackId,
    isHoverTarget: !!hoveredRefSlotId && trackSlotId === hoveredRefSlotId,
    isHoverDependent:
      !!hoveredSlotId && !!anchorRef && anchorRef === hoveredSlotId,
  });

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
      // If we already have a working audio element for this track, check if URL changed
      if (audioRefs.current[track.id] && !audioErrors[track.id]) {
        const existingAudio = audioRefs.current[track.id];

        // Check if URL changed (e.g., user re-generated with different provider)
        // If so, update src and reload to get the new audio
        if (existingAudio && existingAudio.src !== track.url) {
          existingAudio.src = track.url;
          existingAudio.load();
          return;
        }

        // If it's already loaded with correct URL, mark it as loaded in our state
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

        // Server provides authoritative durations via generatedDuration on each version;
        // clear any previous error once the element reports metadata.
        audio.addEventListener("loadedmetadata", () => {
          if (audio.duration && !isNaN(audio.duration)) {
            if (audioErrors[track.id]) {
              setTrackError(track.id, false);
            }
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

  // Helper function to upload mixed audio and save to V3 Redis
  const uploadAndUpdateProject = async (
    blob: Blob,
    localPreviewUrl: string,
  ) => {
    if (!adId) {
      console.warn("No ad ID available for mixed audio upload");
      return { permanentUrl: localPreviewUrl, downloadUrl: localPreviewUrl };
    }

    try {
      console.log("📤 Uploading mixed audio to Vercel blob storage...");
      const { url: permanentUrl, downloadUrl } = await uploadMixedAudioToBlob(
        blob,
        adId,
      );
      console.log("✅ Mixed audio uploaded to blob:", permanentUrl);
      console.log("✅ Download URL generated:", downloadUrl);

      // Save mixer state to V3 Redis
      const mixerUpdate = {
        tracks: calculatedTracks.map((track) => ({
          id: track.id,
          url: track.url,
          label: track.label,
          type: track.type,
          duration: track.actualDuration,
          volume: trackVolumes[track.id] ?? 0,
          startTime: track.actualStartTime,
        })),
        volumes: trackVolumes,
        totalDuration,
        mixedAudioUrl: permanentUrl,
        lastCalculated: Date.now(),
      };

      const response = await fetch(`/api/ads/${adId}/mixer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mixerUpdate),
      });

      if (response.status === 401 && typeof window !== "undefined") {
        const callbackUrl = encodeURIComponent(window.location.href);
        window.location.href = `/auth/signin?callbackUrl=${callbackUrl}`;
        return { permanentUrl: localPreviewUrl, downloadUrl: localPreviewUrl };
      }

      if (!response.ok) {
        console.error("❌ Failed to save mixer state to V3 Redis");
      } else {
        console.log("✅ Mixer state saved to V3 Redis");
      }

      return { permanentUrl, downloadUrl };
    } catch (error) {
      console.error("❌ Failed to upload mixed audio:", error);
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

  // Shared helper to create and upload mix
  const createAndUploadMix = async (): Promise<{
    permanentUrl: string;
    downloadUrl: string;
  } | null> => {
    try {
      setIsExporting(true);

      // Prepare valid URLs for tracks
      const voiceUrls = voiceTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http")),
        )
        .map((t) => t.url);

      const musicUrl =
        musicTracks.length > 0 && musicTracks[0].url
          ? musicTracks[0].url
          : null;

      const soundFxUrls = soundFxTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http")),
        )
        .map((t) => t.url);

      console.log("Creating mix with sources:", {
        voiceCount: voiceUrls.length,
        hasMusic: !!musicUrl,
        soundFxCount: soundFxUrls.length,
      });

      // Prepare timing information for the mixer. Volume is now a dB trim
      // around unity (post-stem-normalization); silenced tracks send a
      // sentinel below the floor that createMix interprets as hard mute.
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => {
        const userTrimDb = trackVolumes[track.id] ?? 0;
        const silenced =
          mutedTrackIds.has(track.id) ||
          (anyTrackSoloed && !soloedTrackIds.has(track.id));
        const timing: TrackTiming = {
          id: track.id,
          url: track.url,
          type: track.type,
          startTime: track.actualStartTime,
          duration: track.actualDuration,
          gainDb: silenced ? -1000 : userTrimDb,
          integratedLufs: track.integratedLufs,
          trim: track.trim,
        };
        return timing;
      });

      // Sort timing info by start time
      timingInfo.sort((a, b) => a.startTime - b.startTime);
      console.log(
        "Sorted timing info for mixer:",
        timingInfo.map((t) => ({
          id: t.id,
          type: t.type,
          startTime: t.startTime,
          duration: t.duration,
        })),
      );

      // Create the mix
      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo,
      );
      const localPreviewUrl = URL.createObjectURL(blob);
      console.log("Mixed audio blob created:", localPreviewUrl);

      // Upload to blob storage with timeout protection
      setIsUploadingMix(true);
      const uploadTimeout = setTimeout(() => {
        console.error("❌ Upload timeout after 30 seconds");
        setIsUploadingMix(false);
        setUploadError("Upload timeout. Please try again.");
      }, 30000);

      const result = await uploadAndUpdateProject(blob, localPreviewUrl);
      clearTimeout(uploadTimeout);

      console.log("✅ Mix uploaded successfully:", result.permanentUrl);
      setIsUploadingMix(false);
      setUploadError(null);

      // Clean up local URL
      URL.revokeObjectURL(localPreviewUrl);

      return result;
    } catch (error) {
      console.error("Failed to create/upload mix:", error);
      setIsUploadingMix(false);
      setUploadError(
        error instanceof Error ? error.message : "Failed to create mix",
      );
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Check if we have a valid preview URL to reuse
      const hasValidPreview =
        previewUrl &&
        previewUrl.startsWith("http") &&
        !previewUrl.startsWith("blob:");

      let downloadUrl: string;

      if (hasValidPreview) {
        console.log("Reusing existing preview URL for export:", previewUrl);
        // Use the existing preview's download URL
        downloadUrl = previewUrl.replace(
          /\/[^/]+$/,
          (match) => `${match}?download=1`,
        );
      } else {
        console.log("No valid preview - creating and uploading mix...");
        const result = await createAndUploadMix();

        if (!result) {
          console.error("Failed to create mix for export");
          return;
        }

        downloadUrl = result.downloadUrl;

        // Update preview state since we just created it
        setPreviewUrl(result.permanentUrl);
        setIsPreviewValid(true);
      }

      // Create download link
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      console.log(`✅ Audio exported successfully`);
      console.log(
        `📊 Audio specs: 44.1kHz, 16-bit, Stereo WAV, -16 LUFS, -2.0 dBTP peak limit`,
      );
    } catch (error) {
      console.error("Failed to export mix:", error);
      setUploadError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // Add state for playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTakesMenuOpen, setIsTakesMenuOpen] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handlePreview = async () => {
    try {
      // Always regenerate the preview regardless of existing URL
      setIsExporting(true);
      console.log("Generating preview mix...");

      // Clear previous preview state immediately so PreviewPanel knows mix is being regenerated
      setPreviewUrl(null);
      setIsPreviewValid(false);
      setUploadError(null);

      // Make sure we have all valid URLs for tracks
      const voiceUrls = voiceTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http")),
        )
        .map((t) => t.url);

      const musicUrl =
        musicTracks.length > 0 && musicTracks[0].url
          ? musicTracks[0].url
          : null;

      const soundFxUrls = soundFxTracks
        .filter(
          (t) =>
            t.url && (t.url.startsWith("blob:") || t.url.startsWith("http")),
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

      // Same dB-trim semantics as the preview path. See comment there.
      const timingInfo: TrackTiming[] = calculatedTracks.map((track) => {
        const userTrimDb = trackVolumes[track.id] ?? 0;
        const silenced =
          mutedTrackIds.has(track.id) ||
          (anyTrackSoloed && !soloedTrackIds.has(track.id));
        const timing: TrackTiming = {
          id: track.id,
          url: track.url,
          type: track.type,
          startTime: track.actualStartTime,
          duration: track.actualDuration,
          gainDb: silenced ? -1000 : userTrimDb,
          integratedLufs: track.integratedLufs,
          trim: track.trim,
        };
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
        })),
      );

      // Create the mixed audio
      console.log("Creating mix with timing:", timingInfo);
      const { blob } = await createMix(
        voiceUrls,
        musicUrl,
        soundFxUrls,
        timingInfo,
      );

      const localPreviewUrl = URL.createObjectURL(blob);
      console.log("Mixed audio blob created:", localPreviewUrl);

      // Upload to blob storage and update Redis in background (don't block playback)
      console.log("Uploading to blob storage and updating Redis...");
      setIsUploadingMix(true);

      // Set timeout for stuck uploads (30 seconds)
      const uploadTimeout = setTimeout(() => {
        console.error("❌ Upload timeout after 30 seconds");
        setIsUploadingMix(false);
        setIsPreviewValid(false);
        setUploadError("Upload timeout. Please try again.");
      }, 30000);

      uploadAndUpdateProject(blob, localPreviewUrl)
        .then(({ permanentUrl }) => {
          clearTimeout(uploadTimeout);
          console.log("✅ Permanent URL saved to Redis:", permanentUrl);
          // Store permanent URL for PreviewPanel and future sessions
          setPreviewUrl(permanentUrl);
          setIsPreviewValid(true);
          setUploadError(null);
          setIsUploadingMix(false);
        })
        .catch((error) => {
          clearTimeout(uploadTimeout);
          console.error("❌ Background upload failed:", error);
          setIsUploadingMix(false);
          setIsPreviewValid(false); // ✅ Mark preview as invalid on upload failure
          setUploadError(
            error instanceof Error
              ? error.message
              : "Upload failed. Please try again.",
          );
        });

      // Set up the playback audio element with LOCAL blob URL (immediate playback)
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

        // Set the source AFTER adding all event listeners - use LOCAL blob for immediate playback
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

        // Update source - use LOCAL blob for immediate playback
        audio.src = localPreviewUrl;
      }

      // Try to preload
      if (playbackAudioRef.current) {
        playbackAudioRef.current.load();
      }

      console.log("Preview generation completed");
      return localPreviewUrl; // Return the local URL for immediate playback
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
          "Audio element still not available after preview generation",
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

      // Only update position if we have valid duration and current time.
      //
      // IMPORTANT: denominator is `displayDuration` (the timeline's visible
      // extent), NOT `audio.duration`. When the format target is larger
      // than the resolved content (e.g. 30s format, 29s content), the
      // timeline extends to 30s; using audio.duration here would make the
      // playhead reach 100% (= right edge of the timeline) at the audio's
      // end, visibly drifting past the last clip throughout playback.
      if (displayDuration > 0 && !isNaN(audio.currentTime)) {
        const position = Math.min(
          100,
          (audio.currentTime / displayDuration) * 100,
        );
        setPlaybackPosition(position);
      }

      // Continue the animation
      animationFrameRef.current = requestAnimationFrame(updatePosition);
    };

    // Start the animation
    animationFrameRef.current = requestAnimationFrame(updatePosition);
  }, [setIsPlaying, setPlaybackPosition, displayDuration]);

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

  // Adjust markers to make sure they go to exactly the display duration.
  const getTotalMarkers = () => {
    return (
      Math.ceil(displayDuration) + (Number.isInteger(displayDuration) ? 1 : 0)
    );
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
  // Volume drawer was retired; per-track volume now lives in the kebab menu.

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
        (t) => t.type === "voice",
      );
      const musicCalcTracks = calculatedTracks.filter(
        (t) => t.type === "music",
      );
      const soundFxCalcTracks = calculatedTracks.filter(
        (t) => t.type === "soundfx",
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
            Preview and export your fully produced audio ad. Ready when you
            are.{" "}
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
          <div className="flex justify-between items-center mb-2 gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-lg">Timeline</h3>

              {/* Takes (mixer versions) — shows the current take and opens
                  a popover with the save action + list of saved takes.
                  Only rendered once the mixer has been bootstrapped
                  (mixerActiveVersionId is set). */}
              {mixerActiveVersionId && (
                <div className="relative">
                  <button
                    onClick={() => setIsTakesMenuOpen((v) => !v)}
                    className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white transition-colors"
                  >
                    <span className="text-gray-400">Take</span>
                    <span className="font-medium">{mixerActiveVersionId}</span>
                    {mixerActiveVersionStatus === "draft" && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] uppercase tracking-wider">
                        Draft
                      </span>
                    )}
                    <svg
                      className={`w-3 h-3 text-gray-400 transition-transform ${
                        isTakesMenuOpen ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {isTakesMenuOpen && (
                    <>
                      {/* backdrop that swallows outside clicks */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsTakesMenuOpen(false)}
                      />
                      <div className="absolute left-0 top-full mt-1 w-72 bg-black/95 backdrop-blur-md border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
                        <button
                          onClick={handleNewTake}
                          className="w-full px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 transition-colors border-b border-white/10 flex items-center gap-2"
                        >
                          <span>➕</span>
                          <div className="flex flex-col">
                            <span>Start a new take</span>
                            <span className="text-[10px] text-gray-500">
                              {mixerActiveVersionStatus === "draft"
                                ? "saves current draft, continue in a new copy"
                                : "fork the current take into a new draft"}
                            </span>
                          </div>
                        </button>
                        <div className="max-h-64 overflow-y-auto">
                          {mixerVersions.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500">
                              No takes yet
                            </div>
                          )}
                          {[...mixerVersions]
                            .sort((a, b) => b.createdAt - a.createdAt)
                            .map((v) => {
                              const isActive = v.id === mixerActiveVersionId;
                              const created = new Date(
                                v.createdAt,
                              ).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                              return (
                                <button
                                  key={v.id}
                                  onClick={() => handleActivateTake(v.id)}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors flex items-center justify-between gap-2 ${
                                    isActive ? "bg-white/5" : ""
                                  }`}
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-white truncate">
                                      {v.label ?? `Take ${v.id}`}
                                    </span>
                                    <span className="text-[11px] text-gray-500">
                                      {v.id} · {created}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {v.status === "draft" && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] uppercase tracking-wider">
                                        Draft
                                      </span>
                                    )}
                                    {isActive && (
                                      <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 text-[10px] uppercase tracking-wider">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <LoudnessMeter
                audioRef={playbackAudioRef}
                isPlaying={isPlaying}
              />
              <PlayButton
                isPlaying={isPlaying}
                onClick={handlePlayPause}
                disabled={isExporting || tracks.length === 0}
              />
            </div>
          </div>
          <div
            ref={timelineRef}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            onPointerCancel={handleTimelinePointerUp}
            className="relative bg-white/3 backdrop-blur-sm border border-white/10 rounded-2xl overflow-visible timeline cursor-pointer touch-none"
          >
            {/* Format-horizon layer — red shading past the brief duration,
                plus a dashed rule at the horizon itself. Wrapped in a rounded
                overflow-hidden pane so the shading clips to the timeline's
                corner radius. The parent container keeps overflow-visible so
                per-track dropdown menus can spill out. */}
            {formatDuration !== undefined && formatDuration > 0 && (
              <div
                className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0"
                aria-hidden="true"
              >
                {displayDuration > formatDuration && (
                  <div
                    className="absolute top-0 bottom-0 bg-red-500/10"
                    style={{
                      left: `${(formatDuration / displayDuration) * 100}%`,
                      right: 0,
                    }}
                  />
                )}
                <div
                  className={`absolute top-0 bottom-0 w-px border-l border-dashed ${
                    displayDuration > formatDuration
                      ? "border-red-400/70"
                      : "border-white/40"
                  }`}
                  style={{
                    left: `${(formatDuration / displayDuration) * 100}%`,
                  }}
                />
              </div>
            )}

            {/* Playback indicator line - positioned absolutely and doesn't interfere with mouse events */}
            {isPlaying && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-green-500 z-10 pointer-events-none"
                style={{ left: `${playbackPosition}%` }}
              />
            )}

            {/* Time markers */}
            <div className="h-7 border-b border-white/20 mb-4 relative px-2">
              {/* One tick per second spans the whole duration. The tick lines
                  always render (they give the ruler its texture), but the
                  label text thins out on narrow screens to avoid overlap:
                  - every 5s: always labelled (anchor labels)
                  - other seconds: labelled only from `xl` up, where there's
                    room for per-second granularity.
                  Pure-CSS via responsive `hidden`/`block` — no JS measuring. */}
              {Array.from({ length: getTotalMarkers() }).map((_, i) => {
                const seconds = i;
                const percent = (seconds / displayDuration) * 100;
                const isAnchorLabel = seconds % 5 === 0;

                return (
                  <div
                    key={i}
                    className="absolute top-0 h-3 border-l border-white/30"
                    style={{ left: `${percent}%` }}
                  >
                    <div
                      className={`absolute top-3 text-xs text-gray-400 transform -translate-x-1/2 ${
                        isAnchorLabel ? "block" : "hidden xl:block"
                      }`}
                    >
                      {formatTime(seconds)}
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
                    totalDuration={displayDuration}
                    trackVolumeDb={trackVolumes[track.id] ?? 0}
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => handleAudioLoaded(track.id)}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                    onChangeVoice={onChangeVoice}
                    onDrop={handleTrackDrop}
                    onTrim={handleTrackTrim}
                    onResetPosition={handleResetPosition}
                    onToggleMute={toggleMute}
                    onToggleSolo={toggleSolo}
                    isMuted={mutedTrackIds.has(track.id)}
                    isSoloed={soloedTrackIds.has(track.id)}
                    isImplicitlyMuted={
                      anyTrackSoloed && !soloedTrackIds.has(track.id)
                    }
                    {...hoverRoleFor(
                      track.id,
                      track.slotId,
                      track.anchorRefSlotId,
                    )}
                  />
                ))}

              {/* Music tracks */}
              {calculatedTracks
                .filter((track) => track.type === "music")
                .map((track) => (
                  <TimelineTrack
                    key={track.id}
                    track={track as TimelineTrackData}
                    totalDuration={displayDuration}
                    trackVolumeDb={trackVolumes[track.id] ?? 0}
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => handleAudioLoaded(track.id)}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                    onChangeMusic={onChangeMusic}
                    onRemove={onRemoveTrack}
                    onDrop={handleTrackDrop}
                    onTrim={handleTrackTrim}
                    onResetPosition={handleResetPosition}
                    onToggleMute={toggleMute}
                    onToggleSolo={toggleSolo}
                    isMuted={mutedTrackIds.has(track.id)}
                    isSoloed={soloedTrackIds.has(track.id)}
                    isImplicitlyMuted={
                      anyTrackSoloed && !soloedTrackIds.has(track.id)
                    }
                    {...hoverRoleFor(
                      track.id,
                      track.slotId,
                      track.anchorRefSlotId,
                    )}
                  />
                ))}

              {/* Sound FX tracks */}
              {calculatedTracks
                .filter((track) => track.type === "soundfx")
                .map((track) => (
                  <TimelineTrack
                    key={track.id}
                    track={track as TimelineTrackData}
                    totalDuration={displayDuration}
                    trackVolumeDb={trackVolumes[track.id] ?? 0}
                    audioError={audioErrors[track.id] || false}
                    playingState={playingTracks[track.id] || false}
                    playbackProgress={playbackProgress[track.id] || 0}
                    audioRef={handleAudioRef(track.id)}
                    onChangeSoundFx={onChangeSoundFx}
                    onRemove={onRemoveTrack}
                    onVolumeChange={(value) =>
                      handleVolumeChange(track.id, value)
                    }
                    onAudioLoaded={() => handleAudioLoaded(track.id)}
                    onAudioError={() => handleAudioError(track.id, track.label)}
                    isTrackLoading={isTrackLoading(track)}
                    onDrop={handleTrackDrop}
                    onTrim={handleTrackTrim}
                    onResetPosition={handleResetPosition}
                    onToggleMute={toggleMute}
                    onToggleSolo={toggleSolo}
                    isMuted={mutedTrackIds.has(track.id)}
                    isSoloed={soloedTrackIds.has(track.id)}
                    isImplicitlyMuted={
                      anyTrackSoloed && !soloedTrackIds.has(track.id)
                    }
                    {...hoverRoleFor(
                      track.id,
                      track.slotId,
                      track.anchorRefSlotId,
                    )}
                  />
                ))}
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
