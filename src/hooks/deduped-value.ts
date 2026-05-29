import { useEffect, useState } from "react";

export function useDedupedValue<T>(timeoutInMs: number, value: T) {
  const [v, setV] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setV(value), timeoutInMs);

    return () => {
      clearTimeout(t);
    };
  }, [value, timeoutInMs]);

  return v;
}
