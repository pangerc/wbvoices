"use client";

import { FuzzyResult } from "@/database/base";
import { CacheItem, useQueryCache } from "@/providers/QueryCache.provider";
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDedupedValue } from "./deduped-value";

const ITEMS_PER_PAGE = 8;

type Rule = "append" | "replace";

export type Query = Record<string, string | number | boolean | undefined>;

type Item = ({ id: string } | { code: string }) & { fuzzy?: FuzzyResult };

type UseQueryProps<TItem> = {
  url: string;
  once?: boolean;
  query?: Query;
  eager?: (data: TItem[]) => TItem[];
  initial?: TItem[];
};

type State<TItem extends Item> = {
  data: TItem[];
  skip: number;
  error?: Error;
  isLoading: boolean;
  reachedEnd: boolean;
};

export function useQuery<TItem extends Item>({
  url,
  once = false,
  query,
  eager,
  initial = [],
}: UseQueryProps<TItem>) {
  const { cacheRef } = useQueryCache<TItem>(url);

  const [state, setState] = useState<State<TItem>>(() => ({
    data: Array.from(cacheRef.current.all.values()) || initial,
    skip: 0,
    error: undefined as Error | undefined,
    isLoading: true,
    reachedEnd: false,
  }));

  const isLoading = useDedupedValue(300, state.isLoading);
  const reachedEnd = useDedupedValue(300, state.reachedEnd);

  /**
   * Stores the previous non-paginated URL so we can determine
   * whether the next request should append or replace data.
   */
  const oldQueryRef = useRef<Query>(null);
  const oldSkipRef = useRef(0);

  const isFirstLoadRef = useRef(true);

  const updateState = useCallback(
    (
      update:
        | Partial<State<TItem>>
        | ((update: State<TItem>) => Partial<State<TItem>>),
    ) => {
      setState((state) => {
        const change = typeof update === "function" ? update(state) : update;

        const changed = Object.entries(change).reduce((acc, [k, v]) => {
          // @ts-ignore
          const stateValue = state[k];

          if (k in state && stateValue !== v) {
            return true;
          }

          return acc;
        }, false);

        if (!changed) {
          return state;
        }

        return {
          ...state,
          ...change,
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (once && isFirstLoadRef.current == false) {
      return;
    }

    const controller = new AbortController();

    updateState({ isLoading: true });

    let search: string[] = [];

    let changed = false;
    let nextPageRequested = false;

    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined) {
          search.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }

        if (oldQueryRef.current && query![k] !== oldQueryRef.current![k]) {
          changed = true;
        }
      });
    }

    if (state.skip !== oldSkipRef.current) {
      nextPageRequested = true;
    }

    if (!changed && !nextPageRequested && oldQueryRef.current) {
      // Nothing changed but a change was triggered
      // Returning now because the request would be useless
      return;
    }

    const urlWithoutPagination = `${url}?${search.join("&")}`;

    const urlCacheSize = cacheRef.current[urlWithoutPagination]?.size;
    const take = urlCacheSize ? urlCacheSize + ITEMS_PER_PAGE : ITEMS_PER_PAGE;
    const fetchUrl = `${urlWithoutPagination}&skip=${state.skip}&take=${take}`;
    const computedRule: Rule = changed
      ? "replace"
      : nextPageRequested
        ? "append"
        : "replace";

    let reachedEnd = computedRule !== "replace";

    fetch(fetchUrl, { signal: controller.signal }).then(async (res) => {
      const data = (await res.json()) as TItem[];

      if (controller.signal.aborted) {
        updateState({ isLoading: false });
        return;
      }

      if (query) {
        oldQueryRef.current = query;
        oldSkipRef.current = state.skip;
      }

      if (res.ok) {
        updateCache(urlWithoutPagination, cacheRef, data);

        if (data.length > ITEMS_PER_PAGE) {
          reachedEnd = true;
        }

        if (computedRule === "replace") {
          updateState({ data, reachedEnd, isLoading: false });
        } else {
          updateState((state) => ({
            data: [...state.data, ...data],
            reachedEnd,
            isLoading: false,
          }));
        }
      } else {
        updateState({
          error: new Error("Something went wrong", { cause: data }),
          isLoading: false,
        });
      }

      isFirstLoadRef.current = false;
    });

    return () => {
      updateState({ isLoading: false });
      controller.abort("Query dependencies changed too fast");
    };
  }, [query, state.skip]);

  const invalidate = useCallback((idOrCode: string) => {
    for (let key in cacheRef.current) {
      const cache = cacheRef.current[key];

      cache.delete(idOrCode);

      updateState((state) => ({
        data: state.data.filter((item) => {
          const idx = "id" in item ? item.id : item.code;

          return idx !== idOrCode;
        }),
      }));
    }
  }, []);

  const next = useCallback(
    (skip?: number) =>
      updateState((state) => ({ skip: skip ?? state.data.length })),
    [],
  );

  let filtered = state.data;

  if (eager && filtered && cacheRef.current.all) {
    filtered = useMemo(
      () =>
        eager(
          Array.from(cacheRef.current.all.values()).map((item) => ({
            ...item,
          })),
        ),
      [eager, state.data],
    );
  }

  return {
    ...state,
    isLoading,
    reachedEnd,
    data: filtered,
    isFirstLoad: isFirstLoadRef.current,
    next,
    invalidate,
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
