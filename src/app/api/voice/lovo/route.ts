export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { uploadVoiceToBlob } from "@/utils/blob-storage";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, voiceId, style, useCase, projectId } = body;

  if (!text || !voiceId) {
    return NextResponse.json(
      { error: "Missing required parameters: text and voiceId" },
      { status: 400 }
    );
  }

  const apiKey = process.env.LOVO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Lovo API key is missing" },
      { status: 500 }
    );
  }

  try {
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

    // Upload to Vercel Blob for permanent storage
    try {
      console.log("Lovo voice generated, uploading to Vercel Blob...");
      const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        text.substring(0, 50), // Use first 50 chars as prompt
        'lovo',
        projectId
      );
      
      console.log(`Lovo voice uploaded to blob: ${blobResult.url}`);
      
      // Return JSON response with permanent URL instead of raw audio
      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        voice_id: voiceId,
        provider: 'lovo',
        style: style,
        use_case: useCase,
        original_lovo_url: audioUrl, // Keep track of original Lovo URL
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: audioArrayBuffer.byteLength
        }
      });
    } catch (blobError) {
      console.error('Failed to upload Lovo voice to blob:', blobError);
      
      // Fallback: return raw audio buffer as before
      console.log('Falling back to raw audio buffer response');
      return new NextResponse(audioArrayBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }
  } catch (error) {
    console.error("Error generating Lovo audio:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}