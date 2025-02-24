export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, provider, voiceId } = body;

  if (!text || !provider || !voiceId) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  if (provider === "lovo") {
    const apiKey = process.env.LOVO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Lovo API key is missing" },
        { status: 500 }
      );
    }

    const createResponse = await fetch(
      "https://api.genny.lovo.ai/api/v1/tts/sync",
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          speed: 1,
          text,
          speaker: voiceId,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error("Lovo API error response:", errorText);
      return NextResponse.json(
        { error: errorText },
        { status: createResponse.status }
      );
    }

    const responseData = await createResponse.json();
    if (
      responseData.data[0].status !== "succeeded" ||
      !responseData.data[0].urls?.[0]
    ) {
      return NextResponse.json(
        { error: "No audio URL in response" },
        { status: 500 }
      );
    }

    const audioUrl = responseData.data[0].urls[0];
    const audioResponse = await fetch(audioUrl);

    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio file from URL" },
        { status: 500 }
      );
    }

    const audioArrayBuffer = await audioResponse.arrayBuffer();

    return new NextResponse(audioArrayBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } else if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Eleven Labs API key is missing" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Eleven Labs API error:", errorText);
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
  } else {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
}
