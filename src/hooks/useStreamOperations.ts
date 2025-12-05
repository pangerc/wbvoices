import { useStreamData, type StreamType } from "./useStreamData";
import { mutate as globalMutate } from "swr";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
} from "@/types/versions";

/**
 * Parameterized hook for stream CRUD operations.
 * Encapsulates all the repetitive clone/delete/createDraft/sendToMixer handlers
 * that were previously duplicated 3x in page.tsx.
 *
 * Uses SWR internally for automatic cache invalidation.
 */
export function useStreamOperations(adId: string, stream: StreamType) {
  const { data, error, isLoading, mutate } = useStreamData(adId, stream);

  /**
   * Clone a version (create a copy as new draft)
   */
  const clone = async (versionId: VersionId) => {
    try {
      const res = await fetch(`/api/ads/${adId}/${stream}/${versionId}/clone`, {
        method: "POST",
      });
      if (res.ok) {
        await mutate(); // Invalidate SWR cache
      }
    } catch (error) {
      console.error(`Failed to clone ${stream} version:`, error);
    }
  };

  /**
   * Delete a version
   */
  const remove = async (versionId: VersionId) => {
    if (!confirm(`Delete ${stream} version ${versionId}?`)) return;
    try {
      const res = await fetch(`/api/ads/${adId}/${stream}/${versionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await mutate(); // Invalidate SWR cache
      }
    } catch (error) {
      console.error(`Failed to delete ${stream} version:`, error);
    }
  };

  /**
   * Create a new draft version.
   * If a draft already exists, activates it first (commits as version).
   */
  const createDraft = async () => {
    try {
      const sessionId =
        typeof window !== "undefined"
          ? localStorage.getItem("universal-session") || "default-session"
          : "default-session";

      // If draft exists, activate it first (commits it as a version)
      const existingDraft = getDraft();
      if (existingDraft) {
        await fetch(`/api/ads/${adId}/${stream}/${existingDraft.id}/activate`, {
          method: "POST",
          headers: { "x-session-id": sessionId },
        });
      }

      // Create new draft with stream-specific defaults
      const body = getDefaultDraftBody(stream);

      const res = await fetch(`/api/ads/${adId}/${stream}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await mutate(); // Invalidate SWR cache
      }
    } catch (error) {
      console.error(`Failed to create ${stream} draft:`, error);
    }
  };

  /**
   * Get the current draft version (if any)
   */
  const getDraft = (): { id: VersionId; version: VoiceVersion | MusicVersion | SfxVersion } | null => {
    if (!data) return null;
    const draftId = data.versions.find(
      (vId) => data.versionsData[vId].status === "draft"
    );
    if (!draftId) return null;
    return {
      id: draftId,
      version: data.versionsData[draftId],
    };
  };

  /**
   * Send a version's tracks to the mixer.
   * Activates the version in Redis and rebuilds mixer server-side.
   * UI updates via SWR cache invalidation (no manual track building).
   */
  const sendToMixer = async (versionId: VersionId, switchToMixTab: () => void) => {
    if (!data) return;

    try {
      const res = await fetch(`/api/ads/${adId}/${stream}/${versionId}/activate`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error(`Activation failed:`, errorData);
        // TODO: Show toast notification to user
        return;
      }

      const { mixer } = await res.json();

      // Invalidate SWR caches - UI updates reactively
      await Promise.all([
        mutate(), // Stream data (updates active indicator)
        globalMutate(`/api/ads/${adId}/mixer`, mixer, false), // Mixer state (optimistic)
      ]);

      switchToMixTab();
    } catch (error) {
      console.error(`Failed to send ${stream} to mixer:`, error);
    }
  };

  return {
    // SWR data
    data,
    error,
    isLoading,
    mutate,

    // Operations
    clone,
    remove,
    createDraft,
    getDraft,
    sendToMixer,
  };
}

/**
 * Get default draft body for each stream type
 */
function getDefaultDraftBody(stream: StreamType) {
  switch (stream) {
    case "voices":
      return {
        voiceTracks: [],
        createdBy: "user",
      };
    case "music":
      return {
        musicPrompt: "",
        musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
        duration: 30,
        provider: "loudly",
        createdBy: "user",
      };
    case "sfx":
      return {
        soundFxPrompts: [],
        createdBy: "user",
      };
  }
}
