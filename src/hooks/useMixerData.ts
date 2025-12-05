import useSWR from "swr";
import type { MixerState } from "@/types/versions";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * SWR hook for mixer state from Redis.
 * Single source of truth for track data - replaces track management in Zustand.
 */
export function useMixerData(adId: string) {
  return useSWR<MixerState>(
    adId ? `/api/ads/${adId}/mixer` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000, // Prevent rapid refetches
    }
  );
}
