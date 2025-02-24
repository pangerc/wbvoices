export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// Slovenian voice ID from the API response
const SLOVENIAN_VOICE_ID = "63b409fc241a82001d51c7ac";

interface LovoResponse {
  data: [
    {
      urls: string[];
      status: string;
    }
  ];
  status: string;
}

/**
 * POST /api/streamAudio
 * Body: { text: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body?.text ?? "Zdravo, kako si?"; // Default Slovenian greeting

    console.log("Converting text to speech:", text);
    const apiKey = process.env.LOVO_API_KEY;
    console.log("Using API key:", apiKey);

    // Create TTS request using the sync endpoint
    const createResponse = await fetch(
      "https://api.genny.lovo.ai/api/v1/tts/sync",
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey!,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          speed: 1,
          text,
          speaker: SLOVENIAN_VOICE_ID,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("Lovo API error response:", errorText);
      throw new Error(
        `Failed to create TTS job. API Key: ${apiKey}. Error: ${errorText}`
      );
    }

    // Parse the response to get the audio URL
    const responseData = (await createResponse.json()) as LovoResponse;
    console.log("Lovo API response:", responseData);

    if (
      responseData.data[0].status !== "succeeded" ||
      !responseData.data[0].urls?.[0]
    ) {
      throw new Error("No audio URL in response");
    }

    // Fetch the audio file from the provided URL
    const audioResponse = await fetch(responseData.data[0].urls[0]);
    if (!audioResponse.ok) {
      throw new Error("Failed to fetch audio file from URL");
    }

    const audioArrayBuffer = await audioResponse.arrayBuffer();

    // Return the audio file
    return new NextResponse(audioArrayBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error("Lovo API error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
