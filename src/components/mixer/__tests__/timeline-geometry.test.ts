import { describe, expect, it } from "vitest";
import {
  clampTailTrimDeltaPx,
  clipPercent,
  dropSecondsFor,
  isPastDragThreshold,
  tailTrimOnRelease,
  type TailTrimGesture,
} from "../timeline-geometry";

describe("clipPercent", () => {
  it("expresses start and duration as timeline percentages", () => {
    expect(clipPercent(5, 10, 20)).toEqual({ left: 25, width: 50 });
  });

  it("collapses on an empty timeline", () => {
    expect(clipPercent(5, 10, 0)).toEqual({ left: 0, width: 0 });
  });
});

describe("drag promotion and drop", () => {
  it("promotes to a drag only past the threshold, in either direction", () => {
    expect(isPastDragThreshold(3)).toBe(false);
    expect(isPastDragThreshold(-4)).toBe(true);
  });

  it("converts pixel delta into a drop start, clamped at 0", () => {
    expect(dropSecondsFor(2, 100, 50)).toBe(4);
    expect(dropSecondsFor(1, -200, 50)).toBe(0);
  });
});

describe("tail trim", () => {
  const gesture = (deltaPx: number): TailTrimGesture => ({
    deltaPx,
    pxPerSecond: 10,
    originEffectiveDuration: 4,
    sourceDuration: 6,
    trimStart: 1,
  });

  it("passes through deltas inside the source bounds", () => {
    expect(clampTailTrimDeltaPx(gesture(-10))).toBe(-10);
    expect(tailTrimOnRelease(gesture(-10))).toEqual({ start: 1, end: 4 });
  });

  it("cannot extend past the source tail", () => {
    // remaining source = 5s, origin 4s → at most +1s = +10px
    expect(clampTailTrimDeltaPx(gesture(100))).toBe(10);
    expect(tailTrimOnRelease(gesture(100))).toEqual({ start: 1, end: 6 });
  });

  it("cannot shrink below the minimum effective length", () => {
    expect(clampTailTrimDeltaPx(gesture(-100))).toBe(-39);
    expect(tailTrimOnRelease(gesture(-100)).end).toBeCloseTo(1.1);
  });
});
