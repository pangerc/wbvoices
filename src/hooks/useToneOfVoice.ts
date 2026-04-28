import { ToneOption } from "@/components/ui";
import { useEffect, useState } from "react";

export const useToneOfVoice = () => {
  // Admin-managed tone presets (loaded from /api/tone-of-voice). Falls back to the
  // built-in list if the fetch fails so the brief panel keeps working.
  const [dbToneOptions, setDbToneOptions] = useState<ToneOption[]>([]);
  const [dbToneInstructions, setDbToneInstructions] = useState<
    Record<string, string>
  >({});

  // Load admin-managed tones from the public endpoint. Active-only, sorted newest first.
  useEffect(() => {
    const abortController = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/tone-of-voice", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          tones: Array<{
            id: string;
            title: string;
            description: string;
            voiceInstructions: string;
          }>;
        };
        if (
          abortController.signal.aborted ||
          !Array.isArray(data.tones) ||
          data.tones.length === 0
        )
          return;
        setDbToneOptions(
          data.tones.map((t) => ({
            value: t.title,
            title: t.title,
            description: t.description,
          })),
        );
        setDbToneInstructions(
          Object.fromEntries(
            data.tones.map((t) => [t.title, t.voiceInstructions]),
          ),
        );
      } catch {
        // Silent — fallback presets are already in state.
      }
    })();
    return () => {
      abortController.abort();
    };
  }, []);

  return {
    dbToneOptions,
    dbToneInstructions,
  };
};
