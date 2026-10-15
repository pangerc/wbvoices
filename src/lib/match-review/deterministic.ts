/**
 * AI Match-Review (AAC-255) — deterministic checks.
 *
 * Pure function: given a brief and a generated result, return the mismatches
 * (findings with `matched: false`) that can be detected WITHOUT an LLM —
 * duration, word count, language, format, provider, forbidden words, verbatim
 * script. The AI "critic" (later phase) handles the soft dimensions (CTA intent,
 * tone, brief coverage) and merges into the same `MatchFinding[]`.
 *
 * No I/O, no app-type imports — unit-testable in isolation.
 */

import type {
  MatchFinding,
  MatchSeverity,
  ReviewBrief,
  ReviewResult,
} from "./types";

/** Words per second the generation prompt targets (see ad-duration-minimum). */
const WORDS_PER_SECOND = 2.5;

/** Strip performance tags like `[warm]` / `[strong accent]` before counting. */
function spokenWords(text: string | undefined): number {
  if (!text) return 0;
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD");
}

function totalSpokenWords(result: ReviewResult): number {
  return result.voiceTracks.reduce((n, t) => n + spokenWords(t.text), 0);
}

function combinedText(result: ReviewResult): string {
  return result.voiceTracks.map((t) => t.text || "").join("\n");
}

function actualDuration(result: ReviewResult): number {
  if (typeof result.actualDurationSeconds === "number") {
    return result.actualDurationSeconds;
  }
  return result.voiceTracks.reduce((s, t) => s + (t.generatedDuration || 0), 0);
}

/**
 * Deterministic review. Returns ONLY mismatches (findings with matched=false).
 * Dimensions with nothing to check (missing inputs) are skipped.
 */
export function reviewDeterministic(
  brief: ReviewBrief,
  result: ReviewResult,
): MatchFinding[] {
  const findings: MatchFinding[] = [];
  const tracks = result.voiceTracks ?? [];

  // --- Duration vs target -------------------------------------------------
  const target = brief.adDuration;
  const actual = actualDuration(result);
  if (typeof target === "number" && target > 0 && actual > 0) {
    const tol = Math.max(2, target * 0.1); // ±2s or 10%, whichever is larger
    if (actual > target + tol) {
      const over = actual - target;
      const severity: MatchSeverity =
        over > target * 0.3 ? "high" : over > target * 0.15 ? "medium" : "low";
      findings.push({
        dimension: "duration",
        matched: false,
        severity,
        expected: `${target}s`,
        actual: `${Math.round(actual)}s`,
        explanation: `The ad runs ~${Math.round(over)}s over the ${target}s target.`,
        improvements: [
          {
            id: "trim-to-budget",
            title: `Trim script to fit ${target}s`,
            rationale: `Remove ~${Math.round(over * WORDS_PER_SECOND)} words / tighten lines.`,
            apply: {
              kind: "regenerate",
              instruction: `Shorten the voiceover so the ad fits within ${target} seconds; keep the core message and CTA.`,
            },
          },
        ],
      });
    } else if (actual < target - tol) {
      const under = target - actual;
      findings.push({
        dimension: "duration",
        matched: false,
        severity: under > target * 0.3 ? "medium" : "low",
        expected: `${target}s`,
        actual: `${Math.round(actual)}s`,
        explanation: `The ad is ~${Math.round(under)}s shorter than the ${target}s target.`,
        improvements: [
          {
            id: "expand-to-budget",
            title: `Expand script toward ${target}s`,
            rationale: `Add ~${Math.round(under * WORDS_PER_SECOND)} words or a beat.`,
            apply: {
              kind: "regenerate",
              instruction: `Lengthen the voiceover to use more of the ${target}-second budget without padding.`,
            },
          },
        ],
      });
    }
  }

  // --- Word count vs model ------------------------------------------------
  if (typeof target === "number" && target > 0 && tracks.length) {
    const words = totalSpokenWords(result);
    const expected = Math.round(target * WORDS_PER_SECOND);
    if (words > 0 && (words < expected * 0.6 || words > expected * 1.4)) {
      findings.push({
        dimension: "wordCount",
        matched: false,
        severity: "low",
        expected: `~${expected} words`,
        actual: `${words} words`,
        explanation: `Word count (${words}) is far from the ~${expected} expected for ${target}s.`,
        improvements: [
          {
            id: "rebalance-word-count",
            title: "Rebalance the script length",
            rationale: `Aim for ~${expected} words at a natural pace.`,
            apply: {
              kind: "regenerate",
              instruction: `Rewrite the script to about ${expected} words so it reads naturally in ${target} seconds.`,
            },
          },
        ],
      });
    }
  }

  // --- Language -----------------------------------------------------------
  if (brief.selectedLanguage) {
    const want = norm(brief.selectedLanguage);
    const wrong = tracks.filter((t) => t.language && norm(t.language) !== want);
    if (wrong.length) {
      findings.push({
        dimension: "language",
        matched: false,
        severity: "high",
        expected: brief.selectedLanguage,
        actual: [...new Set(wrong.map((t) => t.language))].join(", "),
        explanation: `${wrong.length} voice track(s) are not in ${brief.selectedLanguage}.`,
        improvements: [
          {
            id: "regenerate-language",
            title: `Regenerate in ${brief.selectedLanguage}`,
            rationale: "Voices must match the brief's language.",
            apply: {
              kind: "regenerate",
              instruction: `Regenerate all voices in ${brief.selectedLanguage}.`,
            },
          },
        ],
      });
    }
  }

  // --- Campaign format (dialog needs ≥2 distinct voices) ------------------
  if (brief.campaignFormat === "dialog") {
    const distinctVoices = new Set(
      tracks.map((t, i) => t.provider ?? `track-${i}`),
    );
    if (tracks.length < 2 || distinctVoices.size < 2) {
      findings.push({
        dimension: "format",
        matched: false,
        severity: "medium",
        expected: "dialogue (2+ voices)",
        actual: `${tracks.length} voice track(s)`,
        explanation: "Dialogue format needs at least two distinct speakers.",
        improvements: [
          {
            id: "regenerate-dialogue",
            title: "Regenerate as a two-voice dialogue",
            rationale:
              "The format is set to dialogue but the ad is single-voice.",
            apply: {
              kind: "regenerate",
              instruction:
                "Regenerate as a dialogue between two distinct voices with a few exchanges.",
            },
          },
        ],
      });
    }
  }

  // --- Provider (only when pinned) ----------------------------------------
  const pinned = brief.selectedProvider;
  if (pinned && pinned !== "any") {
    const wrong = tracks.filter(
      (t) => t.provider && norm(t.provider) !== norm(pinned),
    );
    if (wrong.length) {
      findings.push({
        dimension: "provider",
        matched: false,
        severity: "low",
        expected: pinned,
        actual: [...new Set(wrong.map((t) => t.provider))].join(", "),
        explanation: `${wrong.length} voice(s) are not from the pinned provider "${pinned}".`,
        improvements: [
          {
            id: "regenerate-provider",
            title: `Use ${pinned} voices`,
            rationale: "Voices should come from the selected provider.",
            apply: {
              kind: "regenerate",
              instruction: `Regenerate the voices using the ${pinned} provider.`,
            },
          },
        ],
      });
    }
  }

  // --- Forbidden words ----------------------------------------------------
  const forbidden = (brief.forbiddenWords || "")
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (forbidden.length && tracks.length) {
    const hay = norm(combinedText(result));
    const hits = forbidden.filter((w) => hay.includes(norm(w)));
    if (hits.length) {
      findings.push({
        dimension: "forbiddenWords",
        matched: false,
        severity: "high",
        expected: "none of the forbidden terms",
        actual: hits.join(", "),
        explanation: `Script contains forbidden term(s): ${hits.join(", ")}.`,
        improvements: [
          {
            id: "remove-forbidden",
            title: "Remove forbidden terms",
            rationale: `Rewrite to avoid: ${hits.join(", ")}.`,
            apply: {
              kind: "regenerate",
              instruction: `Rewrite the script without using: ${hits.join(", ")}.`,
            },
          },
        ],
      });
    }
  }

  // --- Provided script used verbatim (script mode) ------------------------
  const script = brief.providedScript?.trim();
  if (brief.creativeMode === "script" && script && tracks.length) {
    const gen = norm(combinedText(result)).replace(/\[[^\]]*\]/g, " ");
    const scriptWords = norm(script)
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const present = scriptWords.filter((w) => gen.includes(w)).length;
    const coverage = scriptWords.length ? present / scriptWords.length : 1;
    if (coverage < 0.7) {
      findings.push({
        dimension: "providedScript",
        matched: false,
        severity: "high",
        expected: "provided script used verbatim",
        actual: `~${Math.round(coverage * 100)}% of script words present`,
        explanation:
          "The generated voiceover diverges from the provided script.",
        improvements: [
          {
            id: "use-script-verbatim",
            title: "Use the provided script verbatim",
            rationale: "Keep the user's script text unchanged.",
            apply: {
              kind: "regenerate",
              instruction:
                "Use the provided script exactly as written; only add performance direction, music and SFX around it.",
            },
          },
        ],
      });
    }
  }

  return findings;
}
