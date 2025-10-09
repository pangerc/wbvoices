import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { checkMusicCache, uploadMusicToBlobWithCache } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class MubertProvider extends BaseAudioProvider {
  readonly providerName = 'mubert';
  readonly providerType = 'music' as const;
  
  private readonly MUBERT_BASE_URL = "https://music-api.mubert.com/api/v3";

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { prompt, duration = 30, projectId, _internal_ready_url, _internal_track_id } = body;

    // Handle internal request to process ready track
    if (_internal_ready_url && _internal_track_id) {
      return {
        isValid: true,
        data: {
          prompt: typeof prompt === 'string' ? prompt : 'Generated music',
          duration: typeof duration === 'number' ? duration : 30,
          projectId: typeof projectId === 'string' ? projectId : undefined,
          _internal_ready_url: _internal_ready_url as string,
          _internal_track_id: _internal_track_id as string,
          isInternalRequest: true
        }
      };
    }

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
    const companyId = process.env.MUBERT_COMPANY_ID;
    const licenseToken = process.env.MUBERT_LICENSE_TOKEN;
    return !!(companyId && licenseToken);
  }

  async authenticate(): Promise<AuthCredentials> {
    const companyId = process.env.MUBERT_COMPANY_ID!;
    const licenseToken = process.env.MUBERT_LICENSE_TOKEN!;
    
    console.log("Mubert: Registering customer...");
    const customId = `wb-voices-${Date.now()}`;
    
    const response = await this.makeFetch(`${this.MUBERT_BASE_URL}/service/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "company-id": companyId,
        "license-token": licenseToken,
      },
      body: JSON.stringify({
        custom_id: customId,
      }),
    });

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      throw new Error(`Customer registration failed: ${errorInfo.message}`);
    }

    const customerData = await response.json();
    const customerId = customerData.data?.id;
    const accessToken = customerData.data?.access?.token;

    if (!customerId || !accessToken) {
      throw new Error("Failed to extract customer credentials from registration response");
    }

    console.log("✅ Mubert customer registration successful");
    return { customerId, accessToken };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { prompt, duration } = params;
    const { customerId, accessToken } = credentials;

    // 🔍 CHECK CACHE FIRST - Save money on expensive generation!
    console.log(`🔍 Mubert: Checking cache for prompt: "${prompt}" (${duration}s)`);
    const cached = await checkMusicCache(prompt as string, 'mubert', duration as number);
    
    if (cached) {
      console.log(`💰 Mubert: Cache HIT! Saved $$ by using cached music: ${cached.url}`);
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

    console.log(`💸 Mubert: Cache MISS - Generating NEW music ($$$ spent): "${prompt}" (${duration}s)`);

    const response = await this.makeFetch(`${this.MUBERT_BASE_URL}/public/tracks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "customer-id": customerId as string,
        "access-token": accessToken as string,
      },
      body: JSON.stringify({
        prompt: prompt as string,
        duration: duration as number,
        bitrate: 128,
        mode: "track",
        intensity: "medium",
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details
      };
    }

    const data = await response.json();
    const trackData = data.data;
    
    if (!trackData) {
      return {
        success: false,
        error: "No track data returned from Mubert API"
      };
    }

    const generation = trackData.generations?.[0];
    if (!generation) {
      return {
        success: false,
        error: "No generation data returned from Mubert API"
      };
    }

    // If track is ready immediately
    if (generation.status === 'done' && generation.url) {
      console.log("🎵 Mubert track ready immediately");
      return {
        success: true,
        data: {
          id: trackData.id,
          url: generation.url,
          duration: trackData.duration,
          status: 'completed',
          generation_url: generation.url
        }
      };
    }

    // If still processing, return for polling
    if (generation.status === 'processing') {
      console.log("Mubert track processing, needs polling...");
      return {
        success: true,
        needsPolling: true,
        taskId: trackData.id,
        data: {
          id: trackData.id,
          status: 'processing'
        }
      };
    }

    return {
      success: false,
      error: `Unexpected track status: ${generation.status}`
    };
  }

  async pollStatus(taskId: string, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { customerId, accessToken } = credentials;

    console.log(`Mubert: Checking status for track ${taskId}`);

    const response = await this.makeFetch(`${this.MUBERT_BASE_URL}/public/tracks/${taskId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "customer-id": customerId as string,
        "access-token": accessToken as string,
      },
    });

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details
      };
    }

    const statusData = await response.json();
    const generation = statusData.data?.generations?.[0];

    if (generation?.status === 'done' && generation.url) {
      console.log("🎵 Mubert track generation completed!");
      return {
        success: true,
        data: {
          id: taskId,
          url: generation.url,
          status: 'completed',
          generation_url: generation.url
        }
      };
    }

    return {
      success: true,
      data: {
        id: taskId,
        status: generation?.status || 'unknown'
      }
    };
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { id, duration, generation_url, prompt, cached } = data;
    
    // If using cached result, return immediately
    if (cached) {
      console.log(`💰 Mubert: Returning cached music result`);
      return NextResponse.json({
        id,
        title: (prompt as string)?.substring(0, 50) || 'Generated music',
        url: generation_url, // Already a permanent Vercel Blob URL
        duration: duration as number,
        provider: this.providerName,
        cached: true
      });
    }
    
    // If we have a ready URL, upload to blob storage with cache key
    if (generation_url && typeof generation_url === 'string') {
      try {
        console.log("💸 Mubert: NEW music generated, uploading to Vercel Blob with cache key...");
        
        const blobResult = await uploadMusicToBlobWithCache(
          generation_url,
          (prompt as string) || 'Generated music',
          'mubert',
          duration as number
        );
        
        console.log(`Mubert music uploaded to blob (cached=${blobResult.cached}): ${blobResult.url}`);
        
        return NextResponse.json({
          id,
          title: (prompt as string)?.substring(0, 50) || 'Generated music',
          url: blobResult.url, // Permanent Vercel Blob URL with cache key
          duration: duration as number,
          provider: this.providerName,
          original_url: generation_url,
          cached: blobResult.cached,
          blob_info: {
            downloadUrl: blobResult.downloadUrl
          }
        });
      } catch (blobError) {
        console.error('Mubert: Failed to upload to blob:', blobError);
        
        // Fallback to direct URL
        return NextResponse.json({
          id,
          title: (prompt as string)?.substring(0, 50) || 'Generated music',
          url: generation_url,
          duration: duration as number,
          provider: this.providerName,
        });
      }
    }

    // For processing status or other cases
    return NextResponse.json({
      ...data,
      provider: this.providerName
    });
  }
}