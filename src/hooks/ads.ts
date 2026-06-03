import { adMetadataMatchQuery } from "@/common/search";
import { AdMetadataQuery } from "@/database/ads";
import { FuzzyResult, QueryResult } from "@/database/base";
import { AdMetadata } from "@/types/versions";
import { useCallback, useMemo, useState } from "react";
import { useDedupedValue } from "./deduped-value";
import { Query, useQuery } from "./query";

const PROJECTS_PER_PAGE = 8;

type UseAdsProps = {
  searchParams?: AdMetadataQuery;
};

export function useAds({ searchParams = {} }: UseAdsProps = {}) {
  const [skip, setSkip] = useState(0);

  const query = useDedupedValue<Query>(
    300,
    useMemo(
      () => ({
        searchParams,
        pagination: { skip, take: PROJECTS_PER_PAGE },
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

  const next = useCallback(
    (skip?: number) => setSkip((s) => skip ?? s + PROJECTS_PER_PAGE),
    [setSkip],
  );

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
