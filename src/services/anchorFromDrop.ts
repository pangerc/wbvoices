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
  /**
   * Map of slot-id → slot-id-it-currently-references. Used to detect
   * would-be cycles: if the dragged slot's proposed anchor targets a slot
   * whose ref chain leads back to the dragged slot, we fall back to
   * `absolute(dropSeconds)` to keep the graph acyclic.
   *
   * A slot with no ref (absolute anchor or unanchored) maps to `undefined`
   * — callers can omit those keys. The resolver will always treat missing
   * keys as "no ref."
   */
  existingRefs?: Readonly<Record<SlotId, SlotId | undefined>>;
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

  // Compute the best candidate anchor per proximity rules. If it would
  // create a cycle against the existing ref graph, fall back to absolute.
  const candidate = pickBestAnchor(draggedSlotId, dropT, others, options);
  if (candidate.kind === "absolute") return candidate;
  if (wouldCreateCycle(draggedSlotId, candidate.slotId, options.existingRefs)) {
    return { kind: "absolute", t: dropT };
  }
  return candidate;
}

/**
 * Proximity-rule candidate picker — the old function body, extracted so the
 * top-level `anchorFromDrop` can wrap it in cycle detection.
 */
function pickBestAnchor(
  draggedSlotId: SlotId,
  dropT: number,
  others: ReadonlyArray<DropReferenceClip>,
  options: AnchorFromDropOptions
): Anchor {

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

/**
 * Walk the ref chain from `startSlot` and check whether it leads back to
 * `draggedSlotId`. If so, adding an edge draggedSlotId → startSlot would
 * close a cycle.
 *
 * Guard: stop after `slots.length`-ish steps to avoid infinite loops in
 * the (theoretically impossible) case the stored graph is already cyclic.
 */
function wouldCreateCycle(
  draggedSlotId: SlotId,
  startSlot: SlotId,
  existingRefs: Readonly<Record<SlotId, SlotId | undefined>> | undefined
): boolean {
  if (startSlot === draggedSlotId) return true; // self-reference
  if (!existingRefs) return false;

  const visited = new Set<SlotId>();
  let current: SlotId | undefined = startSlot;
  // Bound to N+1 hops; any stored cycle is a bug upstream, not ours to fix.
  for (let i = 0; i < 128; i++) {
    if (!current) return false;
    if (current === draggedSlotId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = existingRefs[current];
  }
  return false;
}
