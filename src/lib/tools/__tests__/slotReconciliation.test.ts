import { describe, it, expect } from "vitest";
import { reconcileSlots } from "../slotReconciliation";

// Deterministic id minter for tests — produces id-0, id-1, ... in call order.
function makeCounter() {
  let n = 0;
  return () => `id-${n++}`;
}

describe("reconcileSlots", () => {
  it("no parent — every slot is freshly created", () => {
    const mint = makeCounter();
    const { assigned, report } = reconcileSlots(null, 3, "voices", null, mint);

    expect(assigned).toEqual(["id-0", "id-1", "id-2"]);
    expect(report.parentVersionId).toBeNull();
    expect(report.preserved).toEqual([]);
    expect(report.created).toEqual([
      { slotId: "id-0", ordinalIndex: 0 },
      { slotId: "id-1", ordinalIndex: 1 },
      { slotId: "id-2", ordinalIndex: 2 },
    ]);
    expect(report.orphaned).toEqual([]);
  });

  it("parent and new have the same count — all preserved, none orphaned", () => {
    const mint = makeCounter();
    const parent = ["a", "b", "c"];
    const { assigned, report } = reconcileSlots(
      parent,
      3,
      "voices",
      "v4",
      mint,
    );

    expect(assigned).toEqual(["a", "b", "c"]);
    expect(report.parentVersionId).toBe("v4");
    expect(report.preserved).toEqual([
      { slotId: "a", ordinalIndex: 0 },
      { slotId: "b", ordinalIndex: 1 },
      { slotId: "c", ordinalIndex: 2 },
    ]);
    expect(report.created).toEqual([]);
    expect(report.orphaned).toEqual([]);
  });

  it("new draft adds a track — first N preserved, trailing are created", () => {
    const mint = makeCounter();
    const parent = ["a", "b"];
    const { assigned, report } = reconcileSlots(
      parent,
      4,
      "voices",
      "v2",
      mint,
    );

    expect(assigned).toEqual(["a", "b", "id-0", "id-1"]);
    expect(report.preserved).toHaveLength(2);
    expect(report.created).toEqual([
      { slotId: "id-0", ordinalIndex: 2 },
      { slotId: "id-1", ordinalIndex: 3 },
    ]);
    expect(report.orphaned).toEqual([]);
  });

  it("new draft drops a track — first N preserved, remaining parent slots orphaned", () => {
    const mint = makeCounter();
    const parent = ["a", "b", "c", "d"];
    const { assigned, report } = reconcileSlots(
      parent,
      2,
      "voices",
      "v5",
      mint,
    );

    expect(assigned).toEqual(["a", "b"]);
    expect(report.preserved).toEqual([
      { slotId: "a", ordinalIndex: 0 },
      { slotId: "b", ordinalIndex: 1 },
    ]);
    expect(report.created).toEqual([]);
    expect(report.orphaned).toEqual([
      { slotId: "c", ordinalIndex: 2 },
      { slotId: "d", ordinalIndex: 3 },
    ]);
  });

  it("parent with missing slotIds at some ordinals (legacy pre-slotId data) — mints fresh ids at those ordinals", () => {
    const mint = makeCounter();
    const parent = ["a", undefined, "c"];
    const { assigned, report } = reconcileSlots(
      parent,
      3,
      "voices",
      "v1",
      mint,
    );

    expect(assigned).toEqual(["a", "id-0", "c"]);
    expect(report.preserved).toEqual([
      { slotId: "a", ordinalIndex: 0 },
      { slotId: "c", ordinalIndex: 2 },
    ]);
    expect(report.created).toEqual([{ slotId: "id-0", ordinalIndex: 1 }]);
    expect(report.orphaned).toEqual([]);
  });

  it("orphaned parent slots that are undefined are not reported", () => {
    const mint = makeCounter();
    // Parent had 4 tracks but slotIds only minted for indices 0 and 2
    const parent = ["a", undefined, "c", undefined];
    const { assigned, report } = reconcileSlots(
      parent,
      2,
      "voices",
      "v3",
      mint,
    );

    expect(assigned).toEqual(["a", "id-0"]);
    // Ordinal 1 was preserved-but-freshly-minted; ordinals 2+3 are dropped.
    // Only the real slotId "c" at ordinal 2 goes to orphaned; undefined at 3 is silent.
    expect(report.orphaned).toEqual([{ slotId: "c", ordinalIndex: 2 }]);
  });

  it("single-slot music stream — one preserved", () => {
    const mint = makeCounter();
    const { assigned, report } = reconcileSlots(
      ["music-slot"],
      1,
      "music",
      "v2",
      mint,
    );

    expect(assigned).toEqual(["music-slot"]);
    expect(report.stream).toBe("music");
    expect(report.preserved).toEqual([
      { slotId: "music-slot", ordinalIndex: 0 },
    ]);
  });

  it("music with parent pre-dating slotIds — mints one fresh", () => {
    const mint = makeCounter();
    const { assigned, report } = reconcileSlots(
      [undefined],
      1,
      "music",
      "v1",
      mint,
    );

    expect(assigned).toEqual(["id-0"]);
    expect(report.created).toEqual([{ slotId: "id-0", ordinalIndex: 0 }]);
    expect(report.preserved).toEqual([]);
  });

  it("newCount === 0 — every parent slot orphaned, no assignments", () => {
    const mint = makeCounter();
    const parent = ["a", "b"];
    const { assigned, report } = reconcileSlots(parent, 0, "sfx", "v3", mint);

    expect(assigned).toEqual([]);
    expect(report.preserved).toEqual([]);
    expect(report.created).toEqual([]);
    expect(report.orphaned).toEqual([
      { slotId: "a", ordinalIndex: 0 },
      { slotId: "b", ordinalIndex: 1 },
    ]);
  });

  it("newCount === 0 and no parent — empty report, no ids minted", () => {
    const mint = makeCounter();
    const { assigned, report } = reconcileSlots(null, 0, "sfx", null, mint);

    expect(assigned).toEqual([]);
    expect(report.preserved).toEqual([]);
    expect(report.created).toEqual([]);
    expect(report.orphaned).toEqual([]);
    // Ensure the minter was not called for a zero-count fresh stream
    expect(mint()).toBe("id-0");
  });

  it("default minter produces unique ids (spot check — cryptographic uniqueness is crypto's job)", () => {
    const { assigned } = reconcileSlots(null, 4, "voices", null);
    const unique = new Set(assigned);
    expect(unique.size).toBe(4);
  });

  it("report.stream field reflects the caller's stream type", () => {
    const voices = reconcileSlots(null, 1, "voices", null);
    const music = reconcileSlots(null, 1, "music", null);
    const sfx = reconcileSlots(null, 1, "sfx", null);

    expect(voices.report.stream).toBe("voices");
    expect(music.report.stream).toBe("music");
    expect(sfx.report.stream).toBe("sfx");
  });
});
