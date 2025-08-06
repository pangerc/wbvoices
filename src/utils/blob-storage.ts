import { put } from '@vercel/blob';

/**
 * Uploads a file to Vercel Blob storage and returns a permanent URL
 */
export async function uploadToBlob(
  file: Blob | Buffer,
  filename: string,
  contentType?: string
): Promise<{ url: string; downloadUrl: string }> {
  try {
    const options: Parameters<typeof put>[2] = {
      access: 'public',
    };

    if (contentType) {
      options.contentType = contentType;
    }

    const result = await put(filename, file, options);
    
    return {
      url: result.url,
      downloadUrl: result.downloadUrl || result.url
    };
  } catch (error) {
    console.error('Failed to upload to Vercel Blob:', error);
    throw new Error(`Blob upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Downloads a file from a URL and uploads it to Vercel Blob
 * Useful for migrating from temporary URLs to permanent storage
 */
export async function downloadAndUploadToBlob(
  sourceUrl: string,
  filename: string,
  contentType?: string
): Promise<{ url: string; downloadUrl: string }> {
  try {
    console.log(`Downloading from: ${sourceUrl}`);
    const response = await fetch(sourceUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log(`Downloaded ${blob.size} bytes, uploading to Vercel Blob as: ${filename}`);
    
    // Use the response's content type if not provided
    const finalContentType = contentType || response.headers.get('content-type') || undefined;
    
    const result = await uploadToBlob(blob, filename, finalContentType);
    console.log(`Upload successful: ${result.url}`);
    
    return result;
  } catch (error) {
    console.error('Failed to download and upload to blob:', error);
    throw new Error(`Download and upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a unique filename for blob storage
 */
export function generateBlobFilename(
  prefix: string,
  extension: string,
  projectId?: string
): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);
  
  if (projectId) {
    return `${prefix}-${projectId}-${timestamp}-${randomId}.${extension}`;
  }
  
  return `${prefix}-${timestamp}-${randomId}.${extension}`;
}

/**
 * Music-specific blob upload helper
 */
export async function uploadMusicToBlob(
  sourceUrl: string,
  prompt: string,
  provider: 'beatoven' | 'loudly',
  projectId?: string
): Promise<{ url: string; downloadUrl: string }> {
  const filename = generateBlobFilename(
    `music-${provider}`,
    'wav',
    projectId
  );
  
  return downloadAndUploadToBlob(
    sourceUrl,
    filename,
    'audio/wav'
  );
}

/**
 * Voice-specific blob upload helper  
 */
export async function uploadVoiceToBlob(
  audioBlob: Blob,
  voiceId: string,
  provider: 'elevenlabs' | 'lovo' | 'openai',
  projectId?: string
): Promise<{ url: string; downloadUrl: string }> {
  const filename = generateBlobFilename(
    `voice-${provider}-${voiceId}`,
    'mp3',
    projectId
  );
  
  return uploadToBlob(
    audioBlob,
    filename,
    'audio/mpeg'
  );
}

/**
 * Sound effect-specific blob upload helper
 */
export async function uploadSoundFxToBlob(
  audioBlob: Blob,
  prompt: string,
  provider: 'elevenlabs',
  projectId?: string
): Promise<{ url: string; downloadUrl: string }> {
  // Sanitize prompt for filename (remove special characters, limit length)
  const sanitizedPrompt = prompt
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
  
  const filename = generateBlobFilename(
    `soundfx-${provider}-${sanitizedPrompt}`,
    'mp3',
    projectId
  );
  
  return uploadToBlob(
    audioBlob,
    filename,
    'audio/mpeg'
  );
}