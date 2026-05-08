import { useEffect, useState } from "react";

export type CreativeTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  systemInstructions: string;
  exampleOutput?: string | null;
  defaultPacing?: "fast" | "normal" | null;
  defaultCta?: string | null;
  defaultDurationSeconds?: number | null;
  defaultMusicStyle?: string | null;
  bestPractice?: string | null;
  sortOrder: number;
};

// Empty array on failure on purpose — the gallery hides when empty so the
// brief panel keeps working when the API is down or unseeded.
export const useCreativeTemplates = () => {
  const [templates, setTemplates] = useState<CreativeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/instruction-templates", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { templates: CreativeTemplate[] };
        if (abortController.signal.aborted) return;
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      } catch {
        // Silent: gallery hides on empty list.
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      abortController.abort();
    };
  }, []);

  return { templates, isLoading };
};
