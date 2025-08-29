import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { generateCacheKey, findCachedContent, uploadSoundFxToBlobWithCache } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class ElevenLabsSoundFxProvider extends BaseAudioProvider {
  readonly providerName = 'elevenlabs';
  readonly providerType = 'sfx' as const;
  
  private readonly ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/sound-generation";

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, duration = 5, projectId } = body;

    if (!text || typeof text !== 'string') {
      return { 
        isValid: false, 
        error: "Text prompt is required" 
      };
    }

    // Validate duration bounds (ElevenLabs API requires 0.5-30 seconds)
    let validatedDuration = typeof duration === 'number' ? duration : 5;
    if (validatedDuration < 0.5) {
      validatedDuration = 0.5;
    } else if (validatedDuration > 30) {
      validatedDuration = 30;
    }

    return {
      isValid: true,
      data: {
        text,
        duration: validatedDuration,
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
    const { text, duration } = params;

    // Check cache first
    const cacheKey = await generateCacheKey(text as string, { 
      duration, 
      provider: this.providerName 
    });
    
    const cached = await findCachedContent(cacheKey, this.providerName, 'soundfx');
    
    if (cached) {
      console.log(`✅ Using cached SoundFX for prompt: "${(text as string).substring(0, 30)}..."`);
      return {
        success: true,
        data: {
          audio_url: cached.url,
          original_text: text,
          duration,
          cached: true,
          blob_info: {
            downloadUrl: cached.downloadUrl,
          }
        }
      };
    }

    console.log(`💰 Generating NEW SoundFX for prompt: "${(text as string).substring(0, 30)}..."`);

    try {
      const response = await this.makeFetch(this.ELEVENLABS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Xi-Api-Key": credentials.apiKey as string,
        },
        body: JSON.stringify({
          text: text as string,
          duration_seconds: duration as number,
        }),
      });

      if (!response.ok) {
        const errorMessage = await this.handleApiError(response);
        throw new Error(`ElevenLabs API error: ${errorMessage}`);
      }

      const audioData = await response.arrayBuffer();
      
      return {
        success: true,
        data: {
          audioData,
          text,
          duration,
          cached: false
        }
      };

    } catch (error) {
      console.error(`${this.providerName} request failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioData, text, duration, cached, audio_url, blob_info } = data;

    // If cached, return immediately
    if (cached && audio_url) {
      return NextResponse.json({
        audio_url,
        original_text: text,
        duration,
        provider: this.providerName,
        type: 'soundfx',
        cached: true,
        blob_info
      });
    }

    // Upload new audio to blob with caching
    try {
      const audioBlob = new Blob([audioData as ArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadSoundFxToBlobWithCache(
        audioBlob,
        text as string,
        this.providerName as 'elevenlabs',
        duration as number,
        data.projectId as string | undefined
      );
      
      console.log(`ElevenLabs SoundFX ${blobResult.cached ? 'retrieved from cache' : 'uploaded to blob'}: ${blobResult.url}`);
      
      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        duration,
        provider: this.providerName,
        type: 'soundfx',
        cached: blobResult.cached,
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: (audioData as ArrayBuffer).byteLength
        }
      });

    } catch (blobError) {
      console.error('Failed to upload ElevenLabs SoundFX to blob:', blobError);
      
      // Fallback: return raw audio buffer
      console.log('Falling back to raw audio buffer response');
      return new NextResponse(audioData as ArrayBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }
  }
}