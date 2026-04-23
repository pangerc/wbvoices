import { describe, it, expect, vi } from "vitest";
import {
  resolveTimeline,
  getSpeedupCap,
  AUTO_SPEEDUP_CAPS,
  DEFAULT_SPEEDUP_CAP,
  type SlotState,
  type ResolverInput,
} from "../timelineResolver";
import type { AnchorEntry } from "@/types/versions";

// ---------- Test helpers ----------

function voice(id: string, duration: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotId: id, type: "voice", sourceDuration: duration, ...extra };
}
function music(id: string, duration: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotId: id, type: "music", sourceDuration: duration, ...extra };
}
function sfx(id: string, duration: number, extra: Partial<SlotState> = {}): SlotState {
  return { slotId: id, type: "soundfx", sourceDuration: duration, ...extra };
}

function llmAnchor(entry: Omit<AnchorEntry, "origin">): AnchorEntry {
  return { ...entry, origin: "llm-seed" };
}

function track(resolved: ReturnType<typeof resolveTimeline>, slotId: string) {
  const t = resolved.tracks.find((x) => x.slotId === slotId);
  if (!t) throw new Error(`track ${slotId} not in result`);
  return t;
}

// ---------- Primitive resolution ----------

describe("resolveTimeline — anchor primitives", () => {
  it("absolute(t) places clip at t", () => {
    const input: ResolverInput = {
      slots: [sfx("s1", 2)],
      anchors: { s1: llmAnchor({ anchor: { kind: "absolute", t: 5 } }) },
    };
    const r = resolveTimeline(input);
    expect(track(r, "s1").startTime).toBe(5);
    expect(track(r, "s1").duration).toBe(2);
    expect(r.totalDuration).toBe(7);
  });

  it("absolute(t) with negative t clamps to 0", () => {
    const input: ResolverInput = {
      slots: [sfx("s1", 2)],
      anchors: { s1: llmAnchor({ anchor: { kind: "absolute", t: -3 } }) },
    };
    expect(track(resolveTimeline(input), "s1").startTime).toBe(0);
  });

  it("relativeTo(slot, end, 0) places clip at slot's end", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("s1", 1)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(track(r, "s1").startTime).toBe(4);
  });

  it("relativeTo with positive offset adds gap", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end", offset: 0.2 },
        }),
      },
    };
    expect(track(resolveTimeline(input), "v2").startTime).toBeCloseTo(4.2);
  });

  it("relativeTo with negative offset creates overlap", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end", offset: -0.15 },
        }),
      },
    };
    expect(track(resolveTimeline(input), "v2").startTime).toBeCloseTo(3.85);
  });

  it("simultaneousWith startAtStart aligns clips on start edge", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 5), sfx("ambience", 10)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 2 } }),
        ambience: llmAnchor({
          anchor: {
            kind: "simultaneousWith",
            slotId: "v1",
            alignment: "startAtStart",
          },
        }),
      },
    };
    expect(track(resolveTimeline(input), "ambience").startTime).toBe(2);
  });

  it("simultaneousWith endAtEnd puts clip ending at referenced end", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 5), sfx("stinger", 1.5)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 10 } }),
        stinger: llmAnchor({
          anchor: {
            kind: "simultaneousWith",
            slotId: "v1",
            alignment: "endAtEnd",
          },
        }),
      },
    };
    const stinger = track(resolveTimeline(input), "stinger");
    expect(stinger.startTime + stinger.duration).toBeCloseTo(15);
  });

  it("simultaneousWith centerAtCenter centers clip on referenced clip", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("beat", 1)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        beat: llmAnchor({
          anchor: {
            kind: "simultaneousWith",
            slotId: "v1",
            alignment: "centerAtCenter",
          },
        }),
      },
    };
    // Voice v1 [0..4], its center = 2. Beat duration 1 → starts at 1.5.
    expect(track(resolveTimeline(input), "beat").startTime).toBeCloseTo(1.5);
  });

  it("atFraction places clip at slot.start + duration * fraction", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 5), sfx("punctuator", 0.3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        punctuator: llmAnchor({
          anchor: { kind: "atFraction", slotId: "v1", fraction: 0.8 },
        }),
      },
    };
    expect(track(resolveTimeline(input), "punctuator").startTime).toBeCloseTo(4);
  });

  it("atFraction clamps fraction to [0,1]", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 5), sfx("s", 0.3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s: llmAnchor({ anchor: { kind: "atFraction", slotId: "v1", fraction: 2 } }),
      },
    };
    expect(track(resolveTimeline(input), "s").startTime).toBe(5); // clamped to f=1
  });
});

// ---------- Push layout (the sfx-overlays-voice-N+1 fix) ----------

describe("resolveTimeline — push layout", () => {
  it("push sfx after voice-N shifts voice-N+1 forward", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("s1", 1), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
          layout: "push",
        }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(track(r, "v1").startTime).toBe(0);
    expect(track(r, "s1").startTime).toBe(4);
    // v2 would overlap s1 in the legacy model; push layout shifts v2 to s1.end.
    expect(track(r, "v2").startTime).toBe(5);
  });

  it("overlay (default) layout does NOT shift siblings", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("s1", 1), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    // Both s1 and v2 anchored at v1.end = 4 with no push → both start at 4.
    expect(track(r, "s1").startTime).toBe(4);
    expect(track(r, "v2").startTime).toBe(4);
  });

  it("multiple push clips stack — each extends the push window", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("s1", 1), sfx("s2", 2), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
          layout: "push",
        }),
        s2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
          layout: "push",
        }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    // s1 at v1.end (4), duration 1 → pushExt = 1
    // s2 anchored at v1.end, but pushExt already 1 → starts at 5, duration 2 → pushExt = 3
    // v2 anchored at v1.end + pushExt(3) → starts at 7
    expect(track(r, "s1").startTime).toBe(4);
    expect(track(r, "s2").startTime).toBe(5);
    expect(track(r, "v2").startTime).toBe(7);
  });

  it("push on simultaneousWith is ignored (logs warning, siblings unaffected)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const input: ResolverInput = {
        slots: [voice("v1", 4), sfx("s1", 1), voice("v2", 3)],
        anchors: {
          v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
          s1: llmAnchor({
            anchor: {
              kind: "simultaneousWith",
              slotId: "v1",
              alignment: "endAtEnd",
            },
            layout: "push",
          }),
          v2: llmAnchor({
            anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
          }),
        },
      };
      const r = resolveTimeline(input);
      // s1 positioned at v1.end - 1 = 3 (endAtEnd alignment)
      // v2 should NOT be pushed — push is a no-op on simultaneousWith.
      expect(track(r, "v2").startTime).toBe(4);
      expect(warn).toHaveBeenCalled();
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes("layout:\"push\""))
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("push on atFraction is ignored (logs warning, siblings unaffected)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const input: ResolverInput = {
        slots: [voice("v1", 10), sfx("s1", 1), voice("v2", 3)],
        anchors: {
          v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
          s1: llmAnchor({
            anchor: { kind: "atFraction", slotId: "v1", fraction: 0.5 },
            layout: "push",
          }),
          v2: llmAnchor({
            anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
          }),
        },
      };
      const r = resolveTimeline(input);
      // s1 at 5, duration 1. v2 anchored at v1.end = 10, NOT pushed.
      expect(track(r, "v2").startTime).toBe(10);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("push layout respects its own positive offset", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), sfx("s1", 1), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        s1: llmAnchor({
          anchor: {
            kind: "relativeTo",
            slotId: "v1",
            edge: "end",
            offset: 0.5,
          },
          layout: "push",
        }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    // s1 at v1.end + 0.5 = 4.5, dur 1 → ends at 5.5 → pushExt = 1.5
    // v2 anchored at v1.end + pushExt = 4 + 1.5 = 5.5
    expect(track(r, "s1").startTime).toBeCloseTo(4.5);
    expect(track(r, "v2").startTime).toBeCloseTo(5.5);
  });
});

// ---------- Concurrent voices ----------

describe("resolveTimeline — concurrent voices", () => {
  it("two voices with simultaneousWith startAtStart overlap completely", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 3), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: {
            kind: "simultaneousWith",
            slotId: "v1",
            alignment: "startAtStart",
          },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(track(r, "v1").startTime).toBe(0);
    expect(track(r, "v2").startTime).toBe(0);
    expect(r.voiceActiveIntervals).toHaveLength(2);
  });

  it("voice with soft-interrupt overlap has negative offset anchor", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 4), voice("v2", 3)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: {
            kind: "relativeTo",
            slotId: "v1",
            edge: "end",
            offset: -0.2,
          },
        }),
      },
    };
    expect(track(resolveTimeline(input), "v2").startTime).toBeCloseTo(3.8);
  });
});

// ---------- Orphans and cycles ----------

describe("resolveTimeline — orphans", () => {
  it("anchor referencing unknown slot emits orphanAnchor warning and falls back to 0", () => {
    const input: ResolverInput = {
      slots: [sfx("s1", 2)],
      anchors: {
        s1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "ghost", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(track(r, "s1").startTime).toBe(0);
    expect(
      r.warnings.find(
        (w) => w.kind === "orphanAnchor" && w.slotId === "s1"
      )
    ).toMatchObject({ kind: "orphanAnchor", missingRef: "ghost" });
  });
});

describe("resolveTimeline — cycles", () => {
  it("two-clip cycle is detected and both fall back to 0", () => {
    const input: ResolverInput = {
      slots: [sfx("a", 1), sfx("b", 1)],
      anchors: {
        a: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "b", edge: "end" },
        }),
        b: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "a", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(track(r, "a").startTime).toBe(0);
    expect(track(r, "b").startTime).toBe(0);
    const cycleWarning = r.warnings.find((w) => w.kind === "anchorCycle");
    expect(cycleWarning).toBeDefined();
    expect((cycleWarning as { cycle: string[] }).cycle.sort()).toEqual(["a", "b"]);
  });
});

// ---------- Disclaimer protection ----------

describe("resolveTimeline — disclaimer", () => {
  it("disclaimer flag is carried through to resolved track", () => {
    const input: ResolverInput = {
      slots: [voice("disclaimer", 4, { isDisclaimer: true })],
      anchors: {
        disclaimer: llmAnchor({ anchor: { kind: "absolute", t: 10 } }),
      },
    };
    expect(track(resolveTimeline(input), "disclaimer").isDisclaimer).toBe(true);
  });

  it("disclaimer voice overlapping a non-disclaimer voice emits violation warning", () => {
    const input: ResolverInput = {
      slots: [
        voice("v1", 5),
        voice("legal", 3, { isDisclaimer: true }),
      ],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        legal: llmAnchor({ anchor: { kind: "absolute", t: 3 } }),
      },
    };
    const r = resolveTimeline(input);
    expect(
      r.warnings.find(
        (w) => w.kind === "disclaimerViolation" && w.slotId === "legal"
      )
    ).toBeDefined();
  });

  it("disclaimer placed after all voices does NOT emit violation", () => {
    const input: ResolverInput = {
      slots: [
        voice("v1", 4),
        voice("legal", 3, { isDisclaimer: true }),
      ],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        legal: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
      },
    };
    const r = resolveTimeline(input);
    expect(r.warnings.filter((w) => w.kind === "disclaimerViolation")).toEqual([]);
  });
});

// ---------- Over-budget warnings ----------

describe("resolveTimeline — format duration", () => {
  it("total duration exceeding format emits overBudget warning", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 20)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
      },
      formatDuration: 15,
    };
    const r = resolveTimeline(input);
    const overBudget = r.warnings.find((w) => w.kind === "overBudget");
    expect(overBudget).toMatchObject({
      kind: "overBudget",
      actualDuration: 20,
      targetDuration: 15,
    });
  });

  it("total duration within format emits no warning", () => {
    const input: ResolverInput = {
      slots: [voice("v1", 12)],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
      },
      formatDuration: 15,
    };
    expect(
      resolveTimeline(input).warnings.filter((w) => w.kind === "overBudget")
    ).toEqual([]);
  });
});

// ---------- Trim ----------

describe("resolveTimeline — trim overrides", () => {
  it("trim shortens the effective duration", () => {
    const input: ResolverInput = {
      slots: [music("m1", 30, { trim: { start: 0, end: 12 } })],
      anchors: {
        m1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
      },
    };
    expect(track(resolveTimeline(input), "m1").duration).toBe(12);
  });
});

// ---------- Per-locale speedup caps ----------

describe("getSpeedupCap", () => {
  it("returns per-locale cap for known languages", () => {
    expect(getSpeedupCap("zh")).toBe(AUTO_SPEEDUP_CAPS.zh);
    expect(getSpeedupCap("ar")).toBe(AUTO_SPEEDUP_CAPS.ar);
    expect(getSpeedupCap("pl")).toBe(AUTO_SPEEDUP_CAPS.pl);
    expect(getSpeedupCap("de")).toBe(AUTO_SPEEDUP_CAPS.de);
  });

  it("collapses locale family for regional variants", () => {
    expect(getSpeedupCap("en-US")).toBe(AUTO_SPEEDUP_CAPS.en);
    expect(getSpeedupCap("pt-BR")).toBe(AUTO_SPEEDUP_CAPS.pt);
    expect(getSpeedupCap("zh-CN")).toBe(AUTO_SPEEDUP_CAPS.zh);
  });

  it("falls back to default for unknown locales", () => {
    expect(getSpeedupCap("xx")).toBe(DEFAULT_SPEEDUP_CAP);
    expect(getSpeedupCap(undefined)).toBe(DEFAULT_SPEEDUP_CAP);
  });

  it("Mandarin cap is stricter than English cap", () => {
    expect(getSpeedupCap("zh")).toBeLessThan(getSpeedupCap("en"));
  });
});

// ---------- Voice-active intervals (for mix-time ducking) ----------

describe("resolveTimeline — voiceActiveIntervals", () => {
  it("returns sorted intervals for all voice tracks", () => {
    const input: ResolverInput = {
      slots: [
        voice("v2", 3),
        voice("v1", 4),
        music("m1", 30),
      ],
      anchors: {
        v1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end" },
        }),
        m1: llmAnchor({ anchor: { kind: "absolute", t: 0 } }),
      },
    };
    const r = resolveTimeline(input);
    expect(r.voiceActiveIntervals).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 7 },
    ]);
  });
});

// ---------- End-to-end scenario ----------

describe("resolveTimeline — realistic 30s ad scenario", () => {
  it("intro sfx + 3 voices + music + outro stinger resolve correctly", () => {
    const input: ResolverInput = {
      slots: [
        sfx("opener", 0.6),
        voice("v1", 3),
        voice("v2", 4),
        voice("v3", 3.5, { isDisclaimer: true }),
        music("bed", 30),
        sfx("stinger", 0.8),
      ],
      anchors: {
        // SFX opener before voices, pushes voice-1 forward
        opener: llmAnchor({
          anchor: { kind: "absolute", t: 0 },
          layout: "push",
        }),
        // Voices sequence after opener end
        v1: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "opener", edge: "end" },
        }),
        v2: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v1", edge: "end", offset: 0.1 },
        }),
        v3: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v2", edge: "end", offset: 0.1 },
        }),
        // Music bed simultaneous with first voice start
        bed: llmAnchor({
          anchor: {
            kind: "simultaneousWith",
            slotId: "v1",
            alignment: "startAtStart",
            offset: -0.3,
          },
        }),
        // Stinger at disclaimer end
        stinger: llmAnchor({
          anchor: { kind: "relativeTo", slotId: "v3", edge: "end" },
        }),
      },
      formatDuration: 30,
    };
    const r = resolveTimeline(input);

    // Opener at 0, duration 0.6
    expect(track(r, "opener").startTime).toBe(0);
    // v1 starts after opener push — opener duration 0.6, so v1 at 0.6
    expect(track(r, "v1").startTime).toBeCloseTo(0.6);
    expect(track(r, "v2").startTime).toBeCloseTo(3.7);
    expect(track(r, "v3").startTime).toBeCloseTo(7.8);
    expect(track(r, "bed").startTime).toBeCloseTo(0.3); // v1.start - 0.3
    expect(track(r, "stinger").startTime).toBeCloseTo(11.3);
    expect(r.totalDuration).toBeCloseTo(30.3); // music bed extends to 30.3
    expect(r.warnings.filter((w) => w.kind === "overBudget")).toHaveLength(1);
  });
});
