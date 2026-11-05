import { useEffect, type MutableRefObject } from "react";

/** Options for {@link useDraftHeaderActions}. */
type UseDraftHeaderActionsOptions = {
  /** Filled with {@link playAll} for the draft accordion's Play button. */
  onPlayAllRef?: MutableRefObject<(() => Promise<void>) | null>;
  /** Filled with {@link sendToMixer} for the Send to mixer button. */
  onSendToMixerRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /** Filled with {@link requestChange} for the Request change button. */
  onRequestChangeRef?: MutableRefObject<(() => void) | null>;
  playAll: () => Promise<void>;
  /** Resolves whether the draft reached the mixer, so the page can follow it. */
  sendToMixer: () => Promise<boolean>;
  requestChange: () => void;
};

/**
 * Hands a draft editor's header actions to the page through the refs it
 * passed down, so the draft accordion's buttons call into the editor.
 *
 * The refs are reassigned after every render, so the buttons always run the
 * latest closures — over the editor's current state, never a stale copy from
 * the render a dependency list last happened to catch.
 */
export function useDraftHeaderActions({
  onPlayAllRef,
  onSendToMixerRef,
  onRequestChangeRef,
  playAll,
  sendToMixer,
  requestChange,
}: UseDraftHeaderActionsOptions): void {
  useEffect(() => {
    if (onPlayAllRef) onPlayAllRef.current = playAll;
    if (onSendToMixerRef) onSendToMixerRef.current = sendToMixer;
    if (onRequestChangeRef) onRequestChangeRef.current = requestChange;
  });
}
