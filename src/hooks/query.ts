"use client";

import { FuzzyResult } from "@/database/base";
import { CacheItem, useQueryCache } from "@/providers/QueryCache.provider";
import {
  DependencyList,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Rule = "append" | "replace";

export type Query = {
  searchParams?: Record<string, string | number | boolean | undefined>;
  pagination?: { skip: number; take: number };
};

type Item = ({ id: string } | { code: string }) & { fuzzy?: FuzzyResult };

type UseQueryProps<TItem> = {
  url: string;
  once?: boolean;
  query?: Query;
  deps?: DependencyList;
  eager?: (data: TItem[]) => TItem[];
  initial?: TItem[];
};

export function useQuery<TItem extends Item>({
  url,
  once = false,
  query,
  eager,
  deps = [],
  initial = [],
}: UseQueryProps<TItem>) {
  const { cacheRef } = useQueryCache<TItem>(url);

  const [data, setData] = useState<TItem[]>(
    () => Object.values(cacheRef.current.all) || initial,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [reachedEnd, setReachedEnd] = useState(false);

  /**
   * Stores the previous non-paginated URL so we can determine
   * whether the next request should append or replace data.
   */
  const oldQueryRef = useRef<Query>(null);

  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (once && isFirstLoadRef.current == false) {
      setData(Object.values(cacheRef.current.all));
      return;
    }

    const controller = new AbortController();

    setIsLoading(true);

    let search: string[] = [];

    let changed = false;
    let nextPageRequested = false;

    let urlWithoutPagination = "";

    if (query) {
      if (query.searchParams) {
        Object.entries(query.searchParams).forEach(([k, v]) => {
          if (v !== undefined) {
            search.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
          }

          if (
            oldQueryRef.current?.searchParams &&
            query.searchParams![k] !== oldQueryRef.current.searchParams![k]
          ) {
            changed = true;
          }
        });
      }

      urlWithoutPagination = `${url}?${search.join("&")}`;

      if (query.pagination) {
        Object.entries(query.pagination).forEach(([k, v]) => {
          if (v !== undefined) {
            search.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
          }
        });

        if (
          oldQueryRef.current?.pagination &&
          (oldQueryRef.current.pagination.skip !== query.pagination.skip ||
            oldQueryRef.current.pagination.take !== query.pagination.take)
        ) {
          nextPageRequested = true;
        }
      }
    }

    if (!changed && !nextPageRequested && oldQueryRef.current) {
      console.debug("useQuery: Nothign changed. Returning");
      // Nothing changed but a change was triggered
      // Returning now because the request would be useless
      return;
    }

    const fetchUrl = `${url}?${search.join("&")}`;
    const computedRule: Rule = changed
      ? "replace"
      : nextPageRequested
        ? "append"
        : "replace";

    if (computedRule === "replace") {
      setReachedEnd(false);
    }

    fetch(fetchUrl, { signal: controller.signal }).then(async (res) => {
      const data = await res.json();

      if (controller.signal.aborted) {
        setIsLoading(false);
        return;
      }

      if (query) {
        oldQueryRef.current = query;
      }

      if (res.ok) {
        updateCache(urlWithoutPagination, cacheRef, data);

        if (computedRule === "replace") {
          setData(data);
        } else {
          setData((oldData) => [...oldData, ...data]);
        }

        if (query && query.pagination && data.length < query.pagination.take) {
          setReachedEnd(true);
        }
      } else {
        setError(new Error("Something went wrong", { cause: data }));
      }

      isFirstLoadRef.current = false;
      setIsLoading(false);
    });

    return () => {
      controller.abort("Query dependencies changed too fast");
    };
  }, deps);

  let filtered = data;

  if (eager && filtered && cacheRef.current.all) {
    filtered = eager(
      useMemo(
        () =>
          Array.from(cacheRef.current.all.values()).map((item) => ({
            ...item,
          })),
        [data],
      ),
    );
  }

  return {
    data: filtered,
    isLoading,
    isFirstLoad: isFirstLoadRef.current,
    error,
    reachedEnd,
  };
}

function updateCache<TItem extends Item>(
  urlWithoutPagination: string,
  cache: RefObject<CacheItem<TItem>>,
  data: TItem[],
) {
  data.forEach((item) => {
    const idx = "id" in item ? item.id : item.code;

    const fuzzyLess: TItem = { ...item };
    delete fuzzyLess.fuzzy;

    cache.current.all.set(idx, fuzzyLess);

    let urlCache = cache.current[urlWithoutPagination];
    if (!urlCache) {
      cache.current[urlWithoutPagination] = urlCache = new Map<string, TItem>();
    }

    urlCache.set(idx, item);
  });
}
