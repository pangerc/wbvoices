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
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/m4a'],
    maxSize: 50 * 1024 * 1024, // 50MB
    prefix: 'custom-music',
  },
  // Sound effects
  'custom-sfx': {
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3'],
    maxSize: 20 * 1024 * 1024, // 20MB
    prefix: 'custom-sfx',
  },
} as const;

type FileType = keyof typeof FILE_CONFIGS;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as FileType;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!fileType || !FILE_CONFIGS[fileType]) {
      return NextResponse.json({ 
        error: 'Invalid file type',
        allowedTypes: Object.keys(FILE_CONFIGS)
      }, { status: 400 });
    }

    const config = FILE_CONFIGS[fileType];

    // Validate file type
    if (!(config.allowedTypes as readonly string[]).includes(file.type)) {
      return NextResponse.json({ 
        error: `Invalid file format. Allowed: ${config.allowedTypes.join(', ')}` 
      }, { status: 400 });
    }

    // Validate file size
    if (file.size > config.maxSize) {
      return NextResponse.json({ 
        error: `File too large. Max size: ${config.maxSize / (1024 * 1024)}MB` 
      }, { status: 400 });
    }

    // Generate a unique filename
    const fileExtension = file.name.split('.').pop();
    const timestamp = Date.now();
    const filename = `${config.prefix}-${projectId}-${timestamp}.${fileExtension}`;

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      filename: filename,
      fileType: fileType,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}