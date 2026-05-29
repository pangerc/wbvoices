import {
  createContext,
  PropsWithChildren,
  useContext,
  useRef,
  useState,
} from "react";

export type CacheItem<T> = Record<string | "all", Map<string, T>>;

type Cache<T> = Record<string, CacheItem<T>>;

const Context = createContext<{
  cache: Cache<unknown>;
}>({
  cache: {},
});

export function useQueryCache<T>(key: string) {
  const ctx = useContext(Context);

  if (!ctx.cache[key]) {
    ctx.cache[key] = {};
  }

  const cacheRef = useRef<CacheItem<T>>(ctx.cache[key] as CacheItem<T>);

  if (!cacheRef.current.all) {
    cacheRef.current.all = new Map();
  }

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
