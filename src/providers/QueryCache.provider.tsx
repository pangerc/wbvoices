import {
  createContext,
  PropsWithChildren,
  useContext,
  useRef,
  useState,
} from "react";

export type CacheListItem<T> = Record<string | "all", Map<string, T>>;

type Cache<T> = Record<string, CacheListItem<T>>;

const Context = createContext<{
  cache: Cache<unknown>;
}>({
  cache: {},
});

export function useListQueryCache<T>(key: string) {
  const ctx = useContext(Context);

  if (!ctx.cache[key]) {
    ctx.cache[key] = {};
  }

  const cacheRef = useRef<CacheListItem<T>>(ctx.cache[key] as CacheListItem<T>);

  if (!cacheRef.current.all) {
    cacheRef.current.all = new Map();
  }

  return {
    cacheRef,
  };
}

export function useQueryCache<T>(key: string) {
  const ctx = useContext(Context);

  if (!ctx.cache[key]) {
    ctx.cache[key] = {};
  }

  const cacheRef = useRef<T>(ctx.cache[key] as T);

  return {
    cacheRef,
  };
}

export function QueryCacheProvider({ children }: PropsWithChildren) {
  const [cache, _] = useState<Cache<unknown>>({});

  return (
    <Context.Provider
      value={{
        cache,
      }}
    >
      {children}
    </Context.Provider>
  );
}
