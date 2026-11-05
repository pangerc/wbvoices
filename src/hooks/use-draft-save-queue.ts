import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Serialised persistence for a draft editor whose local state mirrors an SWR
 * stream.
 *
 * Draft editors keep the version in local state and re-sync it from the SWR
 * prop. Every save replaces whole arrays (`soundFxPrompts`, `voiceTracks`),
 * so two hazards follow:
 *
 * - A revalidation that started *before* a save can land after it and roll
 *   the local state back (a just-added cue vanishes). SWR only discards such
 *   a fetch once `mutate()` runs, i.e. after the write — so the editor must
 *   ignore prop updates from the moment a save starts until its refetch is
 *   done. `isSaving()` reports exactly that window, across overlapping saves.
 * - Two writes in flight can reach the server out of order and the older
 *   array wins. `save` chains writes so they go out in call order.
 *
 * `isSaving()` reads a ref, for guards that must see a save the moment it
 * starts; `saving` is the same window as render state, for the UI (and the
 * `data-save-state` hook E2E waits on).
 *
 * `flush()` resolves once that window closes — every save queued so far, and
 * any queued while waiting, written (or failed) and refetched. Send to mixer
 * waits on it so the freeze rebuilds from what the user last typed.
 *
 * @param onSaved Refetch after a successful write — the stream's `mutate`.
 */
export function useDraftSaveQueue(onSaved: () => Promise<unknown>): {
  save: <T>(write: () => Promise<T>) => Promise<T>;
  isSaving: () => boolean;
  flush: () => Promise<void>;
  saving: boolean;
} {
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const pendingRef = useRef(0);
  const tailRef = useRef<Promise<unknown>>(Promise.resolve());
  // Settles when the pending count next drops to 0. Replaced each time it
  // rises from 0, so a flush never waits on a window that already closed.
  const idleRef = useRef<{ promise: Promise<void>; resolve: () => void }>(null);
  const [saving, setSaving] = useState(false);

  const save = useCallback(<T>(write: () => Promise<T>): Promise<T> => {
    if (pendingRef.current === 0) {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => (resolve = res));
      idleRef.current = { promise, resolve };
    }

    // Counted before anything is awaited: a stale revalidation can land in
    // the very next tick.
    pendingRef.current += 1;
    setSaving(true);
    const written = tailRef.current.then(write);
    // A failed write must not block the ones queued behind it.
    tailRef.current = written.catch(() => undefined);

    return (async () => {
      try {
        const result = await written;
        await onSavedRef.current();
        return result;
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) {
          setSaving(false);
          idleRef.current?.resolve();
        }
      }
    })();
  }, []);

  const isSaving = useCallback(() => pendingRef.current > 0, []);

  const flush = useCallback(
    () =>
      pendingRef.current > 0 && idleRef.current
        ? idleRef.current.promise
        : Promise.resolve(),
    [],
  );

  return { save, isSaving, flush, saving };
}
