import type { DraftState } from "@/components/ui/DraftAccordion";
import type { SoundFxPrompt } from "@/types";

/**
 * The SFX draft's badge state, from the editor's local state so it updates the
 * moment a cue changes rather than after the refetch.
 *
 * Ready once every cue with a description has audio. Each cue is checked
 * against its own URL — `urls` is index-aligned with `cues`.
 */
export function sfxDraftState(
  cues: SoundFxPrompt[],
  urls: (string | null)[],
  isGenerating: boolean,
): DraftState {
  if (isGenerating) return "generating";

  const written = cues.flatMap((cue, i) =>
    cue.description?.trim() ? [i] : [],
  );

  if (written.length === 0) return "editing";

  return written.every((i) => !!urls[i]) ? "ready" : "changed";
}
