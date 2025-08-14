import { put, list } from '@vercel/blob';

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
  provider: 'beatoven' | 'loudly' | 'mubert',
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

/**
 * Generates a cache key from prompt and parameters
 */
export async function generateCacheKey(prompt: string, params: Record<string, unknown> = {}): Promise<string> {
  const normalized = JSON.stringify({
    prompt: prompt.trim().toLowerCase(),
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
export async function uploadMusicToBlobWithCache(
  sourceUrl: string,
  prompt: string,
  provider: 'beatoven' | 'loudly' | 'mubert',
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
  
  const result = await downloadAndUploadToBlob(
    sourceUrl,
    filename,
    'audio/wav'
  );

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
  provider: 'loudly' | 'mubert',
  duration: number
): Promise<{ url: string; downloadUrl: string } | null> {
  const cacheKey = await generateCacheKey(prompt, { duration, provider });
  return findCachedContent(cacheKey, provider, 'music');
}