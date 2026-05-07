import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * "Generate instructions with AI" helper for the tone-of-voice admin form.
 * Accepts { title, description } and returns a short `voiceInstructions` paragraph
 * the admin can paste/tweak before saving the tone.
 */

const SYSTEM_PROMPT = `You are an audio-direction assistant for an ad creative platform.
Given a short tone name and description, write ONE concise paragraph (2–4 sentences, max ~80 words) of voice-delivery instructions that a TTS engine or voice actor can follow.
Focus on prosody, pacing, pitch, emotion, and articulation. No lists, no headings, no quotes — plain prose only.`;

export async function POST(req: NextRequest) {
  try {
    const { title, description } = await req.json();

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: "title and description are required" },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.4",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Tone title: ${title.trim()}\nDescription: ${description.trim()}\n\nWrite the voice delivery instructions.`,
        },
      ],
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 400,
    });

    const instructions = response.output_text?.trim();
    if (!instructions) {
      return NextResponse.json(
        { error: "No instructions generated" },
        { status: 502 },
      );
    }

    return NextResponse.json({ instructions });
  } catch (error) {
    console.error("Error generating tone instructions:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate instructions",
      },
      { status: 500 },
    );
  }
}
