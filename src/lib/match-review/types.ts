/**
 * AI Match-Review (AAC-255) — shared types.
 *
 * The review compares a generated ad against the user's brief and emits
 * `Finding`s (what didn't match) with proposed `Improvement`s (how to fix).
 *
 * Inputs are intentionally plain/decoupled from Redis + app types so the
 * deterministic reviewer is a pure, unit-testable function. Callers (e.g. the
 * generation worker) map `ProjectBrief` + the generated versions onto these.
 */

export type MatchDimension =
  | "duration"
  | "wordCount"
  | "language"
  | "format"
  | "provider"
  | "forbiddenWords"
  | "providedScript"
  // AI-judged ("soft") dimensions — produced by the critic, not deterministic.
  | "cta"
  | "tone"
  | "intent"
  | "brand";

export type MatchSeverity = "low" | "medium" | "high";

/** How an improvement card is applied when the user clicks it. */
export type ImprovementApply =
  | { kind: "regenerate"; instruction: string }
  | { kind: "chat_turn"; instruction: string }
  | {
      kind: "brief_patch";
      patch: Record<string, unknown>;
      instruction?: string;
    };

export interface Improvement {
  id: string;
  title: string;
  rationale?: string;
  /**
   * Primary one-click fix — a MINIMAL, surgical edit that preserves the user's
   * existing script/output and changes only what this fix requires. Rendered as
   * the "Apply" button. null ⇒ manual-only (guidance, no one-click action).
   */
  apply: ImprovementApply | null;
  /**
   * Optional heavier alternative: a FULL regeneration for this fix, rendered as a
   * separate "Regenerate" button. Used when a minimal edit isn't enough and the
   * user explicitly wants the script rewritten.
   */
  regenerate?: ImprovementApply | null;
}

export interface MatchFinding {
  dimension: MatchDimension;
  matched: boolean;
  severity: MatchSeverity;
  /** Human-readable expected / actual, for display + stats. */
  expected?: string;
  actual?: string;
  explanation: string;
  improvements: Improvement[];
}

/** The brief fields the reviewer reads (subset of ProjectBrief). */
export interface ReviewBrief {
  creativeMode?: "brief" | "script";
  creativeBrief?: string;
  providedScript?: string;
  selectedLanguage?: string;
  selectedAccent?: string;
  campaignFormat?: string;
  /** Pinned provider; "any"/undefined ⇒ no provider constraint. */
  selectedProvider?: string;
  selectedCTA?: string | null;
  /** Desired tone of voice (AI-judged). */
  selectedTone?: string | null;
  /** Desired pacing, e.g. "fast" / "normal" (AI-judged). */
  selectedPacing?: string | null;
  forbiddenWords?: string;
  /** Target duration in seconds. */
  adDuration?: number;
  brandName?: string;
}

export interface ReviewVoiceTrack {
  text?: string;
  /** Rendered duration in seconds (0/undefined ⇒ not yet generated). */
  generatedDuration?: number;
  language?: string;
  provider?: string;
}

/** The generated result the reviewer inspects. */
export interface ReviewResult {
  voiceTracks: ReviewVoiceTrack[];
  /** Actual ad duration (from the timeline/mixer). Falls back to the sum of
   *  voice-track durations when omitted. */
  actualDurationSeconds?: number;
}
