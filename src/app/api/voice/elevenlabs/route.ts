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

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Eleven Labs API key is missing" },
      { status: 500 }
    );
  }

  try {
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
    
    // Upload to Vercel Blob for permanent storage
    try {
      console.log("ElevenLabs voice generated, uploading to Vercel Blob...");
      const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        text.substring(0, 50), // Use first 50 chars as prompt
        'elevenlabs',
        projectId
      );
      
      console.log(`ElevenLabs voice uploaded to blob: ${blobResult.url}`);
      
      // Return JSON response with permanent URL instead of raw audio
      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        voice_id: voiceId,
        provider: 'elevenlabs',
        style: style,
        use_case: useCase,
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: audioArrayBuffer.byteLength
        }
      });
    } catch (blobError) {
      console.error('Failed to upload ElevenLabs voice to blob:', blobError);
      
      // Fallback: return raw audio buffer as before
      console.log('Falling back to raw audio buffer response');
      return new NextResponse(audioArrayBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }
  } catch (error) {
    console.error("Error generating ElevenLabs audio:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}