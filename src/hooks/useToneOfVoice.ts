import { ToneOption } from "@/components/ui";
import { useEffect, useState } from "react";

const FALLBACK_TONE_OPTIONS: ToneOption[] = [
  {
    value: "Professional",
    title: "Professional",
    description:
      "Polished, measured, and trustworthy — for brands that want to sound like experts.",
  },
  {
    value: "Energetic",
    title: "Energetic",
    description:
      "High-octane and enthusiastic — perfect for time-sensitive offers and exciting launches.",
  },
  {
    value: "Warm",
    title: "Warm",
    description:
      "Soft, inviting, and sincere — like a friendly recommendation from someone you trust.",
  },
  {
    value: "Authoritative",
    title: "Authoritative",
    description:
      "Confident, deep, and commanding — for brands that speak from a position of expertise.",
  },
  {
    value: "Sarcastic",
    title: "Sarcastic",
    description:
      "Dry and tongue-in-cheek — for irreverent brands that aren’t afraid to wink at their audience.",
  },
];

const FALLBACK_TONE_INSTRUCTIONS: Record<string, string> = {
  Professional:
    "Deliver with a polished, measured cadence. Keep the timbre authoritative yet warm. Crisp consonants and confident pacing — every word sounds intentional. Avoid vocal fry and filler tones.",
  Energetic:
    "Bring high energy and enthusiasm. Brisk pacing with upward inflections. Use vocal brightness and a smile-in-voice to signal urgency and excitement. Punch key phrases to drive momentum.",
  Warm: "Soft, inviting timbre. Slightly slower pace with relaxed breathing and gentle phrasing. Convey sincerity and closeness — as if speaking to a friend. Let key emotional beats breathe.",
  Authoritative:
    "Deep, confident delivery. Steady pace and minimal pitch variance. Emphasise key claims with sustained pitch and crisp diction. Project expertise and certainty throughout.",
  Sarcastic:
    "Dry, slightly exaggerated inflection. Subtle pauses before punchlines. Pitch irony through vocal raise on key words. Keep the wink obvious to the listener but never broad.",
};

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

  const toneOptions =
    dbToneOptions.length > 0 ? dbToneOptions : FALLBACK_TONE_OPTIONS;

  const toneInstructions =
    Object.keys(dbToneInstructions).length > 0
      ? dbToneInstructions
      : FALLBACK_TONE_INSTRUCTIONS;

  return { toneOptions, toneInstructions };
};
