import { usePlaybackActions, useSfxDraftState } from "@/hooks/useAudioPlayback";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import type { SoundFxPrompt } from "@/types";
import type { SfxVersion, VersionId } from "@/types/versions";

/** Options for {@link useSfxGeneration}. */
type UseSfxGenerationOptions = {
  adId: string;
  draftVersionId: VersionId;
  /** The editor's current cues — what gets generated. */
  cues: SoundFxPrompt[];
  /** The editor's current audio URLs, index-aligned with `cues`. */
  urls: (string | null)[];
  /** Replaces the local URLs with what generation returned. */
  setUrls: (urls: (string | null)[]) => void;
  /** The draft save queue — generation persists the cues it was sent. */
  save: <T>(write: () => Promise<T>) => Promise<T>;
  /** Refetches the SFX stream and resolves the fresh draft. */
  onUpdate: () => Promise<SfxVersion | undefined>;
  /** Reports progress and failures for the panel's status line. */
  onStatus: (message: string) => void;
};

/**
 * Generating and playing the SFX draft's audio: every cue, one cue, or "play
 * all" (generating whatever is missing first). Generation state lives in the
 * shared playback store, so the draft accordion's header reflects it too.
 */
export function useSfxGeneration({
  adId,
  draftVersionId,
  cues,
  urls,
  setUrls,
  save,
  onUpdate,
  onStatus,
}: UseSfxGenerationOptions) {
  const { isGenerating, isPlaying, generatingPromptIndex } =
    useSfxDraftState(draftVersionId);
  const { play, setGeneratingSfx } = usePlaybackActions();

  // Through the save queue: the route persists `soundFxPrompts` from this
  // body, so it's a write like any PATCH.
  const requestGeneration = (promptIndex?: number) =>
    save(() =>
      fetch(`/api/ads/${adId}/sfx/${draftVersionId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soundFxPrompts: cues, promptIndex }),
      }),
    );

  const playPreview = (url: string, trackIndex: number) => {
    play({ type: "sfx-preview", url, trackIndex, versionId: draftVersionId });
  };

  /** Generates every cue. Resolves the new URLs, or null on failure. */
  const generateAll = async (): Promise<string[] | null> => {
    setGeneratingSfx(true, draftVersionId);
    onStatus("Generating sound effects...");

    try {
      const res = await requestGeneration();

      if (!res.ok) {
        const error = await res.json();
        onStatus(`Generation failed: ${error.error || "Unknown error"}`);
        return null;
      }

      const result = await res.json();

      setUrls(result.generatedUrls);
      onStatus("Sound effects generated successfully!");

      return result.generatedUrls;
    } catch (error) {
      console.error("Failed to generate sound effects:", error);
      onStatus("Generation failed. Please try again.");
      return null;
    } finally {
      setGeneratingSfx(false);
    }
  };

  /** Plays one cue, generating it first if it has no audio yet. */
  const playCue = async (index: number) => {
    if (!cues[index]?.description?.trim()) {
      onStatus("Enter a description first.");
      return;
    }

    const existingUrl = urls[index];
    if (existingUrl) {
      playPreview(existingUrl, index);
      return;
    }

    setGeneratingSfx(true, draftVersionId, index);
    onStatus(`Generating sound effect ${index + 1}...`);

    try {
      const res = await requestGeneration(index);

      if (!res.ok) {
        const error = await res.json();
        onStatus(`Generation failed: ${error.error || "Unknown error"}`);
        return;
      }

      const result = await res.json();

      setUrls(result.generatedUrls);
      onStatus(`Sound effect ${index + 1} ready!`);

      const url = result.generatedUrls[index];
      if (url) playPreview(url, index);
    } catch (error) {
      console.error("Failed to generate sound effect:", error);
      onStatus("Generation failed. Please try again.");
    } finally {
      setGeneratingSfx(false);
    }
  };

  /**
   * Plays every cue in sequence, generating first if any is missing audio, or
   * stops playback if it is already running. Decides from a fresh fetch of the
   * draft — the server is the source of truth for what has audio.
   */
  const playAll = async () => {
    const { playSequence, stopSequence } = useAudioPlaybackStore.getState();

    if (isPlaying) {
      stopSequence();
      return;
    }

    // Loading state straight away, for responsive feedback.
    setGeneratingSfx(true, draftVersionId);

    const freshVersion = await onUpdate();
    const freshUrls = freshVersion?.generatedUrls || [];
    const cueCount = freshVersion?.soundFxPrompts.length || 0;
    const allHaveAudio =
      cueCount > 0 && freshUrls.filter(Boolean).length >= cueCount;

    if (!allHaveAudio) {
      const generatedUrls = await generateAll();
      if (!generatedUrls || generatedUrls.length === 0) return;

      playSequence(generatedUrls, {
        type: "sfx-preview",
        versionId: draftVersionId,
      });
      return;
    }

    setGeneratingSfx(false);

    playSequence(freshUrls.filter(Boolean) as string[], {
      type: "sfx-preview",
      versionId: draftVersionId,
    });
  };

  return {
    isGenerating,
    generatingPromptIndex,
    generateAll,
    playCue,
    playAll,
  };
}
