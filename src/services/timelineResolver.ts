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
 *   - push:              clip joins the queue at its anchor's (slot, edge): it
 *     starts after the push clips placed there before it, so cues sharing a
 *     spot play one after another. A clip anchored to the same edge without
 *     push — the voice that follows it — keeps its place: a cue never moves a
 *     voice or the music.
 *
 * Cycles:
 *   - If a graph cycle exists (A's anchor refers to B, B's to A), the resolver
 *     emits an anchorCycle warning and positions the offending clips at t=0
 *     with a system-default fallback. Partial resolution still succeeds.
 *
 * Orphans:
 *   - If an anchor references an unknown slotId (slot removed upstream), the
 *     resolver emits an orphanAnchor warning and falls back to absolute(0).
 *
 * Reserved references ({@link TIMELINE_ORIGIN}, {@link ALL_VOICES}) stand for
 * spans rather than clips, so placements like "at beginning" and "at end"
 * can queue cues like any other edge.
 *
 * Resolution order: a clip is placed once everything it references is. Clips
 * that become ready together keep their slot order, so the cues queued at one
 * spot play in cue order.
 */

import type {
  Anchor,
  AnchorEntry,
  DurationPolicy,
  SlotId,
} from "@/types/versions";

// ============ Reserved references ============

/**
 * The start of the timeline, 0–0. "At beginning" cues queue on its end
 * (push); the first voice, anchored to it without push, still starts at 0.
 */
export const TIMELINE_ORIGIN: SlotId = "@origin";

/**
 * Every voice, from the earliest voice start to the latest voice end,
 * counting the cues queued (push) on any voice's end. So "at end" waits until
 * every voice has finished, and any cue queued on a voice's end too,
 * whichever line is last in the script. Placed once every voice and those
 * cues are.
 */
export const ALL_VOICES: SlotId = "@voices";

/** Whether `ref` is a reserved reference rather than a clip's slot. */
export function isReservedRef(ref: SlotId): boolean {
  return ref === TIMELINE_ORIGIN || ref === ALL_VOICES;
}

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
  /** Voice slots, for {@link ALL_VOICES}. */
  voiceSlotIds: SlotId[];
}

export function resolveTimeline(input: ResolverInput): ResolvedTimeline {
  const { slots, anchors, formatDuration } = input;
  const slotById = new Map<SlotId, SlotState>();
  for (const slot of slots) slotById.set(slot.slotId, slot);

  const state: ResolutionState = {
    resolved: new Map(),
    warnings: [],
    pushExtension: new Map(),
    voiceSlotIds: slots.filter((s) => s.type === "voice").map((s) => s.slotId),
  };

  const dependencies = dependencyMap(slots, anchors);

  // ---- Detect cycles before anything else ----
  const cycles = detectCycles(slots, dependencies);
  for (const cycle of cycles) {
    state.warnings.push({ kind: "anchorCycle", cycle });
  }
  const inCycle = new Set<SlotId>(cycles.flat());

  // ---- Determine resolution order ----
  const order = topologicalOrder(slots, dependencies, inCycle);

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

    const resolved = resolveAnchor(
      entry.anchor,
      slot,
      state,
      entry.layout === "push",
    );
    if (!resolved.ok) {
      state.warnings.push(resolved.warning);
      state.resolved.set(slotId, { startTime: 0, endTime: effectiveDuration });
      continue;
    }

    const startTime = resolved.startTime;
    const endTime = startTime + effectiveDuration;
    state.resolved.set(slotId, { startTime, endTime });

    if (entry.layout === "push") {
      // Push is only meaningful on a `relativeTo` anchor, which names one
      // (slot, edge) queue. Other anchor kinds (`absolute`,
      // `simultaneousWith`, `atFraction`) name no such queue, so we log and
      // place the clip as overlay. Push only lines up later push clips at
      // the same edge and never moves a non-push clip. A future
      // stage can introduce explicit push semantics for other kinds if
      // a drag interaction requires it; today's behavior is documented
      // as "push only composes with relativeTo".
      const pushKey = pushKeyForAnchor(entry.anchor);
      if (pushKey) {
        const referenceSlot = referencedSlotId(entry.anchor);
        const referenceEdge = referencedEdge(entry.anchor);
        const referenceSpan = referenceSlot
          ? spanOf(referenceSlot, state)
          : null;
        const referencePos =
          referenceSpan && referenceEdge
            ? referenceEdge === "start"
              ? referenceSpan.startTime
              : referenceSpan.endTime
            : 0;
        const extension = endTime - referencePos;
        if (extension > 0) {
          const prev = state.pushExtension.get(pushKey) ?? 0;
          state.pushExtension.set(pushKey, Math.max(prev, extension));
        }
      } else {
        console.warn(
          `[timelineResolver] layout:"push" is only supported on relativeTo anchors; ignored on ${entry.anchor.kind} for slot ${slotId}`,
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
    0,
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

/**
 * Where a referenced slot or reserved span sits, or null when the slot isn't
 * placed (unknown, or left out by a cycle).
 */
function spanOf(
  ref: SlotId,
  state: ResolutionState,
): { startTime: number; endTime: number } | null {
  if (ref === TIMELINE_ORIGIN) return { startTime: 0, endTime: 0 };
  if (ref === ALL_VOICES) return voicesSpan(state);
  return state.resolved.get(ref) ?? null;
}

/**
 * The span of every placed voice, its end pushed past any cues stacked on a
 * voice's end. 0–0 without voices.
 */
function voicesSpan(state: ResolutionState): {
  startTime: number;
  endTime: number;
} {
  let startTime = Infinity;
  let endTime = 0;
  for (const id of state.voiceSlotIds) {
    const voice = state.resolved.get(id);
    if (!voice) continue;

    startTime = Math.min(startTime, voice.startTime);
    endTime = Math.max(
      endTime,
      voice.endTime + (state.pushExtension.get(`${id}@end`) ?? 0),
    );
  }

  return { startTime: Number.isFinite(startTime) ? startTime : 0, endTime };
}

type AnchorResolution =
  | { ok: true; startTime: number }
  | { ok: false; warning: ResolverWarning };

/**
 * Where `thisSlot` starts under `anchor`. A `queued` (push) clip anchored to
 * an edge starts after the push clips already placed there; any other clip
 * anchored to that edge starts on the edge itself.
 */
function resolveAnchor(
  anchor: Anchor,
  thisSlot: SlotState,
  state: ResolutionState,
  queued: boolean,
): AnchorResolution {
  if (anchor.kind === "absolute") {
    return { ok: true, startTime: Math.max(0, anchor.t) };
  }

  const refResolved = spanOf(anchor.slotId, state);
  if (!refResolved) {
    return {
      ok: false,
      warning: {
        kind: "orphanAnchor",
        slotId: thisSlot.slotId,
        missingRef: anchor.slotId,
      },
    };
  }

  if (anchor.kind === "relativeTo") {
    const basePosition =
      anchor.edge === "start" ? refResolved.startTime : refResolved.endTime;
    const pushExt = queued
      ? (state.pushExtension.get(`${anchor.slotId}@${anchor.edge}`) ?? 0)
      : 0;
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
        startTime = refResolved.startTime + (refDuration - thisDuration) / 2;
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
 * What each slot waits for before it can be placed: the slot its anchor
 * references; nothing for {@link TIMELINE_ORIGIN} or an unknown slot; and for
 * {@link ALL_VOICES}, every voice plus the cues stacked on a voice's end.
 */
function dependencyMap(
  slots: SlotState[],
  anchors: Record<SlotId, AnchorEntry>,
): Map<SlotId, SlotId[]> {
  const known = new Set(slots.map((s) => s.slotId));
  const voices = slots.filter((s) => s.type === "voice").map((s) => s.slotId);
  const voiceSet = new Set(voices);
  const stackedOnVoices = slots
    .filter((s) => {
      const entry = anchors[s.slotId];
      return (
        entry?.layout === "push" &&
        entry.anchor.kind === "relativeTo" &&
        entry.anchor.edge === "end" &&
        voiceSet.has(entry.anchor.slotId)
      );
    })
    .map((s) => s.slotId);

  const dependencies = new Map<SlotId, SlotId[]>();
  for (const slot of slots) {
    const anchor = anchors[slot.slotId]?.anchor;
    const ref = anchor ? referencedSlotId(anchor) : null;

    if (ref === ALL_VOICES) {
      dependencies.set(
        slot.slotId,
        [...voices, ...stackedOnVoices].filter((id) => id !== slot.slotId),
      );
    } else {
      dependencies.set(slot.slotId, ref && known.has(ref) ? [ref] : []);
    }
  }
  return dependencies;
}

/**
 * Kahn-style topological sort of slots by anchor dependency.
 * Slots in a cycle are excluded (they're detected separately and positioned
 * at t=0 as a fallback). Slots not depending on anything come first; slots
 * depending only on already-resolved slots come next.
 */
function topologicalOrder(
  slots: SlotState[],
  dependencies: Map<SlotId, SlotId[]>,
  inCycle: Set<SlotId>,
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
    for (const ref of dependencies.get(id) ?? []) {
      // Only count the dep if it isn't in a cycle.
      if (inCycle.has(ref)) continue;
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      dependents.get(ref)!.push(id);
    }
  }

  const ready: SlotId[] = [];
  for (const id of slotIds) {
    if (inCycle.has(id)) continue;
    if ((inDegree.get(id) ?? 0) === 0) ready.push(id);
  }

  const order: SlotId[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const dep of dependents.get(id) ?? []) {
      const next = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, next);
      if (next === 0) ready.push(dep);
    }
  }
  return order;
}

/**
 * Detect cycles in the anchor dependency graph (see dependencyMap). Returns
 * the cycle closed by each back edge of a DFS. Cycles may overlap, and one
 * SCC can produce several. A clip anchored to itself yields a cycle of one.
 */
function detectCycles(
  slots: SlotState[],
  dependencies: Map<SlotId, SlotId[]>,
): SlotId[][] {
  // DFS with white/gray/black coloring.
  const color = new Map<SlotId, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  const stack: SlotId[] = [];
  const cycles: SlotId[][] = [];

  for (const slot of slots) color.set(slot.slotId, 0);

  function dfs(id: SlotId) {
    color.set(id, 1);
    stack.push(id);
    for (const ref of dependencies.get(id) ?? []) {
      const refColor = color.get(ref);
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
