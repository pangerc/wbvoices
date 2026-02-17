export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

// File type configurations
const FILE_CONFIGS = {
  // Preview assets
  'preview-logo': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 5 * 1024 * 1024, // 5MB
    prefix: 'preview-logo',
  },
  'preview-visual': {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024, // 10MB
    prefix: 'preview-visual',
  },
  // Music assets
  'custom-music': {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/m4a'],
    maxSize: 50 * 1024 * 1024, // 50MB
    prefix: 'custom-music',
  },
  // Sound effects
  'custom-sfx': {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac'],
    maxSize: 20 * 1024 * 1024, // 20MB
    prefix: 'custom-sfx',
  },
} as const;

type FileType = keyof typeof FILE_CONFIGS;

export async function POST(request: NextRequest) {
  try {
    // Read metadata from headers (file body is raw binary, not FormData)
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const fileType = request.headers.get('x-file-type') as FileType;
    const projectId = request.headers.get('x-project-id');
    const originalFilename = decodeURIComponent(request.headers.get('x-filename') || 'upload');
    const fileSize = parseInt(request.headers.get('x-file-size') || '0', 10);
    const duration = request.headers.get('x-duration')
      ? parseFloat(request.headers.get('x-duration')!)
      : null;

    if (!fileType || !FILE_CONFIGS[fileType]) {
      return NextResponse.json({
        error: 'Invalid file type',
        allowedTypes: Object.keys(FILE_CONFIGS)
      }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const config = FILE_CONFIGS[fileType];

    // Validate content type
    if (!(config.allowedTypes as readonly string[]).includes(contentType)) {
      return NextResponse.json({
        error: `Invalid file format (${contentType}). Allowed: ${config.allowedTypes.join(', ')}`
      }, { status: 400 });
    }

    // Validate file size
    if (fileSize > config.maxSize) {
      return NextResponse.json({
        error: `File too large. Max size: ${config.maxSize / (1024 * 1024)}MB`
      }, { status: 400 });
    }

    if (!request.body) {
      return NextResponse.json({ error: 'No file body provided' }, { status: 400 });
    }

    // Generate a unique filename
    const fileExtension = originalFilename.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const blobFilename = `${config.prefix}-${projectId}-${timestamp}.${fileExtension}`;

    // Stream body directly to Vercel Blob (no buffering)
    const blob = await put(blobFilename, request.body, {
      access: 'public',
      addRandomSuffix: false,
      contentType,
    });

    console.log(`✅ Uploaded ${originalFilename} → ${blob.url}${duration ? ` (${duration.toFixed(1)}s)` : ''}`);

    return NextResponse.json({
      url: blob.url,
      filename: originalFilename,
      fileType: fileType,
      size: fileSize,
      mimeType: contentType,
      duration: duration,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
