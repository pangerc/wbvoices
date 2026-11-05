/**
 * Pure server → client mixer-store projection. `mixerStore.hydrateFromMixer`
 * and the MixerPanel hydration effect are thin wrappers over these.
 */

import type { CalculatedTrack, MixerTrack } from "@/store/mixerStore";
import type { MixerState as RedisMixerState } from "@/types/versions";

// Default volume levels for different track types
export const getDefaultVolume = (
  type: "voice" | "music" | "soundfx",
): number => {
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

/** The store fields a server snapshot replaces. */
export type HydratedFields = {
  tracks: MixerTrack[];
  calculatedTracks: CalculatedTrack[];
  totalDuration: number;
  formatDuration?: number;
  mixerActiveVersionId?: RedisMixerState["mixerActiveVersionId"];
  mixerActiveVersionStatus?: RedisMixerState["mixerActiveVersionStatus"];
  mixerVersions: NonNullable<RedisMixerState["mixerVersions"]>;
  trackVolumes: Record<string, number>;
  isPreviewValid: boolean;
};

/**
 * Project a server `MixerState` onto the store. The preview stays valid only
 * when no track id or URL changed.
 */
export function stateFromServer(
  prev: { tracks: MixerTrack[]; isPreviewValid: boolean },
  state: RedisMixerState,
): HydratedFields {
  const incomingTracks = (state.tracks ?? []) as MixerTrack[];
  const incomingCalc = state.calculatedTracks ?? [];

  // Join full track data with server-calculated positions.
  const calculatedTracks: CalculatedTrack[] = incomingCalc.map((calc) => {
    const full = incomingTracks.find((t) => t.id === calc.id);
    return {
      ...(full ??
        ({ id: calc.id, url: "", label: "", type: calc.type } as MixerTrack)),
      actualStartTime: calc.startTime,
      actualDuration: calc.duration,
    };
  });

  const trackVolumes: Record<string, number> = {};
  for (const track of incomingTracks) {
    trackVolumes[track.id] =
      state.volumes?.[track.id] ?? track.volume ?? getDefaultVolume(track.type);
  }

  const prevUrls = new Map(prev.tracks.map((t) => [t.id, t.url]));
  const urlsChanged =
    incomingTracks.length !== prevUrls.size ||
    incomingTracks.some((t) => prevUrls.get(t.id) !== t.url);

  return {
    tracks: incomingTracks,
    calculatedTracks,
    totalDuration: state.totalDuration ?? 0,
    formatDuration: state.formatDuration,
    mixerActiveVersionId: state.mixerActiveVersionId,
    mixerActiveVersionStatus: state.mixerActiveVersionStatus,
    mixerVersions: state.mixerVersions ?? [],
    trackVolumes,
    isPreviewValid: urlsChanged ? false : prev.isPreviewValid,
  };
}

/**
 * Whether an incoming server snapshot differs enough from the store to
 * re-hydrate: track set, URLs or start positions changed.
 */
export function needsHydration(
  store: { tracks: MixerTrack[]; calculatedTracks: CalculatedTrack[] },
  server: RedisMixerState | undefined,
): boolean {
  if (!server?.tracks || server.tracks.length === 0) return false;
  const { tracks, calculatedTracks } = store;

  const currentIds = new Set(tracks.map((t) => t.id));
  const serverIds = new Set(server.tracks.map((t) => t.id));
  const currentUrls = new Map(tracks.map((t) => [t.id, t.url]));

  const hasUrlChanges = server.tracks.some(
    (t) => currentUrls.get(t.id) !== t.url,
  );
  const hasPositionChanges = server.calculatedTracks?.some((calc) => {
    const local = calculatedTracks.find((c) => c.id === calc.id);
    return !local || local.actualStartTime !== calc.startTime;
  });

  return (
    tracks.length === 0 ||
    currentIds.size !== serverIds.size ||
    ![...serverIds].every((id) => currentIds.has(id)) ||
    hasUrlChanges ||
    !!hasPositionChanges
  );
}
