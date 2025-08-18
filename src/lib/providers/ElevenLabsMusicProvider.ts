import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { checkMusicCache, uploadMusicToBlobWithCache } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class ElevenLabsMusicProvider extends BaseAudioProvider {
  readonly providerName = 'elevenlabs';
  readonly providerType = 'music' as const;
  
  private readonly ELEVENLABS_MUSIC_API_URL = "https://api.elevenlabs.io/v1/music";

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { prompt, duration = 30, projectId } = body;

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
        duration: typeof duration === 'number' ? duration : 30,
        projectId: typeof projectId === 'string' ? projectId : undefined
      }
    };
  }

  protected validateCredentials(): boolean {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key is not configured');
    }
    
    return { apiKey };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { prompt, duration } = params;

    // 🔍 CHECK CACHE FIRST - Save money on expensive generation!
    console.log(`🔍 ElevenLabs Music: Checking cache for prompt: "${prompt}" (${duration}s)`);
    const cached = await checkMusicCache(prompt as string, 'elevenlabs', duration as number);
    
    if (cached) {
      console.log(`💰 ElevenLabs Music: Cache HIT! Saved $$ by using cached music: ${cached.url}`);
      return {
        success: true,
        data: {
          id: 'cached-' + Date.now(),
          url: cached.url,
          duration: duration,
          status: 'completed',
          generation_url: cached.url,
          cached: true,
          prompt: prompt as string
        }
      };
    }

    console.log(`💸 ElevenLabs Music: Cache MISS - Generating NEW music ($$$ spent): "${prompt}" (${duration}s)`);

    try {
      const response = await this.makeFetch(this.ELEVENLABS_MUSIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Xi-Api-Key": credentials.apiKey as string,
        },
        body: JSON.stringify({
          prompt: `${prompt as string}. Instrumental only, no vocals or singing.`,
          musicLengthMs: (duration as number) * 1000, // Convert seconds to milliseconds
        }),
      });

      if (!response.ok) {
        const errorText = await this.handleApiError(response);
        return {
          success: false,
          error: errorText
        };
      }

      // ElevenLabs Music API returns audio data directly (like SFX API)
      const audioData = await response.arrayBuffer();
      
      return {
        success: true,
        data: {
          audioData,
          prompt,
          duration,
          cached: false
        }
      };

    } catch (error) {
      console.error(`${this.providerName} music request failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioData, prompt, duration, cached, generation_url } = data;
    
    // If using cached result, return immediately
    if (cached) {
      console.log(`💰 ElevenLabs Music: Returning cached music result`);
      return NextResponse.json({
        id: 'cached-' + Date.now(),
        title: (prompt as string)?.substring(0, 50) || 'Generated music',
        url: generation_url, // Already a permanent Vercel Blob URL
        duration: duration as number,
        provider: this.providerName,
        cached: true
      });
    }
    
    // Upload new audio to blob storage with cache key
    if (audioData && audioData instanceof ArrayBuffer) {
      try {
        console.log("💸 ElevenLabs Music: NEW music generated, uploading to Vercel Blob with cache key...");
        
        const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
        const blobResult = await uploadMusicToBlobWithCache(
          audioBlob,
          (prompt as string) || 'Generated music',
          'elevenlabs',
          duration as number
        );
        
        console.log(`ElevenLabs music uploaded to blob (cached=${blobResult.cached}): ${blobResult.url}`);
        
        return NextResponse.json({
          id: `elevenlabs-music-${Date.now()}`,
          title: (prompt as string)?.substring(0, 50) || 'Generated music',
          url: blobResult.url, // Permanent Vercel Blob URL with cache key
          duration: duration as number,
          provider: this.providerName,
          cached: blobResult.cached,
          blob_info: {
            downloadUrl: blobResult.downloadUrl
          }
        });
      } catch (blobError) {
        console.error('ElevenLabs Music: Failed to upload to blob:', blobError);
        
        // Fallback to raw audio buffer
        return new NextResponse(audioData, {
          headers: {
            "Content-Type": "audio/mpeg",
          },
        });
      }
    }

    // For other cases
    return NextResponse.json({
      ...data,
      provider: this.providerName
    });
  }
}