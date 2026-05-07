/**
 * Stage L — mechanical-only lint for ElevenLabs voice-track tags.
 *
 * The lint enforces only checks that ARE binary mechanical:
 *   1. Accent presence — when the cast voice has an accent worth
 *      enforcing (resolveAccentForLint), the opening stack must contain
 *      `[strong <accent> accent]`.
 *   2. Opening stack size — at most 8 tags before the first non-tag
 *      character. Catches runaway stacking; never enforces a minimum.
 *   3. Tag syntax — every `[` must close to a matching `]` on the same
 *      line, and tag bodies are a single line of allowed characters
 *      (letters, digits, spaces, hyphens). Catches the rare LLM glitch
 *      where a tag corrupts the script text.
 *
 * Body-weave placement is *creative judgment* and is NOT linted — that's
 * what the Stage N tag-weaver pass owns. We only measure body-tag
 * density for telemetry; we do not enforce it.
 *
 * Used by createVoiceDraft after the Stage N tag-weaver runs. Failure
 * triggers one weaver retry with the violations folded in as feedback;
 * a second failure persists the draft with violations attached as a
 * structured warning rather than blocking generation.
 */

import type { Voice } from "@/types";
import { resolveAccentForLint, canonicalAccentTag } from "./accent-policy";

const OPENING_STACK_MAX = 8;

export interface LintableTrack {
  /** The text that will be sent to the TTS provider — i.e. post weaver. */
  text: string;
  /** The cast voice. Used to derive enforced accent. */
  voice: Voice | null;
}

export type ViolationRule =
  | "missing_accent_tag"
  | "opening_stack_oversize"
  | "malformed_tag_syntax";

export interface LintViolation {
  trackIndex: number;
  rule: ViolationRule;
  message: string;
  /** Accent enforced for this track, when relevant. */
  castVoiceAccent?: string;
  /** The exact tag the weaver should add, when relevant. */
  requiredTag?: string;
  /** A short hint the weaver can fold into its retry prompt. */
  hint?: string;
}

export interface LintTelemetryEntry {
  trackIndex: number;
  openingStackSize: number;
  bodyTags: number;
  totalTags: number;
  accentPresent: boolean;
  lintPassed: boolean;
  violations: ViolationRule[];
}

export interface LintResult {
  ok: boolean;
  violations: LintViolation[];
  telemetry: LintTelemetryEntry[];
}

export function lintVoiceTracks(tracks: LintableTrack[]): LintResult {
  const violations: LintViolation[] = [];
  const telemetry: LintTelemetryEntry[] = [];

  tracks.forEach((track, trackIndex) => {
    const text = track.text || "";
    const enforcedAccent = resolveAccentForLint(track.voice?.accent ?? null);
    const accentTag = canonicalAccentTag(track.voice?.accent ?? null);

    const trackViolations: LintViolation[] = [];
    const allTags = extractAllTags(text);
    const opening = extractOpeningStack(text);

    // Rule 1: accent tag presence in opening stack
    let accentPresent = false;
    if (enforcedAccent && accentTag) {
      const expected = accentTag.toLowerCase();
      accentPresent = opening.tags.some((t) => t.toLowerCase() === expected);
      if (!accentPresent) {
        trackViolations.push({
          trackIndex,
          rule: "missing_accent_tag",
          message: `Opening stack is missing the cast voice's accent tag.`,
          castVoiceAccent: enforcedAccent,
          requiredTag: accentTag,
          hint: `Insert ${accentTag} as the FIRST tag in the opening stack.`,
        });
      }
    } else {
      // No enforced accent → "present" is vacuously true for telemetry.
      accentPresent = true;
    }

    // Rule 2: opening stack size
    if (opening.tags.length > OPENING_STACK_MAX) {
      trackViolations.push({
        trackIndex,
        rule: "opening_stack_oversize",
        message: `Opening stack has ${opening.tags.length} tags (max ${OPENING_STACK_MAX}).`,
        hint: `Trim the opening stack to ≤${OPENING_STACK_MAX} tags. Move emphasis into body weaves instead.`,
      });
    }

    // Rule 3: tag syntax
    const malformed = findMalformedTags(text);
    if (malformed.length) {
      trackViolations.push({
        trackIndex,
        rule: "malformed_tag_syntax",
        message: `Malformed tag(s): ${malformed.slice(0, 3).join(", ")}${malformed.length > 3 ? " …" : ""}`,
        hint: `Every tag must be a single bracketed token like [excited] or [strong french accent]. No nested or unclosed brackets.`,
      });
    }

    const lintPassed = trackViolations.length === 0;
    violations.push(...trackViolations);
    telemetry.push({
      trackIndex,
      openingStackSize: opening.tags.length,
      bodyTags: Math.max(0, allTags.length - opening.tags.length),
      totalTags: allTags.length,
      accentPresent,
      lintPassed,
      violations: trackViolations.map((v) => v.rule),
    });
  });

  return {
    ok: violations.length === 0,
    violations,
    telemetry,
  };
}

/**
 * Tags that lead the line, before the first non-tag character. Whitespace
 * between tags is allowed.
 */
function extractOpeningStack(text: string): {
  tags: string[];
  endIndex: number;
} {
  const tags: string[] = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i++;
    if (i >= len || text[i] !== "[") break;
    const close = text.indexOf("]", i);
    if (close === -1) break;
    const tag = text.slice(i, close + 1);
    if (!isWellFormedTag(tag)) break;
    tags.push(tag);
    i = close + 1;
  }
  return { tags, endIndex: i };
}

function extractAllTags(text: string): string[] {
  const out: string[] = [];
  const re = /\[[^\]\n]*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (isWellFormedTag(m[0])) out.push(m[0]);
  }
  return out;
}

function isWellFormedTag(tag: string): boolean {
  if (tag.length < 3) return false;
  if (tag[0] !== "[" || tag[tag.length - 1] !== "]") return false;
  const body = tag.slice(1, -1);
  if (!body.trim()) return false;
  // No nested brackets, no newlines, no other forbidden chars.
  if (/[\[\]\n]/.test(body)) return false;
  return /^[A-Za-z0-9 \-_]+$/.test(body);
}

function findMalformedTags(text: string): string[] {
  const malformed: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open === -1) break;
    const close = text.indexOf("]", open);
    const nextOpen = text.indexOf("[", open + 1);
    if (close === -1) {
      // Unclosed bracket — capture up to next newline or 30 chars.
      const tail = text.slice(open, Math.min(text.length, open + 30));
      malformed.push(tail.split("\n")[0]);
      break;
    }
    if (nextOpen !== -1 && nextOpen < close) {
      // Nested open before close → malformed.
      malformed.push(text.slice(open, close + 1));
      i = nextOpen;
      continue;
    }
    const tag = text.slice(open, close + 1);
    if (!isWellFormedTag(tag)) {
      malformed.push(tag);
    }
    i = close + 1;
  }
  return malformed;
}

/**
 * Build a single feedback string for the weaver retry. Concatenates
 * the human-readable hints for a single track's violations.
 */
export function buildWeaverRetryFeedback(violations: LintViolation[]): string {
  if (!violations.length) return "";
  return violations
    .map((v) => `- ${v.message}${v.hint ? " " + v.hint : ""}`)
    .join("\n");
}
