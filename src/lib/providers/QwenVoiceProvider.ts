import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class QwenVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'qwen';
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

    // Check text length (512 token limit - roughly 1500 characters for safety)
    if ((text as string).length > 1500) {
      return {
        isValid: false,
        error: "Text exceeds maximum length (512 tokens / ~1500 characters)"
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
    const apiKey = process.env.QWEN_BEIJING_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.QWEN_BEIJING_API_KEY;
    
    if (!apiKey) {
      throw new Error("Qwen Beijing API key is missing");
    }

    return { apiKey };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase } = params;
    const { apiKey } = credentials;

    console.log(`🎭 Qwen TTS API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || 'none'}`);
    console.log(`  Use Case: ${useCase || 'none'}`);
    
    // Map our voice IDs to Qwen voice names
    const voiceMapping: Record<string, string> = {
      'chelsie': 'Chelsie',
      'cherry': 'Cherry', 
      'ethan': 'Ethan',
      'serena': 'Serena',
      'dylan': 'Dylan',
      'jada': 'Jada',
      'sunny': 'Sunny'
    };

    const qwenVoice = voiceMapping[(voiceId as string).toLowerCase()] || 'Chelsie';
    
    // Determine model based on voice (dialect voices need qwen-tts-latest)
    const isDialectVoice = ['Dylan', 'Jada', 'Sunny'].includes(qwenVoice);
    const model = isDialectVoice ? 'qwen-tts-latest' : 'qwen-tts';

    console.log(`  📡 Using model: ${model}, voice: ${qwenVoice}`);

    const requestBody = {
      model,
      input: {
        text: text as string,
        voice: qwenVoice
      }
    };

    const response = await this.makeFetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await this.handleApiError(response);
      return {
        success: false,
        error: errorText
      };
    }

    const responseData = await response.json();
    
    console.log(`Qwen TTS response:`, {
      finish_reason: responseData.output?.finish_reason,
      audio_id: responseData.output?.audio?.id,
      usage: responseData.usage
    });

    // Extract audio URL from response
    const audioUrl = responseData.output?.audio?.url;
    
    if (!audioUrl) {
      return {
        success: false,
        error: "No audio URL in response"
      };
    }

    // Download the audio from the temporary URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return {
        success: false,
        error: "Failed to download audio from Qwen URL"
      };
    }

    const audioArrayBuffer = await audioResponse.arrayBuffer();
    
    return {
      success: true,
      data: {
        audioArrayBuffer,
        text: text as string,
        voiceId: voiceId as string,
        style: style as string,
        useCase: useCase as string,
        originalUrl: audioUrl,
        expiresAt: responseData.output?.audio?.expires_at
      }
    };
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioArrayBuffer, text, voiceId, style, useCase, projectId, originalUrl, expiresAt } = data;
    
    try {
      console.log("Qwen: Uploading voice to Vercel Blob...");
      console.log(`  Original URL expires at: ${expiresAt}`);
      
      // WAV format from Qwen
      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], { type: 'audio/wav' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        'qwen',
        projectId as string
      );
      
      console.log(`Qwen voice uploaded to blob: ${blobResult.url}`);
      
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
      console.error('Qwen: Failed to upload voice to blob:', blobError);
      
      return NextResponse.json(
        { error: "Failed to upload audio to blob storage" },
        { status: 500 }
      );
    }
  }
}