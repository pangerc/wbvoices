import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { checkMusicCache, uploadMusicToBlobWithCache } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';
import { trackMusicUsage } from '@/lib/usage/tracker';

export class LoudlyProvider extends BaseAudioProvider {
  readonly providerName = 'loudly';
  readonly providerType = 'music' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { prompt, duration, projectId } = body;

    if (!prompt || typeof prompt !== 'string') {
      return { 
        isValid: false, 
        error: "Missing required parameter: prompt" 
      };
    }

    return {
      isValid: true,
      data: {
        prompt,
        duration: typeof duration === 'number' ? duration : 60,
        projectId: typeof projectId === 'string' ? projectId : undefined
      }
    };
  }

  protected validateCredentials(): boolean {
    const apiKey = process.env.LOUDLY_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.LOUDLY_API_KEY;
    
    if (!apiKey) {
      throw new Error("Loudly API key is missing");
    }

    return { apiKey };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { prompt, duration } = params;
    const { apiKey } = credentials;

    // Loudly requires duration in 15-second multiples
    const roundedDuration = Math.max(15, Math.round((duration as number) / 15) * 15);

    // 🔍 CHECK CACHE FIRST - Save money on expensive generation!
    console.log(`🔍 Loudly: Checking cache for prompt: "${(prompt as string).substring(0, 50)}..." (${roundedDuration}s, from ${duration}s)`);
    const cached = await checkMusicCache(prompt as string, 'loudly', roundedDuration);

    if (cached) {
      console.log(`💰 Loudly: Cache HIT! Saved $$ by using cached music: ${cached.url}`);
      // Track cache hit (doesn't count towards allotment)
      await trackMusicUsage(true);
      return {
        success: true,
        data: {
          id: 'cached-' + Date.now(),
          title: (prompt as string).substring(0, 50),
          music_file_path: cached.url,
          duration: roundedDuration,
          prompt: prompt as string,
          projectId: params.projectId as string,
          status: 'completed',
          cached: true
        }
      };
    }

    console.log(`💸 Loudly: Cache MISS - Generating NEW music ($$$ spent): "${(prompt as string).substring(0, 50)}..." (${roundedDuration}s)`);

    // Create FormData for Loudly API
    const formData = new FormData();
    formData.append("prompt", prompt as string);
    formData.append("duration", roundedDuration.toString());
    formData.append("test", "false");

    const response = await this.makeFetch(
      "https://soundtracks.loudly.com/b2b/ai/prompt/songs",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "API-KEY": apiKey as string,
          // Don't set Content-Type for FormData, the browser will set it automatically with the correct boundary
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details
      };
    }

    const data = await response.json();
    console.log("Loudly API response data:", data);

    // Track new track generated (counts towards allotment)
    await trackMusicUsage(false);

    // Loudly is synchronous - it returns music immediately if available
    return {
      success: true,
      data: {
        id: data.id,
        title: data.title || (prompt as string).substring(0, 50),
        music_file_path: data.music_file_path,
        duration: data.duration ? data.duration / 1000 : duration, // Convert from ms to seconds
        prompt: prompt as string,
        projectId: params.projectId as string,
        // If music_file_path exists, it's ready immediately
        status: data.music_file_path ? 'completed' : 'processing'
      }
    };
  }

  // Loudly is synchronous - no polling needed since music is returned immediately

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { music_file_path, prompt, title, id, duration, projectId, cached } = data;
    
    // If using cached result, return immediately
    if (cached) {
      console.log(`💰 Loudly: Returning cached music result`);
      return NextResponse.json({
        id: id,
        title: title || (prompt as string)?.substring(0, 50) || "Generated music",
        url: music_file_path, // Already a permanent Vercel Blob URL
        duration: duration,
        provider: this.providerName,
        cached: true,
        music_file_path: music_file_path // For compatibility
      });
    }
    
    // If music is ready, upload to blob storage with cache key
    if (music_file_path) {
      try {
        console.log("💸 Loudly: NEW music generated, uploading to Vercel Blob with cache key...");
        
        const blobResult = await uploadMusicToBlobWithCache(
          music_file_path as string,
          (prompt as string || title as string || "Generated music"),
          'loudly',
          duration as number,
          projectId as string || undefined
        );
        
        console.log(`Loudly music uploaded to blob (cached=${blobResult.cached}): ${blobResult.url}`);
        
        return NextResponse.json({
          id: id,
          title: title || (prompt as string)?.substring(0, 50) || "Generated music",
          url: blobResult.url, // Permanent Vercel Blob URL with cache key
          duration: duration,
          provider: this.providerName,
          original_url: music_file_path, // Original Loudly URL for debugging
          cached: blobResult.cached,
          blob_info: {
            downloadUrl: blobResult.downloadUrl
          },
          music_file_path: blobResult.url // For compatibility with existing client code
        });
      } catch (blobError) {
        console.error('Loudly: Failed to upload music to blob:', blobError);
        
        // Fallback: return the original Loudly response format
        return NextResponse.json({
          id: id,
          title: title || (prompt as string)?.substring(0, 50) || "Generated music",
          url: music_file_path,
          duration: duration,
          provider: this.providerName,
        });
      }
    }

    // If music is not ready, return processing status
    return NextResponse.json({
      id: id,
      status: 'processing',
      provider: this.providerName,
      message: "Music generation in progress, check status with GET request"
    });
  }
}