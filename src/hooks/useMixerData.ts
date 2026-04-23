import useSWR from "swr";
import type { Anchor, MixerState, SlotId } from "@/types/versions";

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
    }
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
   */
  const patchAnchors = async (anchorUpdates: Record<SlotId, Anchor>) => {
    if (!adId || Object.keys(anchorUpdates).length === 0) return;
    const response = await fetch(`/api/ads/${adId}/mixer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchorUpdates }),
    });
    if (!response.ok) {
      console.error("❌ Failed to patch anchors:", response.status);
      await mutate();
      return;
    }
    const updated = (await response.json()) as MixerState;
    await mutate(updated, { revalidate: false });
  };

  return { data, error, isLoading, mutate, removeStream, patchAnchors };
}
