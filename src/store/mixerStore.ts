import { create } from "zustand";
import type { SoundFxPlacementIntent } from "@/types";
import type { AnchorOrigin, MixerState as RedisMixerState } from "@/types/versions";

// Unified Track type for the mixer
export type MixerTrack = {
  id: string;
  /** Stable slot id from the mixer version; keys anchor updates from drag. */
  slotId?: string;
  /** Provenance of the slot's current anchor. "user-edit" flags mixer overrides. */
  anchorOrigin?: AnchorOrigin;
  /** Slot id this track's anchor references (for cycle checks on drag). */
  anchorRefSlotId?: string;
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
    startTime?: number;
    endTime?: number;
    source?: string;
    sourceProjectId?: string;
    placementIntent?: SoundFxPlacementIntent;
  };
  // UI state
  isLoading?: boolean;
};

// Server-calculated positioning for a track
export type CalculatedTrack = MixerTrack & {
  actualStartTime: number;
  actualDuration: number;
};

// Default volume levels for different track types
const getDefaultVolume = (type: "voice" | "music" | "soundfx"): number => {
  switch (type) {
    case "voice":
      return 1.0;
    case "music":
      return 0.3;
    case "soundfx":
      return 0.7;
    default:
      return 1.0;
  }
};

/**
 * Ephemeral drag-preview state. Lives in Zustand (not in the server
 * snapshot) because it updates on every pointermove — we don't want to
 * touch Redis or SWR during a drag. Cleared on drop.
 */
export type DragPreview = {
  /** MixerPanel track id being dragged (e.g. "voice-v3-0"). */
  trackId: string;
  /** Pixel offset from drag origin. Drives the visual translateX. */
  deltaPx: number;
  /** Target drop position in seconds, recomputed on every move. */
  dropSeconds: number;
  /** User is holding alt/opt, signalling "force absolute" anchor. */
  forceAbsolute: boolean;
};

type MixerStoreState = {
  // Track data (hydrated from server via SWR, never recalculated client-side)
  tracks: MixerTrack[];
  calculatedTracks: CalculatedTrack[];
  totalDuration: number;
  /**
   * Target ad duration in seconds (from `brief.adDuration`). Drives the
   * soft-elastic format horizon: marker line + over-budget shading. May be
   * undefined for ads without a brief — UI falls back to no-horizon mode.
   */
  formatDuration?: number;
  trackVolumes: { [key: string]: number };

  // Transient UI state
  loadingStates: { [key: string]: boolean };
  audioErrors: { [key: string]: boolean };
  isExporting: boolean;
  isUploadingMix: boolean;
  isPreviewValid: boolean;
  previewUrl: string | null;
  uploadError: string | null;

  /** Drag preview state — null when no drag is in progress. */
  dragPreview: DragPreview | null;

  /**
   * Hovered track id — drives anchor-relationship highlighting in the
   * timeline (cyan ring on the hovered track's anchor target, amber ring
   * on tracks that reference the hovered one). Ephemeral, UI-only.
   */
  hoveredTrackId: string | null;

  // Server-state hydration (called by MixerPanel from SWR)
  hydrateFromMixer: (state: RedisMixerState) => void;

  // Local-only track mutations (do NOT trigger timeline recalculation; server is the calculator)
  addTrack: (track: MixerTrack) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<MixerTrack>) => void;
  clearTracks: (type?: "voice" | "music" | "soundfx") => void;

  // UI state setters
  setTrackVolume: (id: string, volume: number) => void;
  setTrackLoading: (id: string, isLoading: boolean) => void;
  setTrackError: (id: string, hasError: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setIsExporting: (isExporting: boolean) => void;
  setIsUploadingMix: (isUploading: boolean) => void;
  setIsPreviewValid: (isValid: boolean) => void;
  setUploadError: (error: string | null) => void;

  // Drag lifecycle
  setDragPreview: (preview: DragPreview | null) => void;

  // Hover lifecycle (anchor-relationship highlighting)
  setHoveredTrackId: (id: string | null) => void;
};

export const useMixerStore = create<MixerStoreState>((set, get) => ({
  // Initial state
  tracks: [],
  calculatedTracks: [],
  totalDuration: 0,
  trackVolumes: {},
  loadingStates: {},
  audioErrors: {},
  isExporting: false,
  isUploadingMix: false,
  isPreviewValid: false,
  previewUrl: null,
  uploadError: null,
  dragPreview: null,
  hoveredTrackId: null,

  hydrateFromMixer: (state) => {
    const incomingTracks = (state.tracks ?? []) as MixerTrack[];
    const incomingCalc = state.calculatedTracks ?? [];

    // Build CalculatedTrack[] by joining full track data with server-calculated positions.
    const calculatedTracks: CalculatedTrack[] = incomingCalc.map((calc) => {
      const full = incomingTracks.find((t) => t.id === calc.id);
      return {
        ...(full ?? ({ id: calc.id, url: "", label: "", type: calc.type } as MixerTrack)),
        actualStartTime: calc.startTime,
        actualDuration: calc.duration,
      };
    });

    const totalDuration = state.totalDuration ?? 0;
    const nextVolumes: { [key: string]: number } = {};
    for (const track of incomingTracks) {
      const fromState = state.volumes?.[track.id];
      nextVolumes[track.id] = fromState ?? track.volume ?? getDefaultVolume(track.type);
    }

    // Detect URL changes vs current state to decide whether preview is stale.
    const prevUrls = new Map(get().tracks.map((t) => [t.id, t.url]));
    const urlsChanged =
      incomingTracks.length !== prevUrls.size ||
      incomingTracks.some((t) => prevUrls.get(t.id) !== t.url);

    set((prev) => ({
      tracks: incomingTracks,
      calculatedTracks,
      totalDuration,
      formatDuration: state.formatDuration,
      trackVolumes: nextVolumes,
      isPreviewValid: urlsChanged ? false : prev.isPreviewValid,
    }));
  },

  addTrack: (track) => {
    const newTrack: MixerTrack = {
      ...track,
      id:
        track.id ||
        `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };
    set((state) => ({
      tracks: [...state.tracks, newTrack],
      trackVolumes: state.trackVolumes[newTrack.id]
        ? state.trackVolumes
        : {
            ...state.trackVolumes,
            [newTrack.id]: newTrack.volume ?? getDefaultVolume(newTrack.type),
          },
      loadingStates: {
        ...state.loadingStates,
        [newTrack.id]: true,
      },
      isPreviewValid:
        newTrack.type === "voice" || newTrack.type === "music"
          ? false
          : state.isPreviewValid,
    }));
  },

  removeTrack: (id) => {
    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== id) }));
  },

  updateTrack: (id, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },

  clearTracks: (type) => {
    if (type) {
      set((state) => ({
        tracks: state.tracks.filter((t) => t.type !== type),
        isPreviewValid: false,
      }));
      return;
    }
    set({
      tracks: [],
      calculatedTracks: [],
      totalDuration: 0,
      trackVolumes: {},
      loadingStates: {},
      audioErrors: {},
      previewUrl: null,
      isExporting: false,
      isPreviewValid: false,
    });
  },

  setTrackVolume: (id, volume) => {
    set((state) => ({
      trackVolumes: { ...state.trackVolumes, [id]: volume },
    }));
  },

  setTrackLoading: (id, isLoading) => {
    set((state) => ({
      loadingStates: { ...state.loadingStates, [id]: isLoading },
    }));
  },

  setTrackError: (id, hasError) => {
    set((state) => ({
      audioErrors: { ...state.audioErrors, [id]: hasError },
    }));
  },

  setPreviewUrl: (url) => {
    const { previewUrl } = get();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    set({ previewUrl: url });
  },

  setIsExporting: (isExporting) => set({ isExporting }),
  setIsUploadingMix: (isUploading) => set({ isUploadingMix: isUploading }),
  setIsPreviewValid: (isValid) => set({ isPreviewValid: isValid }),
  setUploadError: (error) => set({ uploadError: error }),
  setDragPreview: (dragPreview) => set({ dragPreview }),
  setHoveredTrackId: (hoveredTrackId) => set({ hoveredTrackId }),
}));
