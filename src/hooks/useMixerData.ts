import useSWR from "swr";
import type { MixerState } from "@/types/versions";

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

  return { data, error, isLoading, mutate, removeStream };
}
