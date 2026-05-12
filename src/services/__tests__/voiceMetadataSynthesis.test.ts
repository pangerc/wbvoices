import { describe, expect, it } from "vitest";
import type { UnifiedVoice } from "../voiceCatalogueService";
import {
  synthesizeMetadata,
  voiceMatchesFilters,
} from "../voiceMetadataSynthesis";

function makeVoice(overrides: Partial<UnifiedVoice> = {}): UnifiedVoice {
  return {
    id: "v1",
    externalId: "v1",
    provider: "elevenlabs",
    catalogueId: "voice:elevenlabs:v1",
    name: "Test",
    displayName: "Test (ElevenLabs)",
    gender: "female",
    language: "en",
    accent: "american",
    lastUpdated: 0,
    ...overrides,
  };
}

describe("synthesizeMetadata", () => {
  it("maps ElevenLabs age/use_case natively", () => {
    const m = synthesizeMetadata(
      makeVoice({
        age: "middle_aged",
        useCase: "advertisement",
        personality: "A warm, friendly voice",
      }),
    );
    expect(m.age_bracket).toBe("mid_adult");
    expect(m.use_case).toBe("advertising");
    expect(m.warmth).toBe("warm");
  });

  it("extracts energy / pace from free text", () => {
    const m = synthesizeMetadata(
      makeVoice({
        personality: "Energetic, fast-paced delivery with a punchy confidence",
      }),
    );
    expect(m.energy).toBe("punchy");
    expect(m.pace_tendency).toBe("fast");
  });

  it("leaves axes undefined when no signal is present", () => {
    const m = synthesizeMetadata(makeVoice());
    expect(m.age_bracket).toBeUndefined();
    expect(m.energy).toBeUndefined();
    expect(m.warmth).toBeUndefined();
    expect(m.pace_tendency).toBeUndefined();
    expect(m.use_case).toBeUndefined();
    // Casting note is always present — it's the vibe-glue for the LLM.
    expect(m.casting_note).toBeTruthy();
  });

  it("treats Lahajati boilerplate as missing, not as real signal", () => {
    const m = synthesizeMetadata(
      makeVoice({
        provider: "lahajati",
        language: "ar",
        accent: "standard",
        useCase: "advertisement",
        personality: "Rashid - Arabic voice",
      }),
    );
    // Hardcoded on every Lahajati voice — excluding these axes prevents
    // systematic include/exclude of the entire provider on a single filter.
    expect(m.use_case).toBeUndefined();
    expect(m.energy).toBeUndefined();
    expect(m.warmth).toBeUndefined();
    expect(m.pace_tendency).toBeUndefined();
  });

  it("detects dialect_register from Arabic accent strings", () => {
    expect(
      synthesizeMetadata(makeVoice({ language: "ar", accent: "egyptian" }))
        .dialect_register,
    ).toBe("egyptian");
    expect(
      synthesizeMetadata(makeVoice({ language: "ar", accent: "Saudi" }))
        .dialect_register,
    ).toBe("khaleeji");
    expect(
      synthesizeMetadata(makeVoice({ language: "ar", accent: "Lebanese" }))
        .dialect_register,
    ).toBe("levantine");
    expect(
      synthesizeMetadata(makeVoice({ language: "ar", accent: "moroccan" }))
        .dialect_register,
    ).toBe("maghrebi");
    expect(
      synthesizeMetadata(
        makeVoice({ language: "ar", accent: "Modern Standard" }),
      ).dialect_register,
    ).toBe("msa");
  });

  it("leaves dialect_register undefined for non-Arabic voices", () => {
    expect(
      synthesizeMetadata(makeVoice({ language: "en", accent: "egyptian" }))
        .dialect_register,
    ).toBeUndefined();
  });
});

describe("voiceMatchesFilters (missing = pass rule)", () => {
  it("excludes when voice has a conflicting known value", () => {
    expect(
      voiceMatchesFilters(
        { casting_note: "x", age_bracket: "young_adult" },
        { age_bracket: "mature" },
      ),
    ).toBe(false);
  });

  it("includes when the axis is missing on the voice", () => {
    expect(
      voiceMatchesFilters({ casting_note: "x" }, { age_bracket: "mature" }),
    ).toBe(true);
  });

  it("includes when filter is empty", () => {
    expect(voiceMatchesFilters({ casting_note: "x" }, {})).toBe(true);
  });

  it("requires all filter axes to pass", () => {
    expect(
      voiceMatchesFilters(
        { casting_note: "x", age_bracket: "mature", energy: "punchy" },
        { age_bracket: "mature", energy: "calm" },
      ),
    ).toBe(false);
  });
});
