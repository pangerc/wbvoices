import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class ByteDanceVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'bytedance';
  readonly providerType = 'voice' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId, style, useCase, projectId, emotion, voiceInstructions, language } = body;

    if (!text || typeof text !== 'string') {
      return { isValid: false, error: "Missing required parameter: text" };
    }

    if (!voiceId || typeof voiceId !== 'string') {
      return { isValid: false, error: "Missing required parameter: voiceId" };
    }

    if ((text as string).length > 1000) {
      return { isValid: false, error: "Text exceeds maximum length (1000 characters)" };
    }

    return {
      isValid: true,
      data: {
        text,
        voiceId,
        style: typeof style === 'string' ? style : undefined,
        useCase: typeof useCase === 'string' ? useCase : undefined,
        projectId: typeof projectId === 'string' ? projectId : undefined,
        emotion: typeof emotion === 'string' ? emotion : undefined,
        voiceInstructions: typeof voiceInstructions === 'string' ? voiceInstructions : undefined,
        language: typeof language === 'string' ? language : undefined,
      }
    };
  }

  protected validateCredentials(): boolean {
    return !!process.env.BYTEDANCE_APP_KEY;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.BYTEDANCE_APP_KEY;
    if (!apiKey) {
      throw new Error("ByteDance credentials missing (BYTEDANCE_APP_KEY)");
    }
    return { apiKey };
  }

  private generateAuthHeaders(apiKey: string): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'X-Api-Resource-Id': 'seed-tts-2.0',
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
    };
  }

  /**
   * Map language codes to ByteDance explicit_language values.
   * TTS 2.0 supports: zh, en, ja, es-mx, id, pt-br, de, fr
   */
  private mapLanguage(language?: string): string | undefined {
    if (!language) return undefined;
    const map: Record<string, string> = {
      'zh': 'zh', 'zh-CN': 'zh', 'zh-TW': 'zh', 'zh-HK': 'zh',
      'en': 'en', 'en-US': 'en', 'en-GB': 'en', 'en-AU': 'en',
      'ja': 'ja',
      'es': 'es-mx', 'es-MX': 'es-mx',
      'id': 'id',
      'pt': 'pt-br', 'pt-BR': 'pt-br',
      'de': 'de',
      'fr': 'fr',
    };
    return map[language] || undefined;
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase, emotion, voiceInstructions, language } = params;
    const { apiKey } = credentials;

    console.log(`ByteDance TTS 2.0 API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Speaker: ${voiceId}`);
    console.log(`  Emotion: ${emotion || 'none'}`);
    console.log(`  Voice Instructions: ${voiceInstructions ? (voiceInstructions as string).substring(0, 50) + '...' : 'none'}`);

    // Build audio_params
    const audioParams: Record<string, unknown> = {
      format: 'mp3',
      sample_rate: 24000,
      bit_rate: 128000,
    };

    if (emotion && typeof emotion === 'string') {
      audioParams.emotion = emotion;
      audioParams.emotion_scale = 4;
    }

    // Build additions JSON string
    const additions: Record<string, unknown> = {
      disable_markdown_filter: true,
      disable_default_bit_rate: true,
    };

    // Map voiceInstructions → context_texts (TTS 2.0 feature)
    if (voiceInstructions && typeof voiceInstructions === 'string') {
      additions.context_texts = [voiceInstructions];
    }

    const explicitLanguage = this.mapLanguage(language as string);
    if (explicitLanguage) {
      additions.explicit_language = explicitLanguage;
    }

    const requestBody = {
      req_params: {
        text: text as string,
        speaker: voiceId as string,
        audio_params: audioParams,
        additions: JSON.stringify(additions),
      }
    };

    const response = await this.makeFetch(
      "https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/unidirectional",
      {
        method: "POST",
        headers: this.generateAuthHeaders(apiKey as string),
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      return { success: false, error: errorInfo.message, errorDetails: errorInfo.details };
    }

    // V3 streaming response: multiple JSON chunks with base64 audio
    const responseText = await response.text();
    const lines = responseText.split('\n').filter(line => line.trim());
    const audioChunks: Buffer[] = [];

    for (const line of lines) {
      let chunk: { code: number; message?: string; data?: string };
      try {
        chunk = JSON.parse(line);
      } catch {
        console.warn(`ByteDance: Failed to parse response line: ${line.substring(0, 100)}`);
        continue;
      }

      // End-of-stream marker
      if (chunk.code === 20000000) break;

      // Error response
      if (chunk.code !== 0) {
        return { success: false, error: `ByteDance API error (${chunk.code}): ${chunk.message || 'Unknown error'}` };
      }

      if (chunk.data) {
        audioChunks.push(Buffer.from(chunk.data, 'base64'));
      }
    }

    if (audioChunks.length === 0) {
      return { success: false, error: "No audio data in response" };
    }

    const audioBuffer = Buffer.concat(audioChunks);
    const audioArrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    );

    console.log(`ByteDance TTS 2.0: Got ${audioChunks.length} chunks, ${audioBuffer.byteLength} bytes total`);

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

      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        'bytedance',
        projectId as string
      );

      console.log(`ByteDance voice uploaded to blob: ${blobResult.url}`);

      return NextResponse.json({
        audio_url: blobResult.url,
        duration: blobResult.duration,
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
