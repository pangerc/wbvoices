export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, voiceId, style, useCase } = body;

  if (!text || !voiceId) {
    return NextResponse.json(
      { error: "Missing required parameters: text and voiceId" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is missing" },
      { status: 500 }
    );
  }

  try {
    // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
    const openAIVoice = voiceId.split('-')[0]; // Extract base voice from our ID
    
    // Build the enhanced prompt with creative control
    let enhancedText = text;
    
    // Apply style/useCase to control speech characteristics
    if (style || useCase) {
      const instructions = [];
      
      // Simply use the style directly - OpenAI understands natural language
      if (style && style !== 'Default') {
        instructions.push(style.toLowerCase());
      }
      
      if (useCase && useCase !== 'general') {
        // Add context for specific use cases
        if (useCase === 'advertisement') {
          instructions.push('promotional');
        } else {
          instructions.push(useCase.toLowerCase());
        }
      }
      
      if (instructions.length > 0) {
        // Use simple, natural instruction format
        enhancedText = `[${instructions.join(', ')}] ${text}`;
      }
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          input: enhancedText,
          voice: openAIVoice,
          response_format: "mp3",
          speed: 1.0,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI TTS API error:", errorText);
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const audioArrayBuffer = await response.arrayBuffer();
    return new NextResponse(audioArrayBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Error generating OpenAI audio:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}