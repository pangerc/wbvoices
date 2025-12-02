import { useStreamData, type StreamType } from "./useStreamData";
import { useMixerStore } from "@/store/mixerStore";
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
   * Send a version's tracks to the mixer
   */
  const sendToMixer = (versionId: VersionId, switchToMixTab: () => void) => {
    if (!data) return;
    const version = data.versionsData[versionId];
    if (!version) return;

    const { clearTracks, addTrack } = useMixerStore.getState();

    if (stream === "voices") {
      const voiceVersion = version as VoiceVersion;
      clearTracks("voice");

      voiceVersion.voiceTracks.forEach((track, index) => {
        const url = track.generatedUrl || voiceVersion.generatedUrls?.[index];
        if (url && track.voice) {
          addTrack({
            id: `voice-${versionId}-${index}`,
            url,
            label: track.voice.name || `Voice ${index + 1}`,
            type: "voice",
            playAfter: index === 0 ? "start" : "previous",
            overlap: track.overlap || 0,
            metadata: {
              voiceId: track.voice.id,
              voiceProvider: track.voice.provider,
              scriptText: track.text,
            },
          });
        }
      });
    } else if (stream === "music") {
      const musicVersion = version as MusicVersion;
      clearTracks("music");

      if (musicVersion.generatedUrl) {
        addTrack({
          id: `music-${versionId}`,
          url: musicVersion.generatedUrl,
          label: `Generated Music (${musicVersion.provider})`,
          type: "music",
          metadata: {
            source: musicVersion.provider,
            promptText: musicVersion.musicPrompt,
            originalDuration: musicVersion.duration,
          },
        });
      }
    } else if (stream === "sfx") {
      const sfxVersion = version as SfxVersion;
      clearTracks("soundfx");

      sfxVersion.soundFxPrompts?.forEach((prompt, index) => {
        const url = sfxVersion.generatedUrls?.[index];
        if (url) {
          addTrack({
            id: `sfx-${versionId}-${index}`,
            url,
            label: prompt.description?.slice(0, 30) || `SFX ${index + 1}`,
            type: "soundfx",
            playAfter: prompt.placement?.type === "start" ? "start" : "end",
            metadata: {
              promptText: prompt.description,
              placementIntent: prompt.placement,
              originalDuration: prompt.duration,
            },
          });
        }
      });
    }

    switchToMixTab();
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
