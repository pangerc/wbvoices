import { useEffect, useState } from "react";

export type CreativeTemplate = {
  id: string;
  title: string;
  description: string;
  category: string;
  systemInstructions: string;
  exampleOutput?: string | null;
  sortOrder: number;
};

/**
 * Loads admin-managed creative templates (AAC-27) for the brief gallery.
 * Active-only, ordered by sort_order ascending. Empty array on fetch failure
 * — the gallery hides itself when there's nothing to show, the brief flow
 * still works without templates.
 */
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
        // Silent — gallery hides when empty.
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
