import type { useStreamOperations } from "@/hooks/useStreamOperations";
import type { VoiceVersion } from "@/types/versions";
import { useMemo } from "react";

/** One voice track, as the SFX placement options describe it. */
export type VoiceTrackPreview = {
  name: string;
  text: string;
};

/**
 * The voice tracks an SFX cue can be placed after ("After voice 2 …").
 *
 * Read from the ACTIVE voice version, not a draft: the mixer rebuilder
 * positions SFX relative to the active version's tracks, so the options must
 * match it.
 */
export function useActiveVoicePreviews(
  voiceStream?: ReturnType<typeof useStreamOperations>,
): VoiceTrackPreview[] {
  return useMemo(() => {
    const data = voiceStream?.data;
    if (!data?.active) return [];

    const activeVersion = data.versionsData[data.active] as
      | VoiceVersion
      | undefined;

    return (activeVersion?.voiceTracks ?? []).map((track) => ({
      name: track.voice?.name || "Voice",
      text: track.text || "",
    }));
  }, [voiceStream?.data]);
}
