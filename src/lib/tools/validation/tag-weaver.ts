/**
 * Stage N — focused pass-2 tag-weaver for ElevenLabs voice tracks.
 *
 * Pass 1 (the agent loop) writes the script clean. This module is the
 * *only* layer that decides where ElevenLabs V3 audio tags go inside a
 * line. The agent's pass-1 prompt is intentionally short and tells it to
 * hand off here.
 *
 * Why a separate pass: the original failure mode was every tag clustering
 * at the start of every line ("[mood][mood] script text") with no body
 * weave, even though the LLM clearly knows the V3 patterns when asked
 * about them. Tag placement was just the first concern dropped when the
 * agent had to juggle dialogue craft + brand voice + voice casting + tag
 * placement at once. A small focused pass with the cast voice's metadata
 * in scope and a single deterministic transform job restores it.
 *
 * Scope: ElevenLabs only. Other providers have their own delivery
 * controls (OpenAI voice instructions, Lahajati performance/dialect IDs,
 * ByteDance emotion tag) and the caller must skip pass-2 for them.
 */

import OpenAI from "openai";
import type { Voice } from "@/types";
import type { KnowledgeContext } from "@/lib/knowledge/types";
import { resolveAccentForLint } from "./accent-policy";

export interface TagWeaverOptions {
  /** Optional override of the lint feedback to fold into a retry. */
  lintFeedback?: string;
}

export interface TagWeaverResult {
  /** Final tagged text. Falls back to the input text on any failure. */
  text: string;
  /** True when the model produced a usable tagged version. */
  ok: boolean;
  /** Latency in ms (model call only). */
  latencyMs: number;
  /** When ok=false, why we fell back. */
  fallbackReason?: string;
}

// Default to gpt-5.5 to match the rest of the codebase. The pass is a
// focused single-line transform, so override via TAG_WEAVER_MODEL to a
// smaller variant once we benchmark — until then, parity beats guessed
// model IDs.
const MODEL = process.env.TAG_WEAVER_MODEL || "gpt-5.5";

let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

/**
 * Run the focused tag-weaving pass on a single ElevenLabs voice line.
 *
 * Failure-mode policy: any error (timeout, rate limit, bad output)
 * returns `{ ok: false, text: <original> }` so the caller can persist
 * the un-tagged line rather than block generation. Pass 1's text is
 * always a safe floor.
 */
export async function weaveTagsForElevenlabsTrack(
  text: string,
  voice: Voice,
  context: KnowledgeContext | undefined,
  opts: TagWeaverOptions = {},
): Promise<TagWeaverResult> {
  const start = Date.now();
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, text, latencyMs: 0, fallbackReason: "empty_input" };
  }

  const prompt = buildPrompt(trimmed, voice, context, opts.lintFeedback);

  try {
    const client = getClient();
    const response = await client.responses.create({
      model: MODEL,
      input: prompt,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 600,
    } as Parameters<typeof client.responses.create>[0]);

    const out = extractText(response);
    const cleaned = sanitize(out);
    const latencyMs = Date.now() - start;

    if (!cleaned) {
      return {
        ok: false,
        text,
        latencyMs,
        fallbackReason: "empty_model_output",
      };
    }

    // Sanity floor: the tagged version must contain the same alphabetic
    // letter count (±20%) as the input. Catches the rare case where the
    // model rewrites the line instead of tagging it.
    if (!preservesScriptText(trimmed, cleaned)) {
      return {
        ok: false,
        text,
        latencyMs,
        fallbackReason: "script_text_diverged",
      };
    }

    return { ok: true, text: cleaned, latencyMs };
  } catch (err) {
    return {
      ok: false,
      text,
      latencyMs: Date.now() - start,
      fallbackReason:
        err instanceof Error ? `model_error:${err.message}` : "model_error",
    };
  }
}

function buildPrompt(
  line: string,
  voice: Voice,
  context: KnowledgeContext | undefined,
  lintFeedback?: string,
): string {
  const accent = resolveAccentForLint(voice.accent);
  const accentTag = accent ? `[strong ${accent} accent]` : null;

  const voiceParts: string[] = [];
  if (voice.name) voiceParts.push(voice.name);
  if (voice.gender) voiceParts.push(voice.gender);
  if (accent) voiceParts.push(`${accent} accent`);
  if (voice.description) voiceParts.push(`baseline tone: ${voice.description}`);
  if (voice.style && voice.style !== voice.description) {
    voiceParts.push(`style: ${voice.style}`);
  }
  const voiceLine = voiceParts.join(" — ") || "ElevenLabs voice";

  const briefParts: string[] = [];
  if (context?.pacing) briefParts.push(`pacing=${context.pacing}`);
  if (context?.campaignFormat)
    briefParts.push(`format=${context.campaignFormat}`);
  const briefLine = briefParts.length ? briefParts.join(", ") : "—";

  const fastRule =
    context?.pacing === "fast"
      ? "- Fast pacing: extend the opening stack with [rapid-fire][fast][fast] (the doubled [fast] is an internal A/B-tested override of ElevenLabs docs — it reads measurably faster)."
      : "- Normal pacing: keep the opening stack to 2–3 tags total.";

  const accentRule = accentTag
    ? `- Open with ${accentTag} FIRST in the opening stack. The cast voice has a ${accent} accent — omitting the tag wastes the voice.`
    : "- The cast voice has no accent guidance to enforce; do not invent an accent tag.";

  const retryNote = lintFeedback
    ? `\n\nRetry context — the previous attempt failed lint with: ${lintFeedback}\nFix that specifically.`
    : "";

  return `You weave ElevenLabs V3 audio tags into a clean script line.

The script line: ${line}
The cast voice: ${voiceLine}
The brief: ${briefLine}

ElevenLabs V3 reference patterns (from docs):
- "[elated] Yes! [laughs] I'm so glad you knew!"  ← opening stack PLUS mid-line non-verbal
- "Well, [sigh] I'm not sure what to say."        ← mid-sentence non-verbal at the natural pause
- "[indecisive] Hi, can I get uhhh..."             ← mood + ellipsis-baked disfluency
- "[strong French accent] Zat's life…"            ← canonical accent form

Rules:
${accentRule}
${fastRule}
- Add 1–2 mood tags to the opening stack (e.g. [excited], [confident], [warm], [mischievously], [gentle]) that match the cast voice's personality. Do NOT stack moods beyond 2.
- Weave 1–2 emotional or non-verbal tags INSIDE the line at natural prosodic breaks — where a real reader would shift beat, breathe, react. Examples of non-verbals: [laughs], [chuckles], [sighs], [whispers], [happy gasp], [exhales], [short pause], [long pause]. Only add a body tag where the line gives it a natural slot; if the line is a single short reactive beat, the opening stack alone is enough.
- Punctuation is performance direction in V3. Ellipses (…) hold weight, CAPS push emphasis. Preserve and use them; do not strip the original punctuation.
- Tags are always in ENGLISH even when the script is in another language.
- Do NOT rewrite, translate, or paraphrase the script text. Only insert tags around the existing words.

Return ONLY the tagged version of the line. No explanation, no quotes, no JSON wrapper.${retryNote}`;
}

type ResponsesCreateResult = Awaited<ReturnType<OpenAI["responses"]["create"]>>;

function extractText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const r = response as Partial<ResponsesCreateResult> & {
    output_text?: string;
  };
  if (typeof r.output_text === "string" && r.output_text.trim()) {
    return r.output_text;
  }
  // Fallback: walk output items for assistant message text.
  const output = (r as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const i = item as { type?: string; content?: unknown[] };
    if (i.type !== "message") continue;
    if (!Array.isArray(i.content)) continue;
    for (const c of i.content) {
      if (!c || typeof c !== "object") continue;
      const piece = c as { type?: string; text?: string };
      if (piece.type === "output_text" && typeof piece.text === "string") {
        return piece.text;
      }
    }
  }
  return "";
}

function sanitize(raw: string): string {
  let s = raw.trim();
  // Strip surrounding quotes (model sometimes wraps the line).
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1).trim();
  }
  // Strip leading "Output:" / "Result:" labels just in case.
  s = s.replace(/^(?:output|result|tagged|line)\s*:\s*/i, "");
  return s.trim();
}

function preservesScriptText(original: string, tagged: string): boolean {
  const strip = (s: string) =>
    s
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const o = strip(original);
  const t = strip(tagged);
  if (!o) return true;
  // Allow up to 20% length divergence for legitimate punctuation tweaks.
  const ratio = t.length / o.length;
  return ratio >= 0.8 && ratio <= 1.25;
}
