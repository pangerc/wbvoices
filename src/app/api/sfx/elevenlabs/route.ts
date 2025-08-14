import { NextRequest, NextResponse } from "next/server";
import { uploadSoundFxToBlob, generateCacheKey, findCachedContent } from "@/utils/blob-storage";

export async function POST(request: NextRequest) {
  try {
    const { text, duration, projectId } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "Text prompt is required" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = await generateCacheKey(text, { duration: duration || 5, provider: 'elevenlabs' });
    const cached = await findCachedContent(cacheKey, 'elevenlabs', 'soundfx');
    
    if (cached) {
      console.log(`✅ Using cached SoundFX for prompt: "${text.substring(0, 30)}..."`);
      return NextResponse.json({
        audio_url: cached.url,
        original_text: text,
        duration: duration || 5,
        provider: 'elevenlabs',
        type: 'soundfx',
        cached: true,
        blob_info: {
          downloadUrl: cached.downloadUrl,
        }
      });
    }

    console.log(`💰 Generating NEW SoundFX for prompt: "${text.substring(0, 30)}..."`);

    // Call the ElevenLabs Sound Generation API
    const url = "https://api.elevenlabs.io/v1/sound-generation";
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key is not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Xi-Api-Key": apiKey,
      },
      body: JSON.stringify({
        text: text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `ElevenLabs API error: ${errorData.detail || response.statusText}`
      );
    }

    // Get audio data from ElevenLabs
    const audioData = await response.arrayBuffer();

    // Upload to Vercel Blob for permanent storage
    try {
      console.log("ElevenLabs SoundFX generated, uploading to Vercel Blob...");
      const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
      const blobResult = await uploadSoundFxToBlob(
        audioBlob,
        text.substring(0, 50), // Use first 50 chars as prompt
        'elevenlabs',
        projectId
      );
      
      console.log(`ElevenLabs SoundFX uploaded to blob: ${blobResult.url}`);
      
      // Return JSON response with permanent URL instead of raw audio
      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        duration: duration,
        provider: 'elevenlabs',
        type: 'soundfx',
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: audioData.byteLength
        }
      });
    } catch (blobError) {
      console.error('Failed to upload ElevenLabs SoundFX to blob:', blobError);
      
      // Fallback: return raw audio buffer as before
      console.log('Falling back to raw audio buffer response');
      return new NextResponse(audioData, {
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }
  } catch (error) {
    console.error("Error generating sound effect:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
