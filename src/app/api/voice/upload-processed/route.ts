export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';

/**
 * Upload processed audio to Vercel Blob
 * This endpoint receives post-processed audio from the client and uploads it
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob;
    const voiceId = formData.get('voiceId') as string || 'unknown';
    const provider = formData.get('provider') as string || 'processed';
    const projectId = formData.get('projectId') as string || `processed-${Date.now()}`;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    console.log(`📤 Uploading processed audio: ${audioFile.size} bytes`);

    // Generate filename
    const filename = `${projectId}/${provider}-${voiceId}-${Date.now()}.wav`;

    // Upload to Vercel Blob
    const blob = await put(filename, audioFile, {
      access: 'public',
      contentType: 'audio/wav',
    });

    console.log(`✅ Processed audio uploaded to blob: ${blob.url}`);

    return NextResponse.json({
      audio_url: blob.url,
      download_url: blob.downloadUrl || blob.url,
      size: audioFile.size,
    });
  } catch (error) {
    console.error('❌ Failed to upload processed audio:', error);
    return NextResponse.json(
      { error: 'Failed to upload processed audio' },
      { status: 500 }
    );
  }
}
