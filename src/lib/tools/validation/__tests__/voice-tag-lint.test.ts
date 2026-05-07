import { describe, it, expect } from "vitest";
import { lintVoiceTracks, type LintableTrack } from "../voice-tag-lint";
import type { Voice } from "@/types";

function v(overrides: Partial<Voice> = {}): Voice {
  return {
    id: "test:voice-1",
    name: "Test Voice",
    gender: "female",
    accent: "parisian",
    provider: "elevenlabs",
    ...overrides,
  };
}

function track(text: string, voice: Voice | null = v()): LintableTrack {
  return { text, voice };
}

describe("lintVoiceTracks — accent presence", () => {
  it("passes when opening stack contains the cast voice's accent tag", () => {
    const result = lintVoiceTracks([
      track("[strong parisian accent][excited] Salut le monde !"),
    ]);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.telemetry[0].accentPresent).toBe(true);
  });

  it("fails when accent metadata is set but opening stack lacks the tag", () => {
    const result = lintVoiceTracks([
      track("[excited][happy] Salut le monde !"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("missing_accent_tag");
    expect(result.violations[0].requiredTag).toBe("[strong parisian accent]");
    expect(result.violations[0].castVoiceAccent).toBe("parisian");
    expect(result.telemetry[0].accentPresent).toBe(false);
  });

  it("does not enforce accent for neutral/standard voices", () => {
    const neutral = v({ accent: "neutral" });
    const standard = v({ accent: "standard" });
    const result = lintVoiceTracks([
      track("[excited] Hello!", neutral),
      track("[confident] Marhaba", standard),
    ]);
    expect(result.ok).toBe(true);
    expect(result.telemetry[0].accentPresent).toBe(true);
    expect(result.telemetry[1].accentPresent).toBe(true);
  });

  it("does not enforce accent for ISO-2 leaked codes", () => {
    const result = lintVoiceTracks([
      track("[excited] Zdravo!", v({ accent: "hr" })),
    ]);
    expect(result.ok).toBe(true);
  });

  it("accent tag is case-insensitive against the cast voice's accent", () => {
    const result = lintVoiceTracks([
      track(
        "[STRONG PARISIAN ACCENT][excited] Salut!",
        v({ accent: "Parisian" }),
      ),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("lintVoiceTracks — opening stack size", () => {
  it("allows up to 8 tags in the opening stack", () => {
    const eightTags =
      "[strong parisian accent][excited][rapid-fire][fast][fast][happy][warm][confident]";
    const result = lintVoiceTracks([track(`${eightTags} Salut!`)]);
    expect(result.ok).toBe(true);
  });

  it("flags a 9-tag opening stack as oversize", () => {
    const nineTags =
      "[strong parisian accent][excited][rapid-fire][fast][fast][happy][warm][confident][gentle]";
    const result = lintVoiceTracks([track(`${nineTags} Salut!`)]);
    expect(result.ok).toBe(false);
    const oversize = result.violations.find(
      (x) => x.rule === "opening_stack_oversize",
    );
    expect(oversize).toBeDefined();
  });

  it("does not enforce a minimum opening stack size", () => {
    // Short reactive lines legitimately don't need a stack — but they need
    // the accent tag if the cast voice has one.
    const result = lintVoiceTracks([
      track("[strong parisian accent] Oui.", v({ accent: "parisian" })),
    ]);
    expect(result.ok).toBe(true);
    expect(result.telemetry[0].openingStackSize).toBe(1);
  });

  it("body tags do not count toward opening-stack size", () => {
    const result = lintVoiceTracks([
      track(
        "[strong parisian accent][excited] Salut. [chuckles] Tu vas bien? [whispers] Vraiment?",
      ),
    ]);
    expect(result.ok).toBe(true);
    expect(result.telemetry[0].openingStackSize).toBe(2);
    expect(result.telemetry[0].bodyTags).toBe(2);
  });
});

describe("lintVoiceTracks — tag syntax", () => {
  it("flags an unclosed tag", () => {
    const result = lintVoiceTracks([
      track(
        "[strong parisian accent][excited Salut le monde",
        v({ accent: "parisian" }),
      ),
    ]);
    expect(result.ok).toBe(false);
    const malformed = result.violations.find(
      (x) => x.rule === "malformed_tag_syntax",
    );
    expect(malformed).toBeDefined();
  });

  it("flags nested brackets", () => {
    const result = lintVoiceTracks([
      track(
        "[strong parisian accent][[excited]] Salut",
        v({ accent: "parisian" }),
      ),
    ]);
    expect(result.ok).toBe(false);
    const malformed = result.violations.find(
      (x) => x.rule === "malformed_tag_syntax",
    );
    expect(malformed).toBeDefined();
  });

  it("accepts hyphens and spaces inside tag bodies", () => {
    const result = lintVoiceTracks([
      track(
        "[strong parisian accent][rapid-fire][happy gasp] Salut!",
        v({ accent: "parisian" }),
      ),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("lintVoiceTracks — body weave is NOT linted", () => {
  it("does not fail a line with zero body tags (creative judgment)", () => {
    // A line with only an opening stack and no body weave passes — body
    // placement is the tag-weaver's creative judgment, not a lint rule.
    const result = lintVoiceTracks([
      track("[strong parisian accent][excited] Une très courte ligne."),
    ]);
    expect(result.ok).toBe(true);
    expect(result.telemetry[0].bodyTags).toBe(0);
  });
});

describe("lintVoiceTracks — telemetry", () => {
  it("counts all tags, splits opening vs body", () => {
    const result = lintVoiceTracks([
      track("[strong parisian accent][excited] Salut. [chuckles] Ça va?"),
    ]);
    const t = result.telemetry[0];
    expect(t.openingStackSize).toBe(2);
    expect(t.bodyTags).toBe(1);
    expect(t.totalTags).toBe(3);
    expect(t.lintPassed).toBe(true);
  });

  it("emits one telemetry entry per track", () => {
    const result = lintVoiceTracks([
      track("[strong parisian accent][excited] One."),
      track("[strong parisian accent][warm] Two."),
      track("[strong parisian accent][confident] Three."),
    ]);
    expect(result.telemetry).toHaveLength(3);
    expect(result.telemetry.map((t) => t.trackIndex)).toEqual([0, 1, 2]);
  });
});
