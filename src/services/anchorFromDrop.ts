/**
 * Proximity-based anchor resolution for timeline drag-drop.
 *
 * Stage 8a. Pure function: given a drop position in seconds plus the other
 * clips' resolved positions, produce the `Anchor` that best captures the
 * user's intent. Deterministic, no side effects — composes with the
 * resolver and is unit-tested in isolation.
 *
 * Rules (from the redesign plan):
 *
 *   1. If the user held a "force absolute" modifier (opt/alt), return
 *      `absolute(t)` regardless of what's nearby.
 *   2. If the drop lands near any clip's edge (within `edgeSnapSeconds`),
 *      return `relativeTo(slotId, edge, offset=0)`. Ties break to the
 *      closest edge, then to earlier-starting clips.
 *   3. If the drop lands inside a clip's span and near its start/end/center
 *      (within `alignSnapSeconds`), return `simultaneousWith(slotId, ...)`.
 *   4. If the drop lands inside a clip's span but not near any alignment
 *      landmark, return `atFraction(slotId, f)` with `f` clamped to [0, 1].
 *   5. Otherwise (drop past the last clip's end, or on empty timeline),
 *      return `absolute(t)` with `t >= 0`.
 *
 * The resolver doesn't know which track is being dragged — it's passed as a
 * hint so we can exclude it from proximity checks (a dragged clip can't
 * anchor to itself; no cycle would resolve).
 */

import type { Anchor, SlotId } from "@/types/versions";

/** Minimal clip state needed for proximity checks. */
export interface DropReferenceClip {
  slotId: SlotId;
  startTime: number;
  duration: number;
}

export interface AnchorFromDropOptions {
  /** Distance to an edge (seconds) below which we snap to `relativeTo`. Default 0.1s. */
  edgeSnapSeconds?: number;
  /** Distance to start/end/center alignment inside a clip's span where we pick `simultaneousWith`. Default 0.15s. */
  alignSnapSeconds?: number;
  /** User held the force-absolute modifier (opt/alt). Overrides all other rules. */
  forceAbsolute?: boolean;
}

const DEFAULT_EDGE_SNAP_SECONDS = 0.1;
const DEFAULT_ALIGN_SNAP_SECONDS = 0.15;

/**
 * Compute the anchor to store for a dragged clip given its drop position.
 * `draggedSlotId` is excluded from the candidate reference set.
 */
export function anchorFromDrop(
  draggedSlotId: SlotId,
  dropSeconds: number,
  others: ReadonlyArray<DropReferenceClip>,
  options: AnchorFromDropOptions = {}
): Anchor {
  const dropT = Math.max(0, dropSeconds);

  if (options.forceAbsolute) {
    return { kind: "absolute", t: dropT };
  }

  const candidates = others.filter((c) => c.slotId !== draggedSlotId);
  const edgeSnap = options.edgeSnapSeconds ?? DEFAULT_EDGE_SNAP_SECONDS;
  const alignSnap = options.alignSnapSeconds ?? DEFAULT_ALIGN_SNAP_SECONDS;

  // ---- Rule 2: edge-snap to nearest clip boundary ----
  let bestEdge: {
    slotId: SlotId;
    edge: "start" | "end";
    distance: number;
    startTime: number;
  } | null = null;
  for (const c of candidates) {
    const edges: Array<{ edge: "start" | "end"; position: number }> = [
      { edge: "start", position: c.startTime },
      { edge: "end", position: c.startTime + c.duration },
    ];
    for (const e of edges) {
      const distance = Math.abs(dropT - e.position);
      if (distance > edgeSnap) continue;
      if (
        !bestEdge ||
        distance < bestEdge.distance ||
        (distance === bestEdge.distance && c.startTime < bestEdge.startTime)
      ) {
        bestEdge = {
          slotId: c.slotId,
          edge: e.edge,
          distance,
          startTime: c.startTime,
        };
      }
    }
  }
  if (bestEdge) {
    return {
      kind: "relativeTo",
      slotId: bestEdge.slotId,
      edge: bestEdge.edge,
    };
  }

  // ---- Rule 3 + 4: drop inside a clip's span ----
  // Among clips whose span includes dropT, pick the one whose center is
  // closest — avoids ambiguity when clips overlap.
  const containers = candidates
    .filter((c) => dropT >= c.startTime && dropT <= c.startTime + c.duration)
    .map((c) => {
      const center = c.startTime + c.duration / 2;
      return { clip: c, centerDistance: Math.abs(dropT - center) };
    })
    .sort((a, b) => a.centerDistance - b.centerDistance);

  if (containers.length > 0) {
    const { clip } = containers[0];
    const relativeIntoClip = dropT - clip.startTime;
    const center = clip.duration / 2;

    // Rule 3: simultaneousWith near start/center/end
    if (relativeIntoClip <= alignSnap) {
      return {
        kind: "simultaneousWith",
        slotId: clip.slotId,
        alignment: "startAtStart",
      };
    }
    if (clip.duration - relativeIntoClip <= alignSnap) {
      return {
        kind: "simultaneousWith",
        slotId: clip.slotId,
        alignment: "endAtEnd",
      };
    }
    if (Math.abs(relativeIntoClip - center) <= alignSnap) {
      return {
        kind: "simultaneousWith",
        slotId: clip.slotId,
        alignment: "centerAtCenter",
      };
    }

    // Rule 4: atFraction
    const fraction = clip.duration > 0
      ? Math.max(0, Math.min(1, relativeIntoClip / clip.duration))
      : 0;
    return { kind: "atFraction", slotId: clip.slotId, fraction };
  }

  // ---- Rule 5: fallback to absolute ----
  return { kind: "absolute", t: dropT };
}
