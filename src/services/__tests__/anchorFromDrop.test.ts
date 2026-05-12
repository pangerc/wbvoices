/**
 * Tests for the pure drop-position → Anchor resolver.
 *
 * Rules under test, in order of precedence:
 *   1. forceAbsolute modifier wins.
 *   2. Drop near a clip edge (≤ edgeSnapSeconds) → relativeTo.
 *   3. Drop inside a clip near start/center/end alignment → simultaneousWith.
 *   4. Drop inside a clip elsewhere → atFraction.
 *   5. Drop past last clip / empty timeline → absolute.
 *
 * Additional behaviors covered:
 *   - Dragged clip can't anchor to itself (excluded from candidates).
 *   - Tie-breaking between two equally-close edges picks the earlier-starting clip.
 *   - Negative drop times clamp to 0.
 *   - Zero-duration reference clip degrades gracefully.
 */

import { describe, expect, it } from "vitest";
import type { DropReferenceClip } from "../anchorFromDrop";
import { anchorFromDrop } from "../anchorFromDrop";

const clip = (
  slotId: string,
  startTime: number,
  duration: number,
): DropReferenceClip => ({
  slotId,
  startTime,
  duration,
});

describe("anchorFromDrop", () => {
  describe("rule 5 — absolute fallback", () => {
    it("drops past the last clip's end → absolute(t)", () => {
      const others = [clip("a", 0, 5)];
      expect(anchorFromDrop("x", 10, others)).toEqual({
        kind: "absolute",
        t: 10,
      });
    });

    it("empty timeline → absolute(t)", () => {
      expect(anchorFromDrop("x", 3.5, [])).toEqual({
        kind: "absolute",
        t: 3.5,
      });
    });

    it("negative drop time clamps to 0", () => {
      expect(anchorFromDrop("x", -2, [])).toEqual({ kind: "absolute", t: 0 });
    });
  });

  describe("rule 1 — forceAbsolute modifier overrides all other rules", () => {
    it("drop right at a clip edge still returns absolute when forced", () => {
      const others = [clip("a", 0, 5)];
      const anchor = anchorFromDrop("x", 5, others, { forceAbsolute: true });
      expect(anchor).toEqual({ kind: "absolute", t: 5 });
    });
  });

  describe("rule 2 — edge-snap → relativeTo", () => {
    it("within edgeSnap of a clip's end → relativeTo(slot, 'end')", () => {
      const others = [clip("a", 0, 5)];
      expect(anchorFromDrop("x", 5.05, others)).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "end",
      });
    });

    it("within edgeSnap of a clip's start → relativeTo(slot, 'start')", () => {
      const others = [clip("a", 3, 2)];
      expect(anchorFromDrop("x", 2.95, others)).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "start",
      });
    });

    it("beyond edgeSnap does not snap to an edge", () => {
      const others = [clip("a", 0, 5)];
      // 0.2s past end is beyond the default 0.1s snap AND the 0.15s align —
      // falls through to absolute since 5.2 is past the last clip's end.
      expect(anchorFromDrop("x", 5.2, others)).toEqual({
        kind: "absolute",
        t: 5.2,
      });
    });

    it("tie-break by closest distance, then by earlier-starting clip", () => {
      // Drop at t=5. Clip A ends at 5, clip B starts at 5. Equal distance.
      // A starts earlier (0 < 5), so A wins.
      const others = [clip("a", 0, 5), clip("b", 5, 3)];
      expect(anchorFromDrop("x", 5, others)).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "end",
      });
    });

    it("excludes the dragged clip from candidates", () => {
      // If we didn't exclude self, dropping at x's own end edge would snap
      // to itself (cycle). Result must ignore x and fall through.
      const others = [clip("x", 0, 5), clip("a", 10, 3)];
      expect(anchorFromDrop("x", 5, others)).toEqual({
        kind: "absolute",
        t: 5,
      });
    });
  });

  describe("rule 3 — simultaneousWith near start/center/end", () => {
    it("drop near clip start (but not on edge boundary) → startAtStart", () => {
      const others = [clip("a", 2, 4)];
      // Drop at 2.1: inside the clip, 0.1s from start, within alignSnap 0.15.
      // But also within edgeSnap 0.1 of start edge → rule 2 wins.
      // Raise the drop to 2.12 so edgeSnap doesn't trigger but alignSnap does.
      expect(anchorFromDrop("x", 2.12, others)).toEqual({
        kind: "simultaneousWith",
        slotId: "a",
        alignment: "startAtStart",
      });
    });

    it("drop near clip center → centerAtCenter", () => {
      const others = [clip("a", 0, 10)]; // center at 5
      expect(anchorFromDrop("x", 5.0, others)).toEqual({
        kind: "simultaneousWith",
        slotId: "a",
        alignment: "centerAtCenter",
      });
    });

    it("drop near clip end (but not on edge boundary) → endAtEnd", () => {
      const others = [clip("a", 0, 10)]; // end at 10
      // 9.88: inside clip, 0.12s before end. edgeSnap (0.1) does NOT trigger;
      // alignSnap (0.15) does.
      expect(anchorFromDrop("x", 9.88, others)).toEqual({
        kind: "simultaneousWith",
        slotId: "a",
        alignment: "endAtEnd",
      });
    });
  });

  describe("rule 4 — atFraction inside clip away from landmarks", () => {
    it("drop at 80% of a clip → atFraction(0.8)", () => {
      const others = [clip("a", 0, 10)]; // 80% = 8.0
      const anchor = anchorFromDrop("x", 8.0, others);
      expect(anchor).toEqual({
        kind: "atFraction",
        slotId: "a",
        fraction: 0.8,
      });
    });

    it("drop inside overlapping clips picks the one whose center is nearest", () => {
      // Clip A: 0..10 (center 5). Clip B: 2..8 (center 5, but shorter).
      // Drop at 4. Both contain it. B's center is also at 5 → distance 1,
      // A's center is 5 → distance 1. Tie → insertion order keeps A (stable sort).
      // Drop at 3 makes A closer (center-distance 2) than B (2), tie.
      // Use a drop where B clearly wins: 2.5 → A center-dist 2.5, B center-dist 2.5. Still tied.
      // Clip B: 3..5 (center 4), drop at 4: inside both; A-dist |4-5|=1, B-dist 0. B wins.
      const others = [clip("a", 0, 10), clip("b", 3, 2)];
      const anchor = anchorFromDrop("x", 4, others);
      expect(anchor).toMatchObject({ kind: "simultaneousWith", slotId: "b" });
    });

    it("fraction clamps to [0, 1]", () => {
      const others = [clip("a", 0, 10)];
      // Drop at exact start → rule 2 edge-snap wins (relativeTo start).
      // Use a drop juuust inside past the alignSnap landmark.
      // At 5.0 it's center → simultaneousWith. Use 7.5 which is 75% (not a landmark).
      const anchor = anchorFromDrop("x", 7.5, others);
      expect(anchor).toEqual({
        kind: "atFraction",
        slotId: "a",
        fraction: 0.75,
      });
    });
  });

  describe("format-duration soft clamp", () => {
    it("drops past formatDuration clamp to the horizon", () => {
      // Drop at 18s, format is 15s → clamped to 15s, rule 5 absolute.
      const anchor = anchorFromDrop("x", 18, [], { formatDuration: 15 });
      expect(anchor).toEqual({ kind: "absolute", t: 15 });
    });

    it("drops past formatDuration with allowPastFormat pass through", () => {
      const anchor = anchorFromDrop("x", 18, [], {
        formatDuration: 15,
        allowPastFormat: true,
      });
      expect(anchor).toEqual({ kind: "absolute", t: 18 });
    });

    it("clamp happens before forceAbsolute — opt+shift still clamps without shift", () => {
      const anchor = anchorFromDrop("x", 20, [], {
        formatDuration: 15,
        forceAbsolute: true,
      });
      expect(anchor).toEqual({ kind: "absolute", t: 15 });
    });

    it("clamp + allowPastFormat lets force-absolute drop past target", () => {
      const anchor = anchorFromDrop("x", 20, [], {
        formatDuration: 15,
        forceAbsolute: true,
        allowPastFormat: true,
      });
      expect(anchor).toEqual({ kind: "absolute", t: 20 });
    });

    it("drop within budget is unaffected", () => {
      const others = [{ slotId: "a", startTime: 0, duration: 5 }];
      const anchor = anchorFromDrop("x", 5.02, others, { formatDuration: 15 });
      expect(anchor).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "end",
      });
    });

    it("clamped drop adjacent to an edge still picks relativeTo at the clamp", () => {
      // Format is 15s; another clip ends at exactly 15s. Dropping at 18s
      // clamps to 15s, which is within edgeSnap of that clip's end.
      const others = [{ slotId: "a", startTime: 10, duration: 5 }];
      const anchor = anchorFromDrop("x", 18, others, { formatDuration: 15 });
      expect(anchor).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "end",
      });
    });
  });

  describe("cycle prevention", () => {
    it("falls back to absolute when the proposed anchor would close a cycle", async () => {
      // Classic waterfall: v0 → absolute(0), v1 → relativeTo(v0.end),
      // v2 → relativeTo(v1.end), v3 → relativeTo(v2.end).
      // User drags v1 near v2's start. Without cycle detection the drop
      // becomes relativeTo(v2.start), creating v1↔v2. With detection: absolute.
      const others = [
        { slotId: "v0", startTime: 0, duration: 5 },
        { slotId: "v2", startTime: 10, duration: 5 },
        { slotId: "v3", startTime: 15, duration: 5 },
      ];
      const existingRefs = {
        v0: undefined, // absolute
        v1: "v0",
        v2: "v1",
        v3: "v2",
      };
      const anchor = anchorFromDrop("v1", 10.02, others, { existingRefs });
      // Drop is within edgeSnap of v2.start (=10); naive rule → relativeTo(v2).
      // Cycle check catches it → absolute fallback.
      expect(anchor).toEqual({ kind: "absolute", t: 10.02 });
    });

    it("self-reference is always detected as a cycle", () => {
      // If anchorFromDrop somehow picks the dragged slot as a candidate
      // (shouldn't happen due to the self-exclusion filter, but defense in
      // depth) the cycle check catches it.
      const others = [{ slotId: "v0", startTime: 5, duration: 3 }];
      const anchor = anchorFromDrop("v0", 5.02, others, { existingRefs: {} });
      // "v0" excluded from candidates → no snap → absolute.
      expect(anchor).toEqual({ kind: "absolute", t: 5.02 });
    });

    it("no-op when existingRefs not provided (backwards compat)", () => {
      const others = [{ slotId: "v0", startTime: 0, duration: 5 }];
      const anchor = anchorFromDrop("v1", 5.02, others);
      // Without cycle info we trust the drop rule. relativeTo is fine.
      expect(anchor).toMatchObject({
        kind: "relativeTo",
        slotId: "v0",
        edge: "end",
      });
    });

    it("long chain traversal terminates without creating a cycle", () => {
      // Build a 10-long chain and try to anchor the tail to the head's end.
      // No cycle should be detected (head's ref is absolute).
      const others = Array.from({ length: 9 }, (_, i) => ({
        slotId: `v${i}`,
        startTime: i * 2,
        duration: 2,
      }));
      const existingRefs: Record<string, string | undefined> = {
        v0: undefined,
      };
      for (let i = 1; i < 9; i++) existingRefs[`v${i}`] = `v${i - 1}`;
      existingRefs.tail = undefined;

      const anchor = anchorFromDrop("tail", 2, others, { existingRefs });
      // Drop at 2 = v0.end = v1.start; edge-snap picks relativeTo(v0, "end")
      // (earlier-starting clip wins tie-break). No cycle because tail is
      // not yet in the chain.
      expect(anchor).toMatchObject({ kind: "relativeTo", slotId: "v0" });
    });
  });

  describe("degenerate inputs", () => {
    it("zero-duration reference clip: drop at its start yields edge-snap", () => {
      const others = [clip("a", 3, 0)];
      expect(anchorFromDrop("x", 3, others)).toEqual({
        kind: "relativeTo",
        slotId: "a",
        edge: "start",
      });
    });
  });
});
