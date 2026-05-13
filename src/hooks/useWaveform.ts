import { loadWaveformPeaks } from "@/utils/waveform";
import { useEffect, useState } from "react";

/**
 * React hook that lazily loads + caches waveform peaks for a given URL.
 *
 * Returns an empty array until the decode resolves; callers should render
 * a graceful fallback (flat line, nothing, or a subtle shimmer) during
 * that window. `buckets` is roughly the number of horizontal samples to
 * render; 200 is enough for most ribbons without measurable decode cost.
 */
export function useWaveform(
  url: string | undefined,
  buckets = 200,
): { peaks: number[]; isLoading: boolean } {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(!!url);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadWaveformPeaks(url, buckets).then((next) => {
      if (cancelled) return;
      setPeaks(next);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [url, buckets]);

  return { peaks, isLoading };
}
