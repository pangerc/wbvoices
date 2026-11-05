import { useMixerData } from "@/hooks/useMixerData";
import {
  anchorFromDrop,
  type DropReferenceClip,
} from "@/services/anchorFromDrop";
import {
  useMixerStore,
  type CalculatedTrack,
  type MixerTrack,
} from "@/store/mixerStore";
import { useCallback } from "react";

/**
 * Collect what `anchorFromDrop` needs about every other track: their slot
 * positions (drop targets) and the slot → referenced-slot map used to detect
 * cycles. Without the cycle check the resolver would bounce cyclic slots to
 * t=0, which manifests as clips collapsing onto each other.
 */
export function dropContext(
  trackId: string,
  tracks: MixerTrack[],
  calculatedTracks: CalculatedTrack[],
): {
  others: DropReferenceClip[];
  existingRefs: Record<string, string | undefined>;
} {
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

  const existingRefs: Record<string, string | undefined> = {};
  for (const t of tracks) {
    if (t.slotId) existingRefs[t.slotId] = t.anchorRefSlotId;
  }
  return { others, existingRefs };
}

/**
 * Timeline edit actions for one ad's mixer: drag, trim, reset, takes. Every
 * action persists through PATCH / take routes and eagerly hydrates the store
 * from the server response, so the ribbon lands in its new place on the same
 * frame the drag preview clears (relying on the SWR → effect → hydrate chain
 * leaves one frame at the stale position — visible as a flash).
 */
export function useMixerActions(adId: string) {
  const { patchAnchors, patchTrim, startNewTake, activateMixerVersion } =
    useMixerData(adId);
  const tracks = useMixerStore((s) => s.tracks);
  const calculatedTracks = useMixerStore((s) => s.calculatedTracks);
  const formatDuration = useMixerStore((s) => s.formatDuration);
  const mixerActiveVersionId = useMixerStore((s) => s.mixerActiveVersionId);
  const hydrateFromMixer = useMixerStore((s) => s.hydrateFromMixer);

  /**
   * Resolve the proximity anchor for a drop and persist it. The server forks
   * a frozen mixer version into a draft if needed.
   */
  const dropTrack = useCallback(
    async (
      trackId: string,
      dropSeconds: number,
      forceAbsolute: boolean,
      allowPastFormat: boolean,
    ) => {
      const draggedSlotId = tracks.find((t) => t.id === trackId)?.slotId;
      if (!draggedSlotId) {
        console.warn(
          `[mixer-drop] track ${trackId} has no slotId; cannot persist anchor`,
        );
        return;
      }
      const { others, existingRefs } = dropContext(
        trackId,
        tracks,
        calculatedTracks,
      );
      const anchor = anchorFromDrop(draggedSlotId, dropSeconds, others, {
        forceAbsolute,
        existingRefs,
        formatDuration,
        allowPastFormat,
      });
      const updated = await patchAnchors({ [draggedSlotId]: anchor });
      if (updated) hydrateFromMixer(updated);
    },
    [tracks, calculatedTracks, formatDuration, patchAnchors, hydrateFromMixer],
  );

  /** Persist a clamped tail-trim window (null clears it). */
  const trimTrack = useCallback(
    async (trackId: string, newTrim: { start: number; end: number } | null) => {
      const slotId = tracks.find((t) => t.id === trackId)?.slotId;
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
   * Reset a track's anchor back to its stream-level seed. The server
   * re-derives it from the pinned stream version and writes origin=llm-seed.
   */
  const resetPosition = useCallback(
    async (trackId: string) => {
      const slotId = tracks.find((t) => t.id === trackId)?.slotId;
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
   * Start a new take. The server freezes the current draft (preserving it
   * in the take list), forks it, and activates the new draft.
   */
  const newTake = useCallback(
    async (label: string) => {
      const updated = await startNewTake(label);
      if (updated) hydrateFromMixer(updated);
    },
    [startNewTake, hydrateFromMixer],
  );

  /**
   * Switch the active mixer version. The server auto-freezes any outgoing
   * draft first so no work is lost.
   */
  const activateTake = useCallback(
    async (versionId: string) => {
      if (versionId === mixerActiveVersionId) return;
      const updated = await activateMixerVersion(versionId);
      if (updated) hydrateFromMixer(updated);
    },
    [activateMixerVersion, hydrateFromMixer, mixerActiveVersionId],
  );

  return { dropTrack, trimTrack, resetPosition, newTake, activateTake };
}
