/**
 * Pure timeline geometry for mixer ribbons: seconds ↔ percent/pixels, drag
 * promotion, drop position and tail-trim clamping.
 */

/** Movement below this many pixels is a click (play/pause), not a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** Shortest effective clip length a tail trim may leave, in seconds. */
export const MIN_EFFECTIVE_SECONDS = 0.1;

/** Ribbon position and width as percentages of the timeline. */
export function clipPercent(
  start: number,
  duration: number,
  totalDuration: number,
): { left: number; width: number } {
  if (totalDuration === 0) return { left: 0, width: 0 };
  return {
    left: Math.max(0, (start / totalDuration) * 100),
    width: Math.max(0, (duration / totalDuration) * 100),
  };
}

export function isPastDragThreshold(deltaPx: number): boolean {
  return Math.abs(deltaPx) >= DRAG_THRESHOLD_PX;
}

/** Where a repositioned clip's start lands, never before 0. */
export function dropSecondsFor(
  originSeconds: number,
  deltaPx: number,
  pxPerSecond: number,
): number {
  return Math.max(0, originSeconds + deltaPx / pxPerSecond);
}

/** Inputs shared by the tail-trim preview and release computations. */
export type TailTrimGesture = {
  /** Pointer delta from where the drag started. */
  deltaPx: number;
  pxPerSecond: number;
  /** Clip's effective (post-trim) duration when the drag started. */
  originEffectiveDuration: number;
  /** Full length of the source blob. */
  sourceDuration: number;
  /** Existing trim start (head trim is preserved). */
  trimStart: number;
};

/**
 * Clamp the live tail-trim delta so the ribbon neither inverts nor extends
 * past the source's remaining length.
 */
export function clampTailTrimDeltaPx(g: TailTrimGesture): number {
  const maxEffectiveSeconds = Math.max(
    g.sourceDuration - g.trimStart,
    MIN_EFFECTIVE_SECONDS,
  );
  const maxDeltaPx =
    (maxEffectiveSeconds - g.originEffectiveDuration) * g.pxPerSecond;
  const minDeltaPx =
    MIN_EFFECTIVE_SECONDS * g.pxPerSecond -
    g.originEffectiveDuration * g.pxPerSecond;
  return Math.max(minDeltaPx, Math.min(maxDeltaPx, g.deltaPx));
}

/** The trim window to persist when a tail-trim drag is released. */
export function tailTrimOnRelease(g: TailTrimGesture): {
  start: number;
  end: number;
} {
  const effective = Math.max(
    MIN_EFFECTIVE_SECONDS,
    Math.min(
      g.sourceDuration - g.trimStart,
      g.originEffectiveDuration + g.deltaPx / g.pxPerSecond,
    ),
  );
  return { start: g.trimStart, end: g.trimStart + effective };
}
