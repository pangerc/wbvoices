export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for upload

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Generate filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const filename = projectId 
      ? `mixed-audio-${projectId}-${timestamp}-${randomId}.wav`
      : `mixed-audio-${timestamp}-${randomId}.wav`;

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'audio/wav',
    });

    return NextResponse.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
    });
  } catch (error) {
    console.error('Mixed audio upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}