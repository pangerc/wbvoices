import { adMetadataMatchQuery } from "@/common/search";
import { AdMetadataQuery } from "@/database/ads";
import { FuzzyQueryResult, FuzzyResult } from "@/database/base";
import { AdMetadata } from "@/types/versions";
import { useCallback } from "react";
import { useListQuery } from "./list-query";

type UseAdsProps = {
  searchParams?: AdMetadataQuery;
};

export function useAds({ searchParams = {} }: UseAdsProps = {}) {
  const {
    data: ads,
    isLoading,
    isFirstLoad,
    reachedEnd,
    next,
    invalidate,
  } = useListQuery<FuzzyQueryResult<AdMetadata>>({
    url: "/api/ads",
    query: searchParams,
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
        }, [] as FuzzyQueryResult<AdMetadata>[])
        .sort((a, b) => {
          if (a.fuzzy && b.fuzzy) {
            const result = b.fuzzy.score - a.fuzzy.score;

            // If they are not equal, we return the result
            // Otherwise we need to order by last update
            if (result !== 0) {
              return result;
            }
          }

          if (a.meta && b.meta) {
            return b.meta.lastModified - a.meta.lastModified;
          }

          return a.id.localeCompare(b.id);
        }),
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

  return { ads, isLoading, isFirstLoad, reachedEnd, remove, next };
}
