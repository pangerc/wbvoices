import { useQueryCache } from "@/providers/QueryCache.provider";
import { useCallback, useEffect, useState } from "react";

type State<TItem> = {
  data: TItem;
  error?: Error;
  isLoading: boolean;
};

export function useQuery<TItem>(url: string) {
  const { cacheRef } = useQueryCache<TItem>(url);

  const [state, setState] = useState<State<TItem>>(() => ({
    data: cacheRef.current,
    error: undefined as Error | undefined,
    isLoading: true,
  }));

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
    const controller = new AbortController();

    updateState({ isLoading: true });

    fetch(url, { signal: controller.signal }).then(async (response) => {
      if (controller.signal.aborted) {
        updateState({ isLoading: false });
        return;
      }

      const data = await response.json();

      if (response.ok) {
        updateState({ isLoading: false, data });
      } else {
        updateState({ isLoading: false, error: data });
      }
    });

    return () => {
      controller.abort("Query dependencies changed too fast");
    };
  }, []);

  const patchData = useCallback(async (patch: Partial<TItem>) => {
    updateState({ isLoading: true });

    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (response.ok) {
      updateState((s) => ({ isLoading: false, data: { ...s.data, ...patch } }));
    } else {
      updateState({ isLoading: false });
    }
  }, []);

  return { ...state, patchData };
}
