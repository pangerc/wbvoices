/**
 * AI Match-Review (AAC-255) — the "critic".
 *
 * Judges the SOFT dimensions the deterministic reviewer can't check without an
 * LLM: whether the generated script carries the brief's CTA, matches the
 * requested tone/pacing, actually delivers the creative brief's intent, and
 * represents the brand. Emits `MatchFinding[]` in the SAME shape as
 * `reviewDeterministic` so `runMatchReview` can merge the two.
 *
 * Best-effort by contract: any failure (no API key, network, bad JSON) returns
 * `[]` and never throws — a critic failure must never break generation. The call
 * is skipped entirely when no soft dimension applies (keeps cost at zero when
 * the brief has no CTA/tone/intent/brand to check).
 *
 * Uses the repo's proven forced-JSON path (Chat Completions +
 * `response_format: { type: "json_object" }`), mirroring convert-voice-track.
 */

import OpenAI from "openai";
import type {
  Improvement,
  ImprovementApply,
  MatchFinding,
  MatchSeverity,
  ReviewBrief,
  ReviewResult,
} from "./types";

/** Proven JSON-mode combo in this repo (see convert-voice-track). */
const CRITIC_MODEL = "gpt-5.5";

/** Soft dimensions the critic is allowed to emit. */
const SOFT_DIMENSIONS = ["cta", "tone", "intent", "brand"] as const;
type SoftDimension = (typeof SOFT_DIMENSIONS)[number];

const VALID_SEVERITY = new Set<MatchSeverity>(["low", "medium", "high"]);

function nonEmpty(s: string | null | undefined): string | undefined {
  const t = (s ?? "").trim();
  return t ? t : undefined;
}

/** Strip performance tags like `[warm]` and join the spoken script. */
function scriptText(result: ReviewResult): string {
  return result.voiceTracks
    .map((t) => (t.text || "").replace(/\[[^\]]*\]/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Which soft dimensions are even checkable for this brief. Intent is skipped in
 * script mode (there the deterministic verbatim check owns correctness).
 */
export function applicableDimensions(brief: ReviewBrief): SoftDimension[] {
  const dims: SoftDimension[] = [];
  if (nonEmpty(brief.selectedCTA)) dims.push("cta");
  if (nonEmpty(brief.selectedTone) || nonEmpty(brief.selectedPacing)) {
    dims.push("tone");
  }
  if (brief.creativeMode !== "script" && nonEmpty(brief.creativeBrief)) {
    dims.push("intent");
  }
  if (nonEmpty(brief.brandName)) dims.push("brand");
  return dims;
}

/** True when the critic is worth calling: has a key, a script, and something to judge. */
export function shouldRunCritic(
  brief: ReviewBrief,
  result: ReviewResult,
): boolean {
  if (!process.env.OPENAI_API_KEY) return false;
  if (!scriptText(result)) return false;
  return applicableDimensions(brief).length > 0;
}

function buildSystemPrompt(dims: SoftDimension[]): string {
  return `You are a meticulous creative QA reviewer for short audio ads. Compare the GENERATED SCRIPT against the BRIEF and report ONLY the dimensions that do NOT match. Judge strictly but fairly — do not invent problems.

Review exactly these dimensions (ignore any others): ${dims.join(", ")}.
- "cta": the brief's call-to-action is clearly present and intact in the script.
- "tone": the delivery/wording matches the requested tone and pacing.
- "intent": the script actually delivers what the creative brief asked for.
- "brand": the brand/client name is represented appropriately.

Respond with a single JSON object, no prose, matching this schema:
{
  "findings": [
    {
      "dimension": "cta" | "tone" | "intent" | "brand",
      "matched": false,
      "severity": "low" | "medium" | "high",
      "expected": "short description of what the brief asked for",
      "actual": "short description of what the script did",
      "explanation": "one concise sentence on the mismatch",
      "improvements": [
        {
          "id": "kebab-case-id",
          "title": "short actionable fix",
          "rationale": "why / how, one line",
          "instruction": "a concrete instruction to regenerate that fixes it"
        }
      ]
    }
  ]
}

Only include findings where matched is false (a real mismatch). If everything matches, return {"findings": []}. Keep every string short.`;
}

function buildUserMessage(brief: ReviewBrief, result: ReviewResult): string {
  const lines: string[] = ["BRIEF:"];
  const cta = nonEmpty(brief.selectedCTA);
  const tone = nonEmpty(brief.selectedTone);
  const pacing = nonEmpty(brief.selectedPacing);
  const intent = nonEmpty(brief.creativeBrief);
  const brand = nonEmpty(brief.brandName);
  if (brand) lines.push(`- Brand: ${brand}`);
  if (intent) lines.push(`- Creative brief: ${intent}`);
  if (cta) lines.push(`- Call to action: ${cta}`);
  if (tone) lines.push(`- Tone: ${tone}`);
  if (pacing) lines.push(`- Pacing: ${pacing}`);
  if (brief.selectedLanguage)
    lines.push(`- Language: ${brief.selectedLanguage}`);
  if (brief.campaignFormat) lines.push(`- Format: ${brief.campaignFormat}`);
  lines.push("", "GENERATED SCRIPT:", scriptText(result));
  return lines.join("\n");
}

function coerceApply(raw: unknown): ImprovementApply | null {
  if (!raw || typeof raw !== "object") return null;
  const instruction = (raw as { instruction?: unknown }).instruction;
  if (typeof instruction !== "string" || !instruction.trim()) return null;
  return { kind: "chat_turn", instruction: instruction.trim() };
}

function coerceImprovement(
  raw: unknown,
  dimension: string,
): Improvement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;
  const id =
    typeof r.id === "string" && r.id.trim() ? r.id.trim() : `${dimension}-fix`;
  const rationale =
    typeof r.rationale === "string" && r.rationale.trim()
      ? r.rationale.trim()
      : undefined;
  // The critic puts the instruction on the improvement; lift it into `apply`.
  return { id, title, rationale, apply: coerceApply(r) };
}

/**
 * Validate + coerce the model's JSON into trusted `MatchFinding[]`. Keeps only
 * real mismatches on allowed soft dimensions, de-duped by dimension. Pure.
 */
export function coerceCriticFindings(
  raw: unknown,
  allowed: Set<string>,
): MatchFinding[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { findings?: unknown }).findings;
  if (!Array.isArray(arr)) return [];

  const out: MatchFinding[] = [];
  const seen = new Set<string>();

  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;

    const dimension = typeof f.dimension === "string" ? f.dimension : "";
    if (!allowed.has(dimension) || seen.has(dimension)) continue;
    if (f.matched === true) continue; // only mismatches

    const severity: MatchSeverity = VALID_SEVERITY.has(
      f.severity as MatchSeverity,
    )
      ? (f.severity as MatchSeverity)
      : "medium";

    const explanation =
      typeof f.explanation === "string" && f.explanation.trim()
        ? f.explanation.trim()
        : `The generated ad may not match the brief's ${dimension}.`;

    const improvements = Array.isArray(f.improvements)
      ? f.improvements
          .map((imp) => coerceImprovement(imp, dimension))
          .filter((imp): imp is Improvement => imp !== null)
      : [];

    out.push({
      dimension: dimension as MatchFinding["dimension"],
      matched: false,
      severity,
      expected:
        typeof f.expected === "string"
          ? f.expected.trim() || undefined
          : undefined,
      actual:
        typeof f.actual === "string" ? f.actual.trim() || undefined : undefined,
      explanation,
      improvements,
    });
    seen.add(dimension);
  }

  return out;
}

/** Run the AI critic. Never throws; returns [] on any problem. */
export async function reviewWithCritic(
  brief: ReviewBrief,
  result: ReviewResult,
): Promise<MatchFinding[]> {
  if (!shouldRunCritic(brief, result)) return [];
  const dims = applicableDimensions(brief);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: CRITIC_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(dims) },
        { role: "user", content: buildUserMessage(brief, result) },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.warn("[match-review] critic returned invalid JSON:", err);
      return [];
    }

    return coerceCriticFindings(parsed, new Set<string>(dims));
  } catch (err) {
    console.warn("[match-review] critic failed:", err);
    return [];
  }
}
