import { useQuery } from "./query";

export function useAd(id: string) {
  const { data: metadata, ...metaRest } = useQuery<{
    lastModified: Date;
    name: string;
  }>(`/api/ads/${id}?da`);

  return {
    metadata,
    isLoading: metaRest.isLoading,
    error: metaRest.error,
    update: metaRest.patchData,
  };
}
