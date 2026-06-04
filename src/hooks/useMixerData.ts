import type { Anchor, MixerState, SlotId } from "@/types/versions";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * SWR hook for mixer state from Redis.
 * Single source of truth for track data - replaces track management in Zustand.
 */
export function useMixerData(adId: string) {
  const { data, error, isLoading, mutate } = useSWR<MixerState>(
    adId ? `/api/ads/${adId}/mixer` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000, // Prevent rapid refetches
    },
  );

  /**
   * Remove a stream (music or sfx) from the mixer.
   * Clears the active version pointer and rebuilds the mixer.
   */
  const removeStream = async (streamType: "music" | "sfx") => {
    await fetch(`/api/ads/${adId}/mixer/remove-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamType }),
    });
    await mutate();
  };

  /**
   * Persist user-edit anchor updates from a timeline drag. Merges non-
   * destructively on the server; existing anchors for untouched slots are
   * preserved. Forks a frozen active mixer version into a draft if needed
   * (that logic lives in applyMixerPatch).
   *
   * Returns the updated MixerState so callers can hydrate downstream stores
   * synchronously (Zustand), avoiding the one-frame flash between "SWR
   * cache updated" and "store hydration effect fires."
   */
  const patchAnchors = async (
    anchorUpdates: Record<SlotId, Anchor | null>,
  ): Promise<MixerState | null> => {
    if (!adId || Object.keys(anchorUpdates).length === 0) return null;
    const response = await fetch(`/api/ads/${adId}/mixer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchorUpdates }),
    });
    if (!response.ok) {
      console.error("❌ Failed to patch anchors:", response.status);
      await mutate();
      return null;
    }
    const updated = (await response.json()) as MixerState;
    await mutate(updated, { revalidate: false });
    return updated;
  };

  /**
   * Persist trim overrides (edge-drag resize). Mirrors `patchAnchors`:
   * server merges non-destructively; null entries clear the trim for that
   * slot. Client is responsible for clamping values to the source duration.
   */
  const patchTrim = async (
    trimUpdates: Record<SlotId, { start: number; end: number } | null>,
  ): Promise<MixerState | null> => {
    if (!adId || Object.keys(trimUpdates).length === 0) return null;
    const response = await fetch(`/api/ads/${adId}/mixer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trimUpdates }),
    });
    if (!response.ok) {
      console.error("❌ Failed to patch trim:", response.status);
      await mutate();
      return null;
    }
    const updated = (await response.json()) as MixerState;
    await mutate(updated, { revalidate: false });
    return updated;
  };

  /**
   * Start a new take. Atomic flow on the server: freezes the current draft
   * (if any), forks it, activates the new draft. The outgoing take is
   * preserved as a frozen version in the take list. Optional `label`
   * lands on the frozen (outgoing) take — that's the one worth naming.
   */
  const startNewTake = async (label?: string): Promise<MixerState | null> => {
    if (!adId) return null;
    const response = await fetch(`/api/ads/${adId}/mixer/new-take`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(label ? { label } : {}),
    });
    if (!response.ok) {
      console.error("❌ Failed to start new take:", response.status);
      await mutate();
      return null;
    }
    const updated = (await response.json()) as MixerState;
    await mutate(updated, { revalidate: false });
    return updated;
  };

  /**
   * Switch the active mixer version. Auto-freezes the outgoing draft
   * first (no data loss). The returned MixerState reflects the new
   * active take's pins, anchors, overrides, and cached mix.
   */
  const activateMixerVersion = async (
    versionId: string,
  ): Promise<MixerState | null> => {
    if (!adId) return null;
    const response = await fetch(
      `/api/ads/${adId}/mixer/${versionId}/activate`,
      { method: "POST" },
    );
    if (!response.ok) {
      console.error("❌ Failed to activate mixer version:", response.status);
      await mutate();
      return null;
    }
    const updated = (await response.json()) as MixerState;
    await mutate(updated, { revalidate: false });
    return updated;
  };

  return {
    data,
    error,
    isLoading,
    mutate,
    removeStream,
    patchAnchors,
    patchTrim,
    startNewTake,
    activateMixerVersion,
  };
}
