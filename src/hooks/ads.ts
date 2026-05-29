import { adMetadataMatchQuery } from "@/common/search";
import { AdMetadataQuery } from "@/database/ads";
import { FuzzyResult, QueryResult } from "@/database/base";
import { AdMetadata } from "@/types/versions";
import { useCallback, useMemo } from "react";
import { useDedupedValue } from "./deduped-value";
import { Query, useQuery } from "./query";

const DEFAULT_AD_PAGE = 8;

type UseAdsProps = {
  searchParams?: AdMetadataQuery;
  skip?: number;
};

export function useAds({ searchParams = {}, skip = 0 }: UseAdsProps = {}) {
  const query = useDedupedValue<Query>(
    300,
    useMemo(
      () => ({
        searchParams,
        pagination: { skip, take: DEFAULT_AD_PAGE },
      }),
      [searchParams, skip],
    ),
  );

  const {
    data: ads,
    isLoading,
    isFirstLoad,
    reachedEnd,
    invalidate,
  } = useQuery<QueryResult<AdMetadata>>({
    url: "/api/ads",
    query: query,
    eager: (data) =>
      data
        .reduce((acc, item) => {
          if (!item.meta) {
            return acc;
          }

          const match = adMetadataMatchQuery(item.meta, searchParams);

          if (match) {
            let fuzzy: FuzzyResult | undefined;

            if (typeof match !== "boolean") {
              fuzzy = match;
            }

            if (match) {
              item.fuzzy = fuzzy;
            }

            acc.push(item);
          }

          return acc;
        }, [] as QueryResult<AdMetadata>[])
        .sort((a, b) => (b.fuzzy?.score || 0) - (a.fuzzy?.score || 0)),
    deps: [query],
    initial: [],
  });

  const remove = useCallback(
    async (id: string) => {
      invalidate(id);

      await fetch(`/api/ads/${id}`, {
        method: "DELETE",
      });
    },
    [invalidate],
  );

  return { ads, isLoading, isFirstLoad, reachedEnd, remove };
}
