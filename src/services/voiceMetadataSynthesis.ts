/**
 * Voice metadata synthesis.
 *
 * Derives a normalized structured metadata record from whatever provider-
 * native fields exist on a UnifiedVoice — so the LLM can filter and
 * discriminate across ElevenLabs / Lahajati / Qwen / ByteDance / OpenAI
 * using one uniform vocabulary.
 *
 * Critical design rule: missing data is NOT a match failure. If we can't
 * determine a voice's age bracket, a filter on age_bracket does not
 * exclude it. Excluding on missing data would bias the LLM toward
 * providers we happen to have richer metadata for (the observability-
 * creates-bias trap) — which is exactly the failure mode this stage is
 * trying to fix.
 */
import type { UnifiedVoice } from "./voiceCatalogueService";

export type AgeBracket = "young_adult" | "adult" | "mid_adult" | "mature";
export type EnergyLevel = "calm" | "neutral" | "punchy";
export type WarmthLevel = "clinical" | "neutral" | "warm";
export type PaceTendency = "slow" | "neutral" | "fast";
export type UseCaseTag =
  | "advertising"
  | "narration"
  | "conversational"
  | "trailer";
export type DialectRegister =
  | "msa"
  | "khaleeji"
  | "egyptian"
  | "levantine"
  | "maghrebi";

export interface SynthesizedMetadata {
  age_bracket?: AgeBracket;
  energy?: EnergyLevel;
  warmth?: WarmthLevel;
  pace_tendency?: PaceTendency;
  use_case?: UseCaseTag;
  dialect_register?: DialectRegister;
  /**
   * One-liner casting note distilled from the structured axes above + the
   * provider-native description. Intended to be read by the LLM as the
   * "vibe glue" when choosing between candidates that passed the filter —
   * the structured fields narrow the pool, the one-liner picks within it.
   */
  casting_note: string;
}

const AGE_BRACKET_MAP: Record<string, AgeBracket> = {
  young: "young_adult",
  young_adult: "young_adult",
  youth: "young_adult",
  teen: "young_adult",
  adult: "adult",
  middle_aged: "mid_adult",
  middle: "mid_adult",
  mid: "mid_adult",
  old: "mature",
  senior: "mature",
  elderly: "mature",
  mature: "mature",
};

const USE_CASE_MAP: Record<string, UseCaseTag> = {
  advertisement: "advertising",
  advertising: "advertising",
  ad: "advertising",
  ads: "advertising",
  commercial: "advertising",
  narration: "narration",
  narrative: "narration",
  audiobook: "narration",
  storytelling: "narration",
  documentary: "narration",
  conversational: "conversational",
  conversation: "conversational",
  assistant: "conversational",
  chat: "conversational",
  social_media: "conversational",
  characters_animation: "trailer",
  trailer: "trailer",
  movie: "trailer",
  cinematic: "trailer",
  video_games: "trailer",
};

// Simple keyword-to-axis mappings. Applied against lowercased personality/
// description text. Multiple matches for a single axis — first one wins.
// Kept intentionally narrow; over-mapping creates false positives.
const ENERGY_KEYWORDS: Array<[RegExp, EnergyLevel]> = [
  [/\b(punchy|energetic|dynamic|high[- ]energy|excited|lively|upbeat|vibrant|bold)\b/, "punchy"],
  [/\b(calm|soothing|gentle|soft|relaxed|mellow|quiet|subdued|tranquil)\b/, "calm"],
];

const WARMTH_KEYWORDS: Array<[RegExp, WarmthLevel]> = [
  [/\b(warm|friendly|welcoming|inviting|intimate|approachable|empathetic|caring)\b/, "warm"],
  [/\b(clinical|neutral-sounding|detached|authoritative|formal|stern|cold|dry)\b/, "clinical"],
];

const PACE_KEYWORDS: Array<[RegExp, PaceTendency]> = [
  [/\b(fast[- ]paced|rapid|quick|fast[- ]talking|brisk|rushed)\b/, "fast"],
  [/\b(slow|measured|deliberate|unhurried|patient|paced)\b/, "slow"],
];

function firstMatch<T>(
  text: string,
  rules: ReadonlyArray<readonly [RegExp, T]>
): T | undefined {
  for (const [re, val] of rules) {
    if (re.test(text)) return val;
  }
  return undefined;
}

/**
 * Detect Arabic dialect register from the accent string or voice name.
 * Lahajati is dialect-agnostic at the voice level (dialect is picked at
 * TTS time via dialect_id), so for Lahajati voices this comes back
 * undefined — dialect_register filtering is effectively a no-op. It's
 * still exposed so ElevenLabs Arabic voices, which *do* encode dialect
 * on the voice itself, can be filtered.
 */
function detectDialectRegister(v: UnifiedVoice): DialectRegister | undefined {
  if (v.language !== "ar") return undefined;
  const a = (v.accent || "").toLowerCase();
  if (!a) return undefined;
  if (/modern|standard|msa/.test(a)) return "msa";
  if (/egypt|cairo|alexandr/.test(a)) return "egyptian";
  if (/saudi|kuwait|emirat|qatar|oman|bahrain|khaleeji|gulf/.test(a)) return "khaleeji";
  if (/lebanes|syrian|jordan|palestin|levantine/.test(a)) return "levantine";
  if (/morocc|tunis|algeri|libyan|maghreb/.test(a)) return "maghrebi";
  return undefined;
}

function buildCastingNote(v: UnifiedVoice, m: Partial<SynthesizedMetadata>): string {
  const parts: string[] = [];

  const ageLabel =
    m.age_bracket === "young_adult" ? "young adult"
    : m.age_bracket === "adult" ? "adult"
    : m.age_bracket === "mid_adult" ? "mid-30s/40s"
    : m.age_bracket === "mature" ? "mature"
    : undefined;

  if (ageLabel) parts.push(ageLabel);
  if (v.gender && v.gender !== "neutral") parts.push(v.gender);
  if (v.accent && v.accent !== "neutral" && v.accent !== "standard") {
    parts.push(`${v.accent} accent`);
  } else if (m.dialect_register) {
    parts.push(`${m.dialect_register} Arabic`);
  }

  const vibeBits: string[] = [];
  if (m.warmth === "warm") vibeBits.push("warm");
  else if (m.warmth === "clinical") vibeBits.push("clinical");
  if (m.energy === "punchy") vibeBits.push("punchy");
  else if (m.energy === "calm") vibeBits.push("calm");
  if (m.pace_tendency === "fast") vibeBits.push("fast-paced");
  else if (m.pace_tendency === "slow") vibeBits.push("measured");

  if (vibeBits.length) parts.push(vibeBits.join(", "));

  if (m.use_case) {
    parts.push(
      m.use_case === "advertising" ? "ad reads"
      : m.use_case === "narration" ? "narration"
      : m.use_case === "conversational" ? "conversational"
      : "trailer"
    );
  }

  const summary = parts.length ? parts.join(" · ") : "voice";

  // Tail: raw personality string if we have one and it adds signal not
  // already captured above. Trimmed to stay readable in tool payload.
  const personality = (v.personality || "").trim();
  if (personality && personality.length < 240) {
    return `${summary}. ${personality}`;
  }
  return summary;
}

/**
 * True when the voice's native metadata is boilerplate, not observational —
 * e.g. Lahajati hardcodes `use_case: "advertisement"` and a stock personality
 * string on every voice at fetch time, which has no discriminative value.
 * Synthesis should treat these as "missing" so filters don't systematically
 * include/exclude the entire provider on a single axis.
 */
function isBoilerplateText(
  v: UnifiedVoice,
  text: string | undefined
): boolean {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (!t) return true;
  // Lahajati stock pattern: "{Name} - Arabic voice"
  if (v.provider === "lahajati" && / - arabic voice$/.test(t)) return true;
  return false;
}

export function synthesizeMetadata(v: UnifiedVoice): SynthesizedMetadata {
  const ageKey = (v.age || "").toLowerCase().trim();
  const age_bracket = AGE_BRACKET_MAP[ageKey];

  // Lahajati hardcodes use_case="advertisement" on every voice at fetch
  // time (voiceProviderService.ts:460). That's boilerplate, not observation
  // — treating it as real data would make `use_case: narration` filters
  // systematically exclude the entire Lahajati catalogue. Skip the mapping.
  const useKey = (v.useCase || "").toLowerCase().trim();
  const use_case =
    v.provider === "lahajati" ? undefined : USE_CASE_MAP[useKey];

  const personality = isBoilerplateText(v, v.personality) ? "" : v.personality || "";
  const text = `${personality} ${v.useCase || ""}`.toLowerCase();
  const energy = firstMatch(text, ENERGY_KEYWORDS);
  const warmth = firstMatch(text, WARMTH_KEYWORDS);
  const pace_tendency = firstMatch(text, PACE_KEYWORDS);

  const dialect_register = detectDialectRegister(v);

  const partial: Partial<SynthesizedMetadata> = {
    age_bracket,
    energy,
    warmth,
    pace_tendency,
    use_case,
    dialect_register,
  };

  return {
    ...partial,
    casting_note: buildCastingNote({ ...v, personality }, partial),
  };
}

export interface SynthesizedFilters {
  age_bracket?: AgeBracket;
  energy?: EnergyLevel;
  warmth?: WarmthLevel;
  pace_tendency?: PaceTendency;
  use_case?: UseCaseTag;
  dialect_register?: DialectRegister;
}

/**
 * Resolve a voice against the optional structured filters.
 *
 * Inclusion rule: a voice is excluded only when it has a known value for
 * the axis that does NOT match the filter. Missing/unknown values pass
 * through — otherwise providers with thinner metadata would be silently
 * squeezed out of the candidate pool.
 */
export function voiceMatchesFilters(
  metadata: SynthesizedMetadata,
  filters: SynthesizedFilters
): boolean {
  for (const axis of Object.keys(filters) as Array<keyof SynthesizedFilters>) {
    const want = filters[axis];
    if (!want) continue;
    const have = metadata[axis];
    if (have !== undefined && have !== want) return false;
  }
  return true;
}
