/**
 * POST /api/ai/convert-voice-track
 *
 * Focused single-shot LLM call that rewrites a voice track's script text
 * and creative instructions from one provider's conventions to another's.
 *
 * When the user changes a track's provider in VoiceInstructionsDialog, the
 * existing script text is often full of provider-specific syntax that
 * doesn't transfer:
 *   - ElevenLabs `[laughs]` / `[rapid-fire]` / `[French accent]` → literally
 *     read by ByteDance, Lahajati, Qwen, and OpenAI.
 *   - OpenAI structured `voiceInstructions` ("Voice Affect: ...; Tone: ...")
 *     → incompatible with Lahajati Arabic persona or ByteDance free-text style.
 *
 * This endpoint does a tight transform: same creative intent, new provider
 * syntax. Single OpenAI call, JSON-mode response. No agent loop.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

type SupportedProvider =
  | "elevenlabs"
  | "openai"
  | "lovo"
  | "qwen"
  | "bytedance"
  | "lahajati";

const SUPPORTED: readonly SupportedProvider[] = [
  "elevenlabs",
  "openai",
  "lovo",
  "qwen",
  "bytedance",
  "lahajati",
];

const BYTEDANCE_EMOTIONS = [
  "happy",
  "sad",
  "angry",
  "excited",
  "warm",
  "neutral",
  "fear",
  "surprised",
  "coldness",
  "affectionate",
  "chat",
  "ASMR",
  "authoritative",
];

interface ConvertRequest {
  text: string;
  voiceInstructions?: string;
  fromProvider: SupportedProvider;
  toProvider: SupportedProvider;
  language: string;
  voiceDescription?: string;
}

interface ConvertResponse {
  text: string;
  voiceInstructions?: string;
  emotion?: string;
  description?: string;
}

function buildPrompt(req: ConvertRequest): string {
  const { fromProvider, toProvider, language, voiceDescription } = req;

  // Per-provider script-syntax and instruction-format notes. Keep these in
  // sync with src/lib/knowledge/modules/*-voice.ts — those are the source of
  // truth for how each provider wants its text/instructions shaped.
  const syntaxNotes: Record<SupportedProvider, string> = {
    elevenlabs: `ElevenLabs V3: inline bracket tags for emotion and delivery ([laughs], [whispers], [excited], [rapid-fire], [fast], [french accent] etc.). Baseline tone lives in a separate "description" field (cheerful/calm/professional/etc.). Keep CAPS for emphasis and ellipses for pauses.`,
    openai: `OpenAI: plain text script — NO inline bracket tags. Delivery shape lives in a structured "voiceInstructions" field with 7 keys: Voice Affect, Tone, Pacing, Emotion, Emphasis, Pronunciation, Pauses.`,
    lahajati: `Lahajati (Arabic): plain text script in Arabic — NO bracket tags. Delivery lives in an optional Arabic-language "voiceInstructions" field framed as a persona/role directive describing HOW to speak (e.g. "اقرأ بصوت واثق كأنك مذيع رياضي" = "read confidently like a sports announcer"). Dialect is selected separately.`,
    bytedance: `ByteDance TTS 2.0: plain text script — NO bracket tags. Delivery is split across a single "emotion" tag chosen from a fixed set (${BYTEDANCE_EMOTIONS.join(", ")}) AND an optional short free-text "voiceInstructions" style cue (e.g. "Speak cheerfully and energetically", "Use a warm intimate tone").`,
    qwen: `Qwen: plain text script only — NO bracket tags, NO voice instructions, NO speed control. Natural prosody handled by the TTS model.`,
    lovo: `Lovo: plain text script only — NO bracket tags, NO voice instructions. Speed is set elsewhere.`,
  };

  return `You convert voice-ad scripts and delivery instructions between TTS provider formats.

## TASK
Convert this voice track from ${fromProvider.toUpperCase()} format to ${toProvider.toUpperCase()} format. Preserve the creative direction — same emotional arc, same emphasis, same delivery intent. Only change the SYNTAX.

## SOURCE FORMAT (${fromProvider})
${syntaxNotes[fromProvider]}

## TARGET FORMAT (${toProvider})
${syntaxNotes[toProvider]}

## LANGUAGE
The script is in language code "${language}". Keep the script in this language unless the target provider requires otherwise (e.g. Lahajati requires Arabic — if the source was in English for Arabic voices, translate). Do NOT translate if the target provider supports the source language natively.
${voiceDescription ? `\n## VOICE CHARACTER\n${voiceDescription}\n` : ""}
## OUTPUT
Return ONLY a single JSON object with these fields:
- "text": the converted script text (required)
- "voiceInstructions": converted delivery instructions in the target format (optional — omit or empty string if target provider doesn't use them)
- "emotion": for ByteDance target only — one of ${BYTEDANCE_EMOTIONS.map((e) => `"${e}"`).join(", ")}. Omit for other providers.
- "description": for ElevenLabs target only — a single baseline tone word (cheerful | excited | calm | professional | warm | serious | energetic | confident). Omit for other providers.

Do NOT include prose explanation, commentary, or markdown. Just the JSON object.`;
}

function buildUserMessage(req: ConvertRequest): string {
  const parts = [`SCRIPT:\n${req.text}`];
  if (req.voiceInstructions && req.voiceInstructions.trim()) {
    parts.push(
      `\nCURRENT INSTRUCTIONS (${req.fromProvider} format):\n${req.voiceInstructions}`,
    );
  }
  return parts.join("\n");
}

function validate(body: unknown): ConvertRequest | { error: string } {
  if (!body || typeof body !== "object")
    return { error: "body must be an object" };
  const b = body as Record<string, unknown>;

  if (typeof b.text !== "string" || !b.text.trim()) {
    return { error: "text is required and must be a non-empty string" };
  }
  if (
    typeof b.fromProvider !== "string" ||
    !SUPPORTED.includes(b.fromProvider as SupportedProvider)
  ) {
    return { error: `fromProvider must be one of ${SUPPORTED.join(", ")}` };
  }
  if (
    typeof b.toProvider !== "string" ||
    !SUPPORTED.includes(b.toProvider as SupportedProvider)
  ) {
    return { error: `toProvider must be one of ${SUPPORTED.join(", ")}` };
  }
  if (typeof b.language !== "string" || !b.language) {
    return { error: "language is required" };
  }
  if (
    b.voiceInstructions !== undefined &&
    typeof b.voiceInstructions !== "string"
  ) {
    return { error: "voiceInstructions must be a string if provided" };
  }
  if (
    b.voiceDescription !== undefined &&
    typeof b.voiceDescription !== "string"
  ) {
    return { error: "voiceDescription must be a string if provided" };
  }

  return {
    text: b.text,
    voiceInstructions: b.voiceInstructions as string | undefined,
    fromProvider: b.fromProvider as SupportedProvider,
    toProvider: b.toProvider as SupportedProvider,
    language: b.language,
    voiceDescription: b.voiceDescription as string | undefined,
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const validated = validate(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // Same-provider short-circuit: nothing to convert.
  if (validated.fromProvider === validated.toProvider) {
    return NextResponse.json({
      text: validated.text,
      voiceInstructions: validated.voiceInstructions,
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: buildPrompt(validated) },
        { role: "user", content: buildUserMessage(validated) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      console.error("[convert-voice-track] empty response from model");
      return NextResponse.json(
        { error: "empty response from model" },
        { status: 502 },
      );
    }

    let parsed: ConvertResponse;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("[convert-voice-track] failed to parse model JSON:", raw);
      return NextResponse.json(
        { error: "model returned invalid JSON", raw },
        { status: 502 },
      );
    }

    if (typeof parsed.text !== "string" || !parsed.text.trim()) {
      return NextResponse.json(
        { error: "model response missing required 'text' field", raw },
        { status: 502 },
      );
    }

    // Sanity-check provider-specific fields so we never return garbage the
    // UI then tries to persist.
    if (validated.toProvider === "bytedance" && parsed.emotion) {
      if (!BYTEDANCE_EMOTIONS.includes(parsed.emotion)) {
        console.warn(
          `[convert-voice-track] dropping invalid ByteDance emotion: ${parsed.emotion}`,
        );
        parsed.emotion = undefined;
      }
    }
    if (validated.toProvider !== "bytedance") parsed.emotion = undefined;
    if (validated.toProvider !== "elevenlabs") parsed.description = undefined;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[convert-voice-track] OpenAI call failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "conversion failed",
      },
      { status: 502 },
    );
  }
}
