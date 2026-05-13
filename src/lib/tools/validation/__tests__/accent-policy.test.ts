import { describe, expect, it } from "vitest";
import { canonicalAccentTag, resolveAccentForLint } from "../accent-policy";

describe("resolveAccentForLint", () => {
  it("returns lowercase accent for real names", () => {
    expect(resolveAccentForLint("parisian")).toBe("parisian");
    expect(resolveAccentForLint("PARISIAN")).toBe("parisian");
    expect(resolveAccentForLint("  Chilean  ")).toBe("chilean");
    expect(resolveAccentForLint("flemish")).toBe("flemish");
    expect(resolveAccentForLint("latin_american")).toBe("latin_american");
  });

  it("skips sentinel values that mean 'no accent worth enforcing'", () => {
    expect(resolveAccentForLint("neutral")).toBeNull();
    expect(resolveAccentForLint("standard")).toBeNull();
    expect(resolveAccentForLint("default")).toBeNull();
    expect(resolveAccentForLint("Neutral")).toBeNull();
  });

  it("skips short ISO-2 region codes that leak into the accent column", () => {
    // Lovo regional voices carry codes like "al" / "bg" / "hr" — these don't
    // render naturally as `[strong al accent]`. Skip them.
    expect(resolveAccentForLint("al")).toBeNull();
    expect(resolveAccentForLint("bg")).toBeNull();
    expect(resolveAccentForLint("hr")).toBeNull();
    expect(resolveAccentForLint("af")).toBeNull();
  });

  it("returns null for empty / null input", () => {
    expect(resolveAccentForLint(null)).toBeNull();
    expect(resolveAccentForLint(undefined)).toBeNull();
    expect(resolveAccentForLint("")).toBeNull();
    expect(resolveAccentForLint("   ")).toBeNull();
  });
});

describe("canonicalAccentTag", () => {
  it("renders the documented [strong X accent] form", () => {
    expect(canonicalAccentTag("parisian")).toBe("[strong parisian accent]");
    expect(canonicalAccentTag("MEXICAN")).toBe("[strong mexican accent]");
  });

  it("returns null when no accent should be enforced", () => {
    expect(canonicalAccentTag("neutral")).toBeNull();
    expect(canonicalAccentTag("standard")).toBeNull();
    expect(canonicalAccentTag(undefined)).toBeNull();
  });
});
