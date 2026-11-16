import { useDraftSaveQueue } from "@/hooks/use-draft-save-queue";
import { mintSlotId } from "@/lib/mixer/mixer-reconcile";
import type { SoundFxPrompt, UploadedSfx } from "@/types";
import type { SfxVersion, VersionId } from "@/types/versions";
import { useEffect, useState } from "react";

/** Options for {@link useSfxCues}. */
type UseSfxCuesOptions = {
  adId: string;
  draftVersionId: VersionId;
  /** The draft as SWR last fetched it. */
  draftVersion: SfxVersion;
  /** Refetches the SFX stream; runs after every save. */
  onUpdate: () => Promise<unknown>;
};

/** A partial draft write — PATCH replaces each array it carries wholesale. */
type DraftPatch = {
  soundFxPrompts: SoundFxPrompt[];
  generatedUrls?: (string | null)[];
};

/**
 * Fields that change what a generated cue sounds like. Placement is not one:
 * it only moves the cue on the timeline, and dropping its audio would drop
 * the cue from the mixer, which skips cues without a URL.
 */
const CONTENT_FIELDS = ["description", "duration"] as const;

/**
 * The SFX draft's cues and their audio URLs, edited locally and persisted
 * through the draft save queue.
 *
 * `cues` and `urls` are index-aligned: any edit that adds, removes or
 * invalidates a cue writes both arrays in the same PATCH.
 */
export function useSfxCues({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
}: UseSfxCuesOptions) {
  const [cues, setCues] = useState<SoundFxPrompt[]>(
    draftVersion.soundFxPrompts,
  );
  const [urls, setUrls] = useState<(string | null)[]>(
    draftVersion.generatedUrls || [],
  );

  // Every write goes through `save`: in call order, and with SWR prop updates
  // ignored until its refetch lands (see useDraftSaveQueue).
  const { save, isSaving, flush, saving } = useDraftSaveQueue(onUpdate);

  // Sync local state when the draft prop changes (e.g. an iteration created a
  // new draft) — but never over an edit that is still being persisted.
  useEffect(() => {
    if (isSaving()) return;

    setCues(draftVersion.soundFxPrompts);
    setUrls(draftVersion.generatedUrls || []);
  }, [draftVersion, isSaving]);

  const patchDraft = (body: DraftPatch) =>
    save(() =>
      fetch(`/api/ads/${adId}/sfx/${draftVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  /**
   * Edits one cue. A content change drops its generated audio, since it no
   * longer matches — except for an uploaded cue, whose audio is the file. A
   * placement change drops the LLM-authored anchor, which would otherwise win
   * over the new placement when the mixer seeds the cue.
   */
  const updateCue = async (index: number, updates: Partial<SoundFxPrompt>) => {
    const newCues = [...cues];
    newCues[index] = { ...newCues[index], ...updates };

    if ("placement" in updates) {
      delete newCues[index].anchor;
    }

    setCues(newCues);

    const contentChanged = CONTENT_FIELDS.some((field) => field in updates);
    const isUpload = newCues[index].source === "upload";
    const body: DraftPatch = { soundFxPrompts: newCues };

    if (contentChanged && urls[index] && !isUpload) {
      const newUrls = [...urls];
      newUrls[index] = null;

      body.generatedUrls = newUrls;
      setUrls(newUrls);
    }

    try {
      await patchDraft(body);
    } catch (error) {
      console.error("Failed to update sfx draft:", error);
    }
  };

  /** Appends an empty cue to describe and generate. */
  const addCue = async () => {
    const newCues: SoundFxPrompt[] = [
      ...cues,
      {
        description: "",
        duration: 3,
        placement: { type: "end" },
        playAfter: undefined, // Let placement intent determine position
        overlap: 0,
        // Stable mixer slot from birth: PATCH replaces soundFxPrompts
        // wholesale, so a slotId only survives if the client copy carries it.
        slotId: mintSlotId(),
      },
    ];
    setCues(newCues);

    try {
      await patchDraft({ soundFxPrompts: newCues });
    } catch (error) {
      console.error("Failed to add sfx prompt:", error);
    }
  };

  /**
   * Writes one cue and its audio URL together. Resolves true once the draft
   * is saved; on failure the local state is put back.
   */
  const replaceCue = async (
    index: number,
    cue: SoundFxPrompt,
    url: string | null,
  ): Promise<boolean> => {
    const newCues = cues.map((c, i) => (i === index ? cue : c));
    const newUrls = cues.map((_, i) => (i === index ? url : (urls[i] ?? null)));

    setCues(newCues);
    setUrls(newUrls);

    try {
      const res = await patchDraft({
        soundFxPrompts: newCues,
        generatedUrls: newUrls,
      });

      if (res.ok) return true;

      console.error(`Failed to save sfx cue ${index} (${res.status})`);
    } catch (error) {
      console.error(`Failed to save sfx cue ${index}:`, error);
    }

    setCues(cues);
    setUrls(urls);

    return false;
  };

  /**
   * Makes a cue play an uploaded file, replacing its prompt and any generated
   * audio. Keeps its slot and placement. Resolves false when the draft could
   * not be saved.
   */
  const uploadCue = (index: number, upload: UploadedSfx) =>
    replaceCue(
      index,
      {
        ...cues[index],
        description: upload.filename,
        duration: upload.durationSeconds,
        source: "upload",
        assetId: upload.assetId,
      },
      upload.url,
    );

  /** Turns an uploaded cue back into an empty prompt, dropping the file. */
  const clearUpload = (index: number) =>
    replaceCue(
      index,
      {
        ...cues[index],
        description: "",
        duration: 3,
        source: undefined,
        assetId: undefined,
      },
      null,
    );

  /** Removes a cue and its audio together, keeping the arrays aligned. */
  const removeCue = async (index: number) => {
    const newCues = cues.filter((_, i) => i !== index);
    const newUrls = urls.filter((_, i) => i !== index);

    setCues(newCues);
    setUrls(newUrls);

    try {
      await patchDraft({ soundFxPrompts: newCues, generatedUrls: newUrls });
    } catch (error) {
      console.error("Failed to remove sfx prompt:", error);
    }
  };

  /** Drops local edits back to the draft as last fetched. */
  const resetCues = () => {
    setCues(draftVersion.soundFxPrompts);
  };

  return {
    cues,
    urls,
    setUrls,
    save,
    flush,
    saving,
    updateCue,
    addCue,
    uploadCue,
    clearUpload,
    removeCue,
    resetCues,
  };
}
