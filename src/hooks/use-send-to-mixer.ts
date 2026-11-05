import type { ContentStreamType, VersionId } from "@/types/versions";
import { mutate } from "swr";

/** Options for {@link useSendToMixer}. */
type UseSendToMixerOptions = {
  adId: string;
  /** The stream the draft belongs to. */
  stream: ContentStreamType;
  /** The draft version to send. */
  versionId: VersionId;
  /** Refetches the stream, so its active version updates immediately. */
  onUpdate: () => unknown;
  /**
   * Waits for the editor's queued saves (`useDraftSaveQueue().flush`). The
   * freeze rebuilds the mixer from Redis, so it must not run ahead of them.
   */
  flush?: () => Promise<void>;
};

/**
 * "Send to mixer" for a draft editor: waits for pending draft saves, freezes
 * the draft as the stream's active version, which rebuilds the mixer
 * server-side, then seeds the mixer's SWR cache with the rebuilt state
 * (hydration updates the timeline from there) and refetches the stream.
 *
 * @returns `sendToMixer`, resolving false when the freeze failed — the editor
 *   decides what to tell the user.
 */
export function useSendToMixer({
  adId,
  stream,
  versionId,
  onUpdate,
  flush,
}: UseSendToMixerOptions): () => Promise<boolean> {
  return async () => {
    try {
      await flush?.();

      const res = await fetch(
        `/api/ads/${adId}/${stream}/${versionId}/freeze`,
        { method: "POST" },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error(`${stream} freeze failed:`, errorData);
        return false;
      }

      const { mixer } = await res.json();

      await mutate(`/api/ads/${adId}/mixer`, mixer, false);

      onUpdate();

      return true;
    } catch (error) {
      console.error(`Failed to send ${stream} to mixer:`, error);
      return false;
    }
  };
}
