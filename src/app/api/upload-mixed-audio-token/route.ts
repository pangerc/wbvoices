export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

/**
 * Generate a client upload token for direct Vercel Blob upload
 * This bypasses the 4.5 MB API route limit
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    // Generate filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const filename = projectId
      ? `mixed-audio-${projectId}-${timestamp}-${randomId}.wav`
      : `mixed-audio-${timestamp}-${randomId}.wav`;

    // Return filename for client to use with direct upload
    return NextResponse.json({
      filename,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    console.error('Failed to generate upload token:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload token' },
      { status: 500 }
    );
  }
}
