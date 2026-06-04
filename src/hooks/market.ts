import { MarketRow } from "@/lib/alaric-client";
import fuzzysort from "fuzzysort";
import { useCallback, useMemo } from "react";
import { useQuery } from "./query";

type UseMarketsProps = {
  eagerQuery?: string;
  showAll?: boolean;
};

export function useMarkets(props?: UseMarketsProps) {
  const { eagerQuery, showAll = true } = props ?? {};

  const query = useMemo(
    () => ({
      showAll,
    }),
    [showAll],
  );

  const eager = useCallback(
    (data: MarketRow[]) =>
      eagerQuery
        ? data
            .map((item) => ({
              ...item,
              fuzzy: fuzzysort.single(eagerQuery, item.name),
            }))
            .filter((item) => (item.fuzzy?.score || 0) > 0.5)
            .sort((a, b) => (b.fuzzy?.score || 0) - (a.fuzzy?.score || 0))
        : data,
    [eagerQuery],
  );

  const {
    data: markets,
    isLoading,
    error,
  } = useQuery<MarketRow>({
    url: "/api/markets",
    once: true,
    query,
    eager,
  });

  return { markets, isLoading, error };
}
