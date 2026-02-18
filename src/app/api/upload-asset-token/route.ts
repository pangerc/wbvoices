export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

// File type configurations (validation only — no file body passes through this route)
const FILE_CONFIGS = {
  'preview-logo': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 5 * 1024 * 1024,
    prefix: 'preview-logo',
  },
  'preview-visual': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024,
    prefix: 'preview-visual',
  },
  'custom-music': {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/m4a'],
    maxSize: 50 * 1024 * 1024,
    prefix: 'custom-music',
  },
  'custom-sfx': {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac'],
    maxSize: 20 * 1024 * 1024,
    prefix: 'custom-sfx',
  },
} as const;

type FileType = keyof typeof FILE_CONFIGS;

/**
 * Generate a client upload token for direct Vercel Blob upload.
 * This bypasses the 4.5MB Vercel Serverless Function body limit.
 * Same pattern as /api/upload-mixed-audio-token.
 */
export async function POST(req: NextRequest) {
  try {
    const { fileType, projectId, contentType, fileSize, originalFilename } = await req.json();

    if (!fileType || !FILE_CONFIGS[fileType as FileType]) {
      return NextResponse.json(
        { error: 'Invalid file type', allowedTypes: Object.keys(FILE_CONFIGS) },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const config = FILE_CONFIGS[fileType as FileType];

    // Validate content type
    if (contentType && !(config.allowedTypes as readonly string[]).includes(contentType)) {
      return NextResponse.json(
        { error: `Invalid file format (${contentType}). Allowed: ${config.allowedTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize && fileSize > config.maxSize) {
      return NextResponse.json(
        { error: `File too large. Max size: ${config.maxSize / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Generate blob filename
    const ext = originalFilename?.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const filename = `${config.prefix}-${projectId}-${timestamp}.${ext}`;

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
