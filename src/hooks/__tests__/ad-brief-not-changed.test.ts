import { ProjectBrief } from "@/types";
import { describe, expect, it } from "vitest";
import { isNotChanged } from "../ad-brief-not-changed";

const brief: ProjectBrief = {
  clientDescription: "description",
  creativeBrief: "brief",
  campaignFormat: "ad_read",
  selectedLanguage: "en",
  selectedProvider: "qwen",
  selectedAccent: "cool",
  adDuration: 30,
};

const withBrief = (overrides: Partial<ProjectBrief>): ProjectBrief => ({
  ...brief,
  ...overrides,
});

describe("isNotChanged", () => {
  it("returns true for the same reference", () => {
    expect(isNotChanged(brief, brief)).toBe(true);
  });

  it("returns true for structurally identical clones", () => {
    expect(isNotChanged(brief, { ...brief })).toBe(true);
  });

  describe("nullish equivalence", () => {
    it('treats null, undefined, and "\"\"" as equal for string fields', () => {
      const a = withBrief({ selectedCTA: null });
      const b = withBrief({ selectedCTA: undefined });
      const c = withBrief({ selectedCTA: "" });

      expect(isNotChanged(a, b)).toBe(true);
      expect(isNotChanged(b, c)).toBe(true);
      expect(isNotChanged(a, c)).toBe(true);
    });

    it("does not treat a real value as equal to empty", () => {
      const a = withBrief({ selectedCTA: "buy_now" });
      const b = withBrief({ selectedCTA: null });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it("compares real string values strictly", () => {
      const a = withBrief({ clientDescription: "alpha" });
      const b = withBrief({ clientDescription: "beta" });

      expect(isNotChanged(a, b)).toBe(false);
    });
  });

  describe("selectedRegion", () => {
    it.each([
      ["all", null],
      ["all", undefined],
      ["all", ""],
      [null, undefined],
      [null, ""],
    ] as const)("treats %p and %p as equal", (left, right) => {
      const a = withBrief({ selectedRegion: left });
      const b = withBrief({ selectedRegion: right });

      expect(isNotChanged(a, b)).toBe(true);
    });

    it("treats two different concrete regions as unequal", () => {
      const a = withBrief({ selectedRegion: "us" });
      const b = withBrief({ selectedRegion: "uk" });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it('treats a concrete region and "all" as unequal', () => {
      const a = withBrief({ selectedRegion: "us" });
      const b = withBrief({ selectedRegion: "all" });

      expect(isNotChanged(a, b)).toBe(false);
    });
  });

  describe("adDuration", () => {
    it("compares strictly — 30 equals 30", () => {
      expect(
        isNotChanged(
          withBrief({ adDuration: 30 }),
          withBrief({ adDuration: 30 }),
        ),
      ).toBe(true);
    });

    it("compares strictly — 30 does not equal 60", () => {
      expect(
        isNotChanged(
          withBrief({ adDuration: 30 }),
          withBrief({ adDuration: 60 }),
        ),
      ).toBe(false);
    });
  });

  describe("referenceUrls", () => {
    it("treats undefined and an empty array as equal", () => {
      const a = withBrief({ referenceUrls: undefined });
      const b = withBrief({ referenceUrls: [] });

      expect(isNotChanged(a, b)).toBe(true);
    });

    it("treats two empty arrays as equal", () => {
      expect(
        isNotChanged(
          withBrief({ referenceUrls: [] }),
          withBrief({ referenceUrls: [] }),
        ),
      ).toBe(true);
    });

    it("treats arrays with the same items in the same order as equal", () => {
      const a = withBrief({ referenceUrls: ["https://a", "https://b"] });
      const b = withBrief({ referenceUrls: ["https://a", "https://b"] });

      expect(isNotChanged(a, b)).toBe(true);
    });

    it("treats different orderings as unequal", () => {
      const a = withBrief({ referenceUrls: ["https://a", "https://b"] });
      const b = withBrief({ referenceUrls: ["https://b", "https://a"] });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it("treats different lengths as unequal", () => {
      const a = withBrief({ referenceUrls: ["https://a"] });
      const b = withBrief({ referenceUrls: ["https://a", "https://b"] });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it("treats a populated array and undefined as unequal", () => {
      const a = withBrief({ referenceUrls: ["https://a"] });
      const b = withBrief({ referenceUrls: undefined });

      expect(isNotChanged(a, b)).toBe(false);
    });
  });

  describe("brand", () => {
    it("treats two undefined brands as equal", () => {
      expect(
        isNotChanged(
          withBrief({ brand: undefined }),
          withBrief({ brand: undefined }),
        ),
      ).toBe(true);
    });

    it("treats brands with the same name and salesforceAccountId as equal", () => {
      const a = withBrief({
        brand: { name: "Acme", salesforceAccountId: "001ABC" },
      });
      const b = withBrief({
        brand: { name: "Acme", salesforceAccountId: "001ABC" },
      });

      expect(isNotChanged(a, b)).toBe(true);
    });

    it("ignores differences in salesforceAccountSnapshot", () => {
      const a = withBrief({
        brand: {
          name: "Acme",
          salesforceAccountId: "001ABC",
          salesforceAccountSnapshot: {
            id: "001ABC",
            name: "Acme",
            industry: "Tech",
          },
        },
      });
      const b = withBrief({
        brand: {
          name: "Acme",
          salesforceAccountId: "001ABC",
          salesforceAccountSnapshot: {
            id: "001ABC",
            name: "Acme Inc",
            industry: "Software",
          },
        },
      });

      expect(isNotChanged(a, b)).toBe(true);
    });

    it("treats brands with different names as unequal", () => {
      const a = withBrief({ brand: { name: "Acme" } });
      const b = withBrief({ brand: { name: "Globex" } });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it("treats brands with different salesforceAccountIds as unequal", () => {
      const a = withBrief({
        brand: { name: "Acme", salesforceAccountId: "001ABC" },
      });
      const b = withBrief({
        brand: { name: "Acme", salesforceAccountId: "001XYZ" },
      });

      expect(isNotChanged(a, b)).toBe(false);
    });

    it("treats undefined and a populated brand as unequal", () => {
      const a = withBrief({ brand: undefined });
      const b = withBrief({ brand: { name: "Acme" } });

      expect(isNotChanged(a, b)).toBe(false);
    });
  });

  describe("change detection per field", () => {
    it.each<keyof ProjectBrief>([
      "clientDescription",
      "creativeBrief",
      "campaignFormat",
      "selectedLanguage",
      "selectedProvider",
      "selectedAccent",
      "selectedAiModel",
      "musicProvider",
      "selectedCTA",
      "selectedPacing",
      "forbiddenWords",
      "providedScript",
      "creativeAngle",
      "varianceMode",
      "selectedTone",
      "voiceInstructions",
    ])("flags a change in %s", (field) => {
      const a = withBrief({
        [field]: "value-a",
      } satisfies Partial<ProjectBrief>);
      const b = withBrief({
        [field]: "value-b",
      } satisfies Partial<ProjectBrief>);

      expect(isNotChanged(a, b)).toBe(false);
    });
  });
});
