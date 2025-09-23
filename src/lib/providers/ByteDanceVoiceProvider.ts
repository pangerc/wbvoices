import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';
// Use Web Crypto API for Edge Runtime compatibility

export class ByteDanceVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'bytedance';
  readonly providerType = 'voice' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId, style, useCase, projectId } = body;

    if (!text || typeof text !== 'string') {
      return {
        isValid: false,
        error: "Missing required parameter: text"
      };
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return {
        isValid: false,
        error: "Missing required parameter: voiceId"
      };
    }

    // ByteDance has text length limits (we'll use 1000 chars as safe limit)
    if ((text as string).length > 1000) {
      return {
        isValid: false,
        error: "Text exceeds maximum length (1000 characters)"
      };
    }

    return {
      isValid: true,
      data: {
        text,
        voiceId,
        style: typeof style === 'string' ? style : undefined,
        useCase: typeof useCase === 'string' ? useCase : undefined,
        projectId: typeof projectId === 'string' ? projectId : undefined
      }
    };
  }

  protected validateCredentials(): boolean {
    const appId = process.env.BYTEDANCE_APP_ID;
    const accessToken = process.env.BYTEDANCE_ACCESS_TOKEN;
    const secretKey = process.env.BYTEDANCE_SECRET_KEY;
    return !!(appId && accessToken && secretKey);
  }

  async authenticate(): Promise<AuthCredentials> {
    const appId = process.env.BYTEDANCE_APP_ID;
    const accessToken = process.env.BYTEDANCE_ACCESS_TOKEN;
    const secretKey = process.env.BYTEDANCE_SECRET_KEY;

    if (!appId || !accessToken || !secretKey) {
      throw new Error("ByteDance credentials are missing");
    }

    return {
      apiKey: accessToken,
      appId,
      secretKey
    };
  }

  private async generateAuthHeaders(appId: string, accessToken: string, secretKey: string): Promise<Record<string, string>> {
    // ByteDance uses fixed authentication headers, not signature-based auth
    // secretKey parameter kept for interface compatibility but not used

    return {
      'X-Api-App-Id': appId,
      'X-Api-Access-Key': accessToken,
      'X-Api-Resource-Id': 'volc.service_type.1000009',
      'X-Api-App-Key': 'aGjiRDfUWi',
      'X-Api-Request-Id': `wb-voices-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      'Content-Type': 'application/json',
    };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase } = params;
    const { apiKey, appId, secretKey } = credentials;

    console.log(`🎭 ByteDance TTS API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || 'none'}`);
    console.log(`  Use Case: ${useCase || 'none'}`);

    // Build request payload according to ByteDance API
    const requestBody = {
      app: {
        appid: appId as string,
        token: apiKey as string,
        cluster: "volcano_tts"
      },
      user: {
        uid: "wb-voices-user" // A consistent user ID for our application
      },
      audio: {
        voice_type: voiceId as string,
        encoding: "wav",
        speed_ratio: 1.0,
        volume_ratio: 1.0,
        pitch_ratio: 1.0
      },
      request: {
        reqid: `wb-voices-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: text as string,
        text_type: "plain",
        operation: "query",
        with_frontend: 1,
        frontend_type: "unitTson"
      }
    };

    console.log(`  📡 Using voice type: ${voiceId}`);

    const response = await this.makeFetch(
      "https://openspeech.bytedance.com/api/v1/tts",
      {
        method: "POST",
        headers: await this.generateAuthHeaders(appId as string, apiKey as string, secretKey as string),
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await this.handleApiError(response);
      return {
        success: false,
        error: errorText
      };
    }

    // ByteDance returns streaming base64 encoded audio
    const responseData = await response.json();

    console.log(`ByteDance TTS response:`, {
      code: responseData.code,
      message: responseData.message,
      request_id: responseData.request_id
    });

    // Check for success response
    if (responseData.code !== 3000 && responseData.code !== 0) {
      return {
        success: false,
        error: `ByteDance API error: ${responseData.message || 'Unknown error'}`
      };
    }

    // Extract base64 audio data from response
    const audioBase64 = responseData.data;

    if (!audioBase64) {
      return {
        success: false,
        error: "No audio data in response"
      };
    }

    // Convert base64 to ArrayBuffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const audioArrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    );

    return {
      success: true,
      data: {
        audioArrayBuffer,
        text: text as string,
        voiceId: voiceId as string,
        style: style as string,
        useCase: useCase as string
      }
    };
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioArrayBuffer, text, voiceId, style, useCase, projectId } = data;

    try {
      console.log("ByteDance: Uploading voice to Vercel Blob...");

      // WAV format from ByteDance
      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], { type: 'audio/wav' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        'bytedance',
        projectId as string
      );

      console.log(`ByteDance voice uploaded to blob: ${blobResult.url}`);

      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        voice_id: voiceId,
        provider: this.providerName,
        style: style,
        use_case: useCase,
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: (audioArrayBuffer as ArrayBuffer).byteLength
        }
      });
    } catch (blobError) {
      console.error('ByteDance: Failed to upload voice to blob:', blobError);

      return NextResponse.json(
        { error: "Failed to upload audio to blob storage" },
        { status: 500 }
      );
    }
  }
}