/**
 * TimelineResolver — pure positioning engine for the mixer redesign.
 *
 * Takes slots + anchor graph → resolves each clip's start time and duration.
 * No Redis, no side effects, no dependencies on the legacy calculator.
 *
 * Contract:
 *   resolveTimeline(input): {
 *     tracks: ResolvedTrack[],           // positioned clips
 *     totalDuration: number,             // max end time
 *     warnings: ResolverWarning[],       // orphans, cycles, over-budget, etc.
 *     voiceActiveIntervals: [...],       // for mix-time ducking / disclaimer checks
 *   }
 *
 * Anchor semantics:
 *   - absolute(t):               clip starts at t.
 *   - relativeTo(slot, edge, o): clip starts at referenced slot's edge + offset.
 *   - simultaneousWith(slot, a): clip aligned with referenced slot (start/center/end).
 *   - atFraction(slot, f):       clip starts at slot.start + slot.duration * f.
 *
 * Layout semantics:
 *   - overlay (default): clip is positioned at its anchor; siblings are unaffected.
 *   - push:              clip extends a "push stack" rooted at its anchor's
 *     (slot, edge). Subsequent clips anchored to the same (slot, edge) are
 *     shifted forward by the cumulative push-stack depth. This is what fixes
 *     the legacy `afterVoice{N}` sfx overlaying voice N+1 bug — sequential
 *     clips anchored to the same voice end now sequence correctly.
 *
 * Cycles:
 *   - If a graph cycle exists (A's anchor refers to B, B's to A), the resolver
 *     emits an anchorCycle warning and positions the offending clips at t=0
 *     with a system-default fallback. Partial resolution still succeeds.
 *
 * Orphans:
 *   - If an anchor references an unknown slotId (slot removed upstream), the
 *     resolver emits an orphanAnchor warning and falls back to absolute(0).
 */

import type {
  Anchor,
  AnchorEntry,
  DurationPolicy,
  SlotId,
} from "@/types/versions";

// ============ Public types ============

export interface SlotState {
  slotId: SlotId;
  type: "voice" | "music" | "soundfx";
  /** Source clip duration before any trim / speedup. Measured or estimated. */
  sourceDuration: number;
  durationPolicy?: DurationPolicy;
  isDisclaimer?: boolean;
  /** Optional trim window into the source blob. */
  trim?: { start: number; end: number };
}

export interface ResolverInput {
  slots: SlotState[];
  /** Per-slot positioning anchor. Slots without an entry fall to system-default. */
  anchors: Record<SlotId, AnchorEntry>;
  /** Spotify format target (15/30/60). Enables over-budget warnings. */
  formatDuration?: number;
  /** Target locale — drives per-locale speedup caps for the release valve. */
  locale?: string;
}

export interface ResolvedTrack {
  slotId: SlotId;
  type: "voice" | "music" | "soundfx";
  startTime: number;
  duration: number;
  /** Which anchor produced this position. Null when resolved as system-default. */
  resolvedFrom: Anchor | null;
  isDisclaimer?: boolean;
}

export type ResolverWarning =
  | { kind: "orphanAnchor"; slotId: SlotId; missingRef: SlotId }
  | { kind: "anchorCycle"; cycle: SlotId[] }
  | { kind: "overBudget"; actualDuration: number; targetDuration: number }
  | {
      kind: "fragileAnchor";
      slotId: SlotId;
      reason: "nearBoundary" | "absoluteOutOfRange";
    }
  | { kind: "disclaimerViolation"; slotId: SlotId; reason: string };

export interface ResolvedTimeline {
  tracks: ResolvedTrack[];
  totalDuration: number;
  warnings: ResolverWarning[];
  voiceActiveIntervals: Array<{ start: number; end: number }>;
}

// ============ Per-locale speedup caps (release-valve constant) ============

/**
 * Automatic speedup ceiling per locale family, applied only by the resolver's
 * duration-squeeze release valve. Distinct from the user-facing Smart Speed
 * manual cap (1.6×) — those coexist.
 */
export const AUTO_SPEEDUP_CAPS: Record<string, number> = {
  en: 1.15,
  es: 1.15,
  pt: 1.15,
  fr: 1.15,
  it: 1.15,
  de: 1.15,
  pl: 1.12,
  ar: 1.08,
  zh: 1.08,
  ja: 1.1,
  ko: 1.1,
};

export const DEFAULT_SPEEDUP_CAP = 1.12;

export function getSpeedupCap(locale?: string): number {
  if (!locale) return DEFAULT_SPEEDUP_CAP;
  // Locale may be "en-US", "zh-CN", etc. Collapse to family.
  const family = locale.split(/[-_]/)[0].toLowerCase();
  return AUTO_SPEEDUP_CAPS[family] ?? DEFAULT_SPEEDUP_CAP;
}

// ============ Resolver ============

interface ResolutionState {
  resolved: Map<SlotId, { startTime: number; endTime: number }>;
  warnings: ResolverWarning[];
  /**
   * Push-stack extension keyed by "{slotId}@{edge}" — how far past the
   * referenced edge have push-layout clips extended the effective anchor?
   */
  pushExtension: Map<string, number>;
}

export function resolveTimeline(input: ResolverInput): ResolvedTimeline {
  const { slots, anchors, formatDuration } = input;
  const slotById = new Map<SlotId, SlotState>();
  for (const slot of slots) slotById.set(slot.slotId, slot);

  const state: ResolutionState = {
    resolved: new Map(),
    warnings: [],
    pushExtension: new Map(),
  };

  // ---- Detect cycles before anything else ----
  const cycles = detectCycles(slots, anchors);
  for (const cycle of cycles) {
    state.warnings.push({ kind: "anchorCycle", cycle });
  }
  const inCycle = new Set<SlotId>(cycles.flat());

  // ---- Determine resolution order ----
  const order = topologicalOrder(slots, anchors, inCycle);

  // ---- Resolve each clip in order ----
  for (const slotId of order) {
    const slot = slotById.get(slotId);
    if (!slot) continue;
    const effectiveDuration = effectiveClipDuration(slot);
    const entry = anchors[slotId];

    if (!entry || inCycle.has(slotId)) {
      // No anchor, or in a cycle: fall back to absolute(0).
      state.resolved.set(slotId, { startTime: 0, endTime: effectiveDuration });
      continue;
    }

    const resolved = resolveAnchor(entry.anchor, slot, state, slotById);
    if (!resolved.ok) {
      state.warnings.push(resolved.warning);
      state.resolved.set(slotId, { startTime: 0, endTime: effectiveDuration });
      continue;
    }

    const startTime = resolved.startTime;
    const endTime = startTime + effectiveDuration;
    state.resolved.set(slotId, { startTime, endTime });

    if (entry.layout === "push") {
      // Push is only meaningful when the anchor expresses a sequential
      // relationship to another clip's edge (i.e. `relativeTo`). Other
      // anchor kinds (`absolute`, `simultaneousWith`, `atFraction`) don't
      // identify a clear "next-in-line" slot, so we log + ignore rather
      // than silently shift siblings in an unpredictable way. A future
      // stage can introduce explicit push semantics for other kinds if
      // a drag interaction requires it; today's behavior is documented
      // as "push only composes with relativeTo".
      const pushKey = pushKeyForAnchor(entry.anchor);
      if (pushKey) {
        const referenceSlot = referencedSlotId(entry.anchor);
        const referenceEdge = referencedEdge(entry.anchor);
        const referencePos =
          referenceSlot && referenceEdge
            ? edgePositionOf(referenceSlot, referenceEdge, state, slotById)
            : 0;
        const extension = endTime - referencePos;
        if (extension > 0) {
          const prev = state.pushExtension.get(pushKey) ?? 0;
          state.pushExtension.set(pushKey, Math.max(prev, extension));
        }
      } else {
        console.warn(
          `[timelineResolver] layout:"push" is only supported on relativeTo anchors; ignored on ${entry.anchor.kind} for slot ${slotId}`
        );
      }
    }
  }

  // ---- Build output ----
  const tracks: ResolvedTrack[] = slots.map((slot) => {
    const r = state.resolved.get(slot.slotId);
    const startTime = r?.startTime ?? 0;
    const endTime = r?.endTime ?? slot.sourceDuration;
    const entry = anchors[slot.slotId];
    return {
      slotId: slot.slotId,
      type: slot.type,
      startTime,
      duration: endTime - startTime,
      resolvedFrom: entry?.anchor ?? null,
      isDisclaimer: slot.isDisclaimer,
    };
  });

  const totalDuration = tracks.reduce(
    (max, t) => Math.max(max, t.startTime + t.duration),
    0
  );

  if (formatDuration && totalDuration > formatDuration) {
    state.warnings.push({
      kind: "overBudget",
      actualDuration: totalDuration,
      targetDuration: formatDuration,
    });
  }

  const voiceActiveIntervals = tracks
    .filter((t) => t.type === "voice")
    .map((t) => ({ start: t.startTime, end: t.startTime + t.duration }))
    .sort((a, b) => a.start - b.start);

  // Disclaimer protection: disclaimer voice must not overlap non-disclaimer voices.
  for (const t of tracks) {
    if (!t.isDisclaimer || t.type !== "voice") continue;
    const tStart = t.startTime;
    const tEnd = tStart + t.duration;
    for (const other of tracks) {
      if (other === t || other.type !== "voice") continue;
      if (other.isDisclaimer) continue;
      const oStart = other.startTime;
      const oEnd = oStart + other.duration;
      if (oStart < tEnd && oEnd > tStart) {
        state.warnings.push({
          kind: "disclaimerViolation",
          slotId: t.slotId,
          reason: `overlaps non-disclaimer voice ${other.slotId}`,
        });
        break;
      }
    }
  }

  return {
    tracks,
    totalDuration,
    warnings: state.warnings,
    voiceActiveIntervals,
  };
}

// ============ Internals ============

function effectiveClipDuration(slot: SlotState): number {
  if (slot.trim) {
    const trimmed = slot.trim.end - slot.trim.start;
    if (trimmed > 0) return trimmed;
  }
  return Math.max(0, slot.sourceDuration);
}

function referencedSlotId(anchor: Anchor): SlotId | null {
  if (anchor.kind === "absolute") return null;
  return anchor.slotId;
}

function referencedEdge(anchor: Anchor): "start" | "end" | null {
  if (anchor.kind === "relativeTo") return anchor.edge;
  if (anchor.kind === "simultaneousWith") {
    return anchor.alignment === "startAtStart"
      ? "start"
      : anchor.alignment === "endAtEnd"
      ? "end"
      : "start"; // centerAtCenter anchors neither edge explicitly
  }
  if (anchor.kind === "atFraction") return "start"; // fraction lives inside the slot
  return null;
}

function pushKeyForAnchor(anchor: Anchor): string | null {
  if (anchor.kind === "relativeTo") return `${anchor.slotId}@${anchor.edge}`;
  return null;
}

function edgePositionOf(
  slotId: SlotId,
  edge: "start" | "end",
  state: ResolutionState,
  slotById: Map<SlotId, SlotState>
): number {
  const resolved = state.resolved.get(slotId);
  if (resolved) return edge === "start" ? resolved.startTime : resolved.endTime;
  // Not yet resolved — should not happen after topological sort, but be defensive.
  const slot = slotById.get(slotId);
  return edge === "start" ? 0 : slot ? effectiveClipDuration(slot) : 0;
}

type AnchorResolution =
  | { ok: true; startTime: number }
  | { ok: false; warning: ResolverWarning };

function resolveAnchor(
  anchor: Anchor,
  thisSlot: SlotState,
  state: ResolutionState,
  slotById: Map<SlotId, SlotState>
): AnchorResolution {
  if (anchor.kind === "absolute") {
    return { ok: true, startTime: Math.max(0, anchor.t) };
  }

  const refSlot = slotById.get(anchor.slotId);
  if (!refSlot || !state.resolved.has(anchor.slotId)) {
    return {
      ok: false,
      warning: {
        kind: "orphanAnchor",
        slotId: thisSlot.slotId,
        missingRef: anchor.slotId,
      },
    };
  }

  const refResolved = state.resolved.get(anchor.slotId)!;

  if (anchor.kind === "relativeTo") {
    const basePosition =
      anchor.edge === "start" ? refResolved.startTime : refResolved.endTime;
    const pushExt = state.pushExtension.get(`${anchor.slotId}@${anchor.edge}`) ?? 0;
    const startTime = basePosition + pushExt + (anchor.offset ?? 0);
    return { ok: true, startTime: Math.max(0, startTime) };
  }

  if (anchor.kind === "simultaneousWith") {
    const thisDuration = effectiveClipDuration(thisSlot);
    const refDuration = refResolved.endTime - refResolved.startTime;
    let startTime: number;
    switch (anchor.alignment) {
      case "startAtStart":
        startTime = refResolved.startTime;
        break;
      case "endAtEnd":
        startTime = refResolved.endTime - thisDuration;
        break;
      case "centerAtCenter":
        startTime =
          refResolved.startTime + (refDuration - thisDuration) / 2;
        break;
    }
    startTime += anchor.offset ?? 0;
    return { ok: true, startTime: Math.max(0, startTime) };
  }

  // atFraction
  const refDuration = refResolved.endTime - refResolved.startTime;
  const fraction = Math.max(0, Math.min(1, anchor.fraction));
  const startTime = refResolved.startTime + refDuration * fraction;
  return { ok: true, startTime };
}

/**
 * Kahn-style topological sort of slots by anchor dependency.
 * Slots in a cycle are excluded (they're detected separately and positioned
 * at t=0 as a fallback). Slots not depending on anything come first; slots
 * depending only on already-resolved slots come next.
 */
function topologicalOrder(
  slots: SlotState[],
  anchors: Record<SlotId, AnchorEntry>,
  inCycle: Set<SlotId>
): SlotId[] {
  const slotIds = slots.map((s) => s.slotId);
  const inDegree = new Map<SlotId, number>();
  const dependents = new Map<SlotId, SlotId[]>();

  for (const id of slotIds) {
    inDegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const id of slotIds) {
    if (inCycle.has(id)) continue;
    const anchor = anchors[id]?.anchor;
    if (!anchor) continue;
    const ref = referencedSlotId(anchor);
    if (!ref) continue;
    // Only count the dep if the reference exists and isn't in a cycle.
    if (!inDegree.has(ref) || inCycle.has(ref)) continue;
    inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    dependents.get(ref)!.push(id);
  }

  const queue: SlotId[] = [];
  for (const id of slotIds) {
    if (inCycle.has(id)) continue;
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  }

  const order: SlotId[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const next = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }
  return order;
}

/**
 * Detect cycles in the anchor dependency graph. Returns one cycle per
 * strongly-connected component of size ≥ 2.
 */
function detectCycles(
  slots: SlotState[],
  anchors: Record<SlotId, AnchorEntry>
): SlotId[][] {
  // DFS with white/gray/black coloring.
  const color = new Map<SlotId, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  const stack: SlotId[] = [];
  const cycles: SlotId[][] = [];

  for (const slot of slots) color.set(slot.slotId, 0);

  function dfs(id: SlotId) {
    color.set(id, 1);
    stack.push(id);
    const anchor = anchors[id]?.anchor;
    const ref = anchor ? referencedSlotId(anchor) : null;
    if (ref && color.has(ref)) {
      const refColor = color.get(ref)!;
      if (refColor === 1) {
        // Back edge — cycle from ref to id to ref.
        const start = stack.indexOf(ref);
        cycles.push(stack.slice(start));
      } else if (refColor === 0) {
        dfs(ref);
      }
    }
    color.set(id, 2);
    stack.pop();
  }

  for (const slot of slots) {
    if (color.get(slot.slotId) === 0) dfs(slot.slotId);
  }
  return cycles;
}
