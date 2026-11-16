import { describe, expect, it } from "vitest";
import { reviewDeterministic } from "../deterministic";
import type { ReviewBrief, ReviewResult } from "../types";

const briefBase: ReviewBrief = {
  creativeMode: "brief",
  creativeBrief: "Promote the summer sale.",
  selectedLanguage: "en",
  campaignFormat: "ad_read",
  adDuration: 30,
};

/** ~75 words (30s * 2.5) of English across one track. */
const WORDS_75 = Array.from({ length: 75 }, (_, i) => `word${i}`).join(" ");

function result(partial: Partial<ReviewResult>): ReviewResult {
  return { voiceTracks: [], ...partial };
}

const dims = (f: ReturnType<typeof reviewDeterministic>) =>
  f.map((x) => x.dimension);

describe("reviewDeterministic", () => {
  it("returns no findings for an on-spec ad", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: WORDS_75, language: "en", generatedDuration: 30 }],
    });
    expect(reviewDeterministic(briefBase, r)).toEqual([]);
  });

  it("flags over-budget duration as high severity", () => {
    const r = result({
      actualDurationSeconds: 44,
      voiceTracks: [{ text: WORDS_75, language: "en" }],
    });
    const f = reviewDeterministic(briefBase, r);
    const dur = f.find((x) => x.dimension === "duration");
    expect(dur).toBeTruthy();
    expect(dur!.matched).toBe(false);
    expect(dur!.severity).toBe("high");
    // Apply = minimal surgical edit; Regenerate = full rewrite (separate action).
    expect(dur!.improvements[0].apply?.kind).toBe("chat_turn");
    expect(dur!.improvements[0].regenerate?.kind).toBe("regenerate");
  });

  it("explains the duration over-budget in word-budget terms (P1)", () => {
    const r = result({
      actualDurationSeconds: 44,
      voiceTracks: [{ text: WORDS_75, language: "en" }],
    });
    const dur = reviewDeterministic(briefBase, r).find(
      (x) => x.dimension === "duration",
    );
    expect(dur!.explanation).toMatch(/word/i);
    expect(dur!.explanation).toContain("30s");
  });

  it("flags under-budget duration", () => {
    const r = result({
      actualDurationSeconds: 18,
      voiceTracks: [{ text: WORDS_75, language: "en" }],
    });
    expect(dims(reviewDeterministic(briefBase, r))).toContain("duration");
  });

  it("stays silent within the duration tolerance", () => {
    const r = result({
      actualDurationSeconds: 32, // within ±3s of 30
      voiceTracks: [{ text: WORDS_75, language: "en" }],
    });
    expect(dims(reviewDeterministic(briefBase, r))).not.toContain("duration");
  });

  it("falls back to summed track durations when actual is omitted", () => {
    const r = result({
      voiceTracks: [
        { text: "a b", language: "en", generatedDuration: 25 },
        { text: "c d", language: "en", generatedDuration: 25 },
      ],
    }); // 50s total vs 30s target → over
    expect(dims(reviewDeterministic(briefBase, r))).toContain("duration");
  });

  it("flags word count far from the model", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: "just five short words here", language: "en" }],
    });
    expect(dims(reviewDeterministic(briefBase, r))).toContain("wordCount");
  });

  it("ignores performance tags when counting words", () => {
    const tagged = `[warm] [strong accent] ${WORDS_75}`;
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: tagged, language: "en" }],
    });
    expect(dims(reviewDeterministic(briefBase, r))).not.toContain("wordCount");
  });

  it("flags a language mismatch", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: WORDS_75, language: "es" }],
    });
    const f = reviewDeterministic(briefBase, r);
    const lang = f.find((x) => x.dimension === "language");
    expect(lang?.severity).toBe("high");
    expect(lang?.actual).toContain("es");
  });

  it("flags dialog format delivered as a single voice", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: WORDS_75, language: "en", provider: "openai" }],
    });
    expect(
      dims(reviewDeterministic({ ...briefBase, campaignFormat: "dialog" }, r)),
    ).toContain("format");
  });

  it("accepts a two-voice dialog", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [
        { text: "line one here now", language: "en", provider: "openai" },
        { text: "line two here now", language: "en", provider: "elevenlabs" },
      ],
    });
    expect(
      dims(reviewDeterministic({ ...briefBase, campaignFormat: "dialog" }, r)),
    ).not.toContain("format");
  });

  it("flags a provider mismatch only when pinned", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: WORDS_75, language: "en", provider: "openai" }],
    });
    expect(
      dims(reviewDeterministic({ ...briefBase, selectedProvider: "any" }, r)),
    ).not.toContain("provider");
    expect(
      dims(
        reviewDeterministic(
          { ...briefBase, selectedProvider: "elevenlabs" },
          r,
        ),
      ),
    ).toContain("provider");
  });

  it("flags forbidden terms (case-insensitive)", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: `${WORDS_75} CHEAP deal`, language: "en" }],
    });
    const f = reviewDeterministic(
      { ...briefBase, forbiddenWords: "cheap, free" },
      r,
    );
    const fb = f.find((x) => x.dimension === "forbiddenWords");
    expect(fb?.actual).toContain("cheap");
  });

  it("flags a provided script that was not used verbatim (script mode)", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [
        { text: "completely different wording entirely", language: "en" },
      ],
    });
    const f = reviewDeterministic(
      {
        ...briefBase,
        creativeMode: "script",
        providedScript:
          "Discover our wonderful summer collection today and save plenty",
      },
      r,
    );
    expect(dims(f)).toContain("providedScript");
  });

  it("does not check verbatim in brief mode", () => {
    const r = result({
      actualDurationSeconds: 30,
      voiceTracks: [{ text: WORDS_75, language: "en" }],
    });
    const f = reviewDeterministic(
      { ...briefBase, creativeMode: "brief", providedScript: "some script" },
      r,
    );
    expect(dims(f)).not.toContain("providedScript");
  });
});
