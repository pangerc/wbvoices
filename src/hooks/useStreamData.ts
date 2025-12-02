import useSWR from "swr";
import type { VersionStreamResponse } from "@/types/versions";

export type StreamType = "voices" | "music" | "sfx";

const fetcher = (url: string): Promise<VersionStreamResponse> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`);
    return r.json();
  });

/**
 * SWR-based hook for fetching stream data with automatic revalidation.
 *
 * Solves the stale data problem by:
 * - Revalidating on window focus
 * - Providing a mutate() function for manual invalidation after mutations
 * - Stale-while-revalidate for better UX
 */
export function useStreamData(adId: string, stream: StreamType) {
  const { data, error, isLoading, mutate } = useSWR<VersionStreamResponse>(
    adId ? `/api/ads/${adId}/${stream}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2000, // Dedupe requests within 2 seconds
    }
  );

  return {
    data,
    error,
    isLoading,
    mutate, // Call this after mutations to invalidate cache
  };
}
