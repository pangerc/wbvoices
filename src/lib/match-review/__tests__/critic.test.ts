import { afterEach, describe, expect, it } from "vitest";
import {
  applicableDimensions,
  coerceCriticFindings,
  shouldRunCritic,
} from "../critic";
import type { ReviewBrief, ReviewResult } from "../types";

const briefBase: ReviewBrief = {
  creativeMode: "brief",
  creativeBrief: "Promote the summer sale.",
  selectedLanguage: "en",
  campaignFormat: "ad_read",
  adDuration: 30,
};

const withScript: ReviewResult = {
  voiceTracks: [{ text: "Come to our summer sale today!", language: "en" }],
};

describe("applicableDimensions", () => {
  it("returns intent when a brief drives it", () => {
    expect(applicableDimensions(briefBase)).toContain("intent");
  });

  it("skips intent in script mode", () => {
    const d = applicableDimensions({ ...briefBase, creativeMode: "script" });
    expect(d).not.toContain("intent");
  });

  it("adds cta / tone / brand only when set", () => {
    const d = applicableDimensions({
      ...briefBase,
      selectedCTA: "Visit spotify.com",
      selectedPacing: "fast",
      brandName: "Acme",
    });
    expect(d).toEqual(
      expect.arrayContaining(["cta", "tone", "intent", "brand"]),
    );
  });

  it("returns nothing for an empty brief", () => {
    expect(applicableDimensions({ creativeMode: "brief" })).toEqual([]);
  });
});

describe("shouldRunCritic", () => {
  const prev = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  });

  it("is false without an API key", () => {
    delete process.env.OPENAI_API_KEY;
    expect(shouldRunCritic(briefBase, withScript)).toBe(false);
  });

  it("is false with a key but no script", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(shouldRunCritic(briefBase, { voiceTracks: [] })).toBe(false);
  });

  it("is true with a key, a script and an applicable dimension", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(shouldRunCritic(briefBase, withScript)).toBe(true);
  });

  it("is false when nothing applies even with key + script", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(shouldRunCritic({ creativeMode: "brief" }, withScript)).toBe(false);
  });
});

describe("coerceCriticFindings", () => {
  const allowed = new Set(["cta", "tone", "intent", "brand"]);

  it("keeps a valid mismatch and lifts instruction into apply", () => {
    const raw = {
      findings: [
        {
          dimension: "cta",
          matched: false,
          severity: "high",
          expected: "Visit spotify.com",
          actual: "no CTA",
          explanation: "The CTA is missing.",
          improvements: [
            {
              id: "add-cta",
              title: "Add the CTA",
              rationale: "End with the call to action.",
              instruction: "Regenerate adding 'Visit spotify.com' at the end.",
            },
          ],
        },
      ],
    };
    const out = coerceCriticFindings(raw, allowed);
    expect(out).toHaveLength(1);
    expect(out[0].dimension).toBe("cta");
    expect(out[0].matched).toBe(false);
    expect(out[0].improvements[0].apply).toEqual({
      kind: "chat_turn",
      instruction: "Regenerate adding 'Visit spotify.com' at the end.",
    });
  });

  it("drops matched=true findings and disallowed dimensions", () => {
    const raw = {
      findings: [
        { dimension: "cta", matched: true, explanation: "ok" },
        { dimension: "duration", matched: false, explanation: "nope" },
      ],
    };
    expect(coerceCriticFindings(raw, allowed)).toEqual([]);
  });

  it("de-dupes by dimension and defaults bad severity to medium", () => {
    const raw = {
      findings: [
        {
          dimension: "tone",
          matched: false,
          severity: "banana",
          explanation: "a",
          improvements: [],
        },
        { dimension: "tone", matched: false, explanation: "b" },
      ],
    };
    const out = coerceCriticFindings(raw, allowed);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("medium");
  });

  it("drops improvements with no instruction (apply=null)", () => {
    const raw = {
      findings: [
        {
          dimension: "brand",
          matched: false,
          explanation: "no brand",
          improvements: [{ title: "Mention the brand" }],
        },
      ],
    };
    const out = coerceCriticFindings(raw, allowed);
    expect(out[0].improvements[0].apply).toBeNull();
  });

  it("returns [] for garbage input", () => {
    expect(coerceCriticFindings(null, allowed)).toEqual([]);
    expect(coerceCriticFindings({}, allowed)).toEqual([]);
    expect(coerceCriticFindings({ findings: "nope" }, allowed)).toEqual([]);
  });
});
