import { put, list } from '@vercel/blob';
import * as mm from 'music-metadata';

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
  provider: 'beatoven' | 'loudly' | 'mubert' | 'elevenlabs',
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
 * Measures actual audio duration from the blob
 */
export async function uploadVoiceToBlob(
  audioBlob: Blob,
  voiceId: string,
  provider: 'elevenlabs' | 'lovo' | 'openai' | 'qwen' | 'bytedance' | 'lahajati',
  projectId?: string
): Promise<{ url: string; downloadUrl: string; duration: number }> {
  // Determine file extension and content type based on actual blob type
  // Qwen returns WAV, others typically return MP3
  const isWav = audioBlob.type.includes('wav');
  const ext = isWav ? 'wav' : 'mp3';
  const contentType = audioBlob.type || 'audio/mpeg';

  const filename = generateBlobFilename(
    `voice-${provider}-${voiceId}`,
    ext,
    projectId
  );

  // Measure duration from audio blob before uploading
  // Let music-metadata auto-detect the format (fixes WAV from Qwen being parsed as MP3)
  let duration = 0;
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const metadata = await mm.parseBuffer(uint8Array);
    duration = metadata.format.duration || 0;
    console.log(`📏 Measured voice duration: ${duration.toFixed(2)}s (format: ${metadata.format.container || 'unknown'})`);
  } catch (error) {
    console.warn('Failed to measure voice duration:', error);
  }

  const result = await uploadToBlob(
    audioBlob,
    filename,
    contentType
  );

  return { ...result, duration };
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

/**
 * Normalizes prompt text for consistent cache key generation
 * Handles whitespace, punctuation, and special character differences
 * that occur when copy-pasting from different sources (Google Docs, Slack, etc.)
 */
function normalizePrompt(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFC')                    // Unicode normalization
    .replace(/\s+/g, ' ')                // Collapse whitespace (tabs, newlines, multiple spaces → single space)
    .replace(/[""]/g, '"')               // Curly → straight quotes
    .replace(/['']/g, "'")               // Smart → straight apostrophes
    .replace(/[—–]/g, '-');              // Em/en dash → hyphen
}

/**
 * Generates a cache key from prompt and parameters
 */
export async function generateCacheKey(prompt: string, params: Record<string, unknown> = {}): Promise<string> {
  const normalized = JSON.stringify({
    prompt: normalizePrompt(prompt),
    ...params
  });
  
  // Use Web Crypto API for Edge Runtime compatibility
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex.substring(0, 16);
}

/**
 * Searches for cached content based on metadata
 */
export async function findCachedContent(
  cacheKey: string,
  provider: string,
  type: 'music' | 'voice' | 'soundfx'
): Promise<{ url: string; downloadUrl: string } | null> {
  try {
    console.log(`🔍 Searching cache for ${type} from ${provider} with key: ${cacheKey}`);
    
    // Search for blobs with matching metadata
    const { blobs } = await list({
      prefix: `${type}-${provider}`,
      limit: 100 // Search recent uploads
    });

    // Find blob with matching cache key in filename or metadata
    const cachedBlob = blobs.find(blob => 
      blob.pathname.includes(cacheKey) || 
      (blob as unknown as { customMetadata?: { cacheKey?: string } }).customMetadata?.cacheKey === cacheKey
    );

    if (cachedBlob) {
      console.log(`✅ Cache HIT! Using cached ${type}: ${cachedBlob.url}`);
      return {
        url: cachedBlob.url,
        downloadUrl: cachedBlob.downloadUrl || cachedBlob.url
      };
    }

    console.log(`❌ Cache MISS for ${type} from ${provider}`);
    return null;
  } catch (error) {
    console.error('Cache search failed:', error);
    return null; // Fail gracefully, generate new content
  }
}

/**
 * Enhanced music upload with caching metadata
 */
// Overloaded function signatures
export async function uploadMusicToBlobWithCache(
  sourceUrl: string,
  prompt: string,
  provider: 'beatoven' | 'loudly' | 'mubert' | 'elevenlabs',
  duration: number,
  projectId?: string
): Promise<{ url: string; downloadUrl: string; cached: boolean }>;

export async function uploadMusicToBlobWithCache(
  audioBlob: Blob,
  prompt: string,
  provider: 'beatoven' | 'loudly' | 'mubert' | 'elevenlabs',
  duration: number,
  projectId?: string
): Promise<{ url: string; downloadUrl: string; cached: boolean }>;

export async function uploadMusicToBlobWithCache(
  sourceUrlOrBlob: string | Blob,
  prompt: string,
  provider: 'beatoven' | 'loudly' | 'mubert' | 'elevenlabs',
  duration: number,
  projectId?: string
): Promise<{ url: string; downloadUrl: string; cached: boolean }> {
  const cacheKey = await generateCacheKey(prompt, { duration, provider });
  
  // Check cache first
  const cached = await findCachedContent(cacheKey, provider, 'music');
  if (cached) {
    return { ...cached, cached: true };
  }

  // Generate new content with cache metadata
  const filename = generateBlobFilename(
    `music-${provider}-${cacheKey}`,
    'wav',
    projectId
  );
  
  console.log(`💰 Generating NEW music for prompt: "${prompt.substring(0, 50)}..."`);
  
  let result: { url: string; downloadUrl: string };
  
  if (typeof sourceUrlOrBlob === 'string') {
    // Handle URL-based upload (existing providers like Loudly, Mubert)
    result = await downloadAndUploadToBlob(
      sourceUrlOrBlob,
      filename,
      'audio/wav'
    );
  } else {
    // Handle Blob-based upload (ElevenLabs)
    result = await uploadToBlob(
      sourceUrlOrBlob,
      filename,
      'audio/mpeg'
    );
  }

  return { ...result, cached: false };
}

/**
 * Enhanced sound effect upload with caching metadata
 */
export async function uploadSoundFxToBlobWithCache(
  audioBlob: Blob,
  prompt: string,
  provider: 'elevenlabs',
  duration: number,
  projectId?: string
): Promise<{ url: string; downloadUrl: string; cached: boolean }> {
  const cacheKey = await generateCacheKey(prompt, { duration, provider });
  
  // Check cache first
  const cached = await findCachedContent(cacheKey, provider, 'soundfx');
  if (cached) {
    return { ...cached, cached: true };
  }

  // Generate new content with cache metadata
  const sanitizedPrompt = prompt
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
    
  const filename = generateBlobFilename(
    `soundfx-${provider}-${cacheKey}-${sanitizedPrompt}`,
    'mp3',
    projectId
  );
  
  console.log(`💰 Generating NEW sound effect for prompt: "${prompt.substring(0, 50)}..."`);
  
  const result = await uploadToBlob(
    audioBlob,
    filename,
    'audio/mpeg'
  );

  return { ...result, cached: false };
}

/**
 * Check if cached sound effect exists for the exact prompt
 */
export async function checkSoundFxCache(
  prompt: string,
  provider: 'elevenlabs',
  duration: number
): Promise<{ url: string; downloadUrl: string } | null> {
  const cacheKey = await generateCacheKey(prompt, { duration, provider });
  return findCachedContent(cacheKey, provider, 'soundfx');
}

/**
 * Check if cached music exists for the exact prompt
 */
export async function checkMusicCache(
  prompt: string,
  provider: 'loudly' | 'mubert' | 'elevenlabs',
  duration: number
): Promise<{ url: string; downloadUrl: string } | null> {
  const cacheKey = await generateCacheKey(prompt, { duration, provider });
  return findCachedContent(cacheKey, provider, 'music');
}

/**
 * Mixed audio-specific blob upload helper
 * Uses direct client-to-Vercel Blob upload to bypass 4.5 MB API route limits
 */
export async function uploadMixedAudioToBlob(
  audioBlob: Blob,
  projectId?: string
): Promise<{ url: string; downloadUrl: string }> {
  try {
    // Step 1: Get upload token and filename from our API
    const tokenResponse = await fetch('/api/upload-mixed-audio-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get upload token');
    }

    const { filename, token } = await tokenResponse.json();

    // Step 2: Upload directly to Vercel Blob from client
    // Using client-side put() from @vercel/blob
    const blob = await put(filename, audioBlob, {
      access: 'public',
      token,
      contentType: 'audio/wav',
    });

    return {
      url: blob.url,
      downloadUrl: blob.downloadUrl || blob.url,
    };
  } catch (error) {
    console.error('❌ Direct blob upload failed:', error);
    throw new Error(`Mixed audio upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}