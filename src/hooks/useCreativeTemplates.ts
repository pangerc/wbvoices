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
// brief panel keeps working when the API is down or unseeded. `error` is
// surfaced so admins debugging "why is the gallery empty?" don't have to
// open DevTools; the gallery itself stays silent on errors.
export const useCreativeTemplates = () => {
  const [templates, setTemplates] = useState<CreativeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/instruction-templates", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) {
          const message = `Failed to load creative templates (HTTP ${res.status})`;
          console.warn("[useCreativeTemplates]", message);
          if (!abortController.signal.aborted) setError(message);
          return;
        }
        const data = (await res.json()) as { templates: CreativeTemplate[] };
        if (abortController.signal.aborted) return;
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load creative templates";
        console.warn("[useCreativeTemplates]", message);
        setError(message);
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      abortController.abort();
    };
  }, []);

  return { templates, isLoading, error };
};
