import { DependencyList, useEffect, useState } from "react";

type Rule = "append" | "replace";

export function useQuery<TItem, TDeps extends DependencyList>(
  rule: Rule,
  query: (deps: TDeps, signal: AbortSignal) => Promise<TItem[] | Error>,
  deps: TDeps,
) {
  const [data, setData] = useState<TItem[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    query(deps, controller.signal).then((newData) => {
      setIsLoading(false);

      if (newData instanceof Error) {
        setError(newData);

        return;
      }

      if (rule === "replace") {
        setData(newData);
      } else {
        setData((old) => {
          if (!old) {
            return newData;
          } else {
            return [...old, ...newData];
          }
        });
      }

      setError(undefined);
    });

    return () => {
      controller.abort("Query dependencies changed too fast");
    };
  }, deps);

  return { data, isLoading };
}
