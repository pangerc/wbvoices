import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';
import { lahajatiDialectService, FALLBACK_ACCENT_TO_DIALECT } from '@/services/lahajatiDialectService';

/**
 * Dialect mapping is now fetched dynamically from Lahajati API during cache refresh.
 * See lahajatiDialectService for the dynamic implementation.
 *
 * This static export is kept for backward compatibility.
 */
const DIALECT_MAP = FALLBACK_ACCENT_TO_DIALECT;

/**
 * Performance style mapping: our voiceTone → Lahajati performance_id
 *
 * Lahajati has 1996 performance styles. We map our common tones to
 * appropriate defaults. Users can pass custom performance_id if needed.
 *
 * Using neutral/informative style as base default (1306).
 */
const PERFORMANCE_MAP: Record<string, number> = {
  // Default/neutral
  'neutral': 1306,        // محايد ومعلوماتي (neutral and informative)

  // Professional/serious tones
  'professional': 1308,   // درامي ومثير (dramatic documentary style)
  'serious': 1308,
  'authoritative': 1308,

  // Warm/friendly tones
  'warm': 1309,           // بهدوء ودفء (calm and warm)
  'friendly': 1309,
  'calm': 1309,
  'soothing': 1309,

  // Energetic/cheerful tones
  'energetic': 1280,      // تكنولوجي متقدم (tech/advanced - typically upbeat)
  'cheerful': 1280,
  'excited': 1280,
  'happy': 1280,

  // Confident tone
  'confident': 1565,      // ثقة هادئة (calm confidence)
};

// Default performance ID for unknown tones
const DEFAULT_PERFORMANCE_ID = 1306;

export class LahajatiVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'lahajati';
  readonly providerType = 'voice' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId, style, accent, dialectId, projectId, voiceInstructions } = body;

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

    return {
      isValid: true,
      data: {
        text,
        voiceId,
        style: typeof style === 'string' ? style : undefined,
        accent: typeof accent === 'string' ? accent : undefined,
        dialectId: typeof dialectId === 'number' ? dialectId : undefined,
        projectId: typeof projectId === 'string' ? projectId : undefined,
        voiceInstructions: typeof voiceInstructions === 'string' ? voiceInstructions : undefined
      }
    };
  }

  protected validateCredentials(): boolean {
    const apiKey = process.env.LAHAJATI_SECRET_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.LAHAJATI_SECRET_KEY;

    if (!apiKey) {
      throw new Error("Lahajati API key is missing");
    }

    return { apiKey };
  }

  /**
   * Resolves the dialect_id from either:
   * 1. Explicit dialectId passed in params
   * 2. accent code mapped through dialect service (fetched from API)
   * 3. Default to MSA (1)
   */
  private async resolveDialectId(dialectId?: number, accent?: string): Promise<number> {
    // Explicit dialect ID takes precedence
    if (typeof dialectId === 'number' && dialectId > 0) {
      return dialectId;
    }

    // Use dialect service for accent mapping (dynamic from Redis cache)
    return lahajatiDialectService.resolveDialectId(accent);
  }

  /**
   * Resolves performance_id from voiceTone/style
   */
  private resolvePerformanceId(style?: string): number {
    if (!style) return DEFAULT_PERFORMANCE_ID;

    const styleLower = style.toLowerCase();
    return PERFORMANCE_MAP[styleLower] || DEFAULT_PERFORMANCE_ID;
  }

  /**
   * Get dialect name for custom prompt building
   * Uses dynamic data from Lahajati API (Arabic display names)
   */
  private async getDialectDisplayName(dialectId: number): Promise<string> {
    return lahajatiDialectService.getDialectName(dialectId);
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, accent, dialectId, voiceInstructions } = params;
    const { apiKey } = credentials;

    // Resolve dialect ID from cache (async - fetched from Lahajati API)
    const resolvedDialectId = await this.resolveDialectId(
      dialectId as number | undefined,
      accent as string | undefined
    );
    const resolvedPerformanceId = this.resolvePerformanceId(style as string | undefined);

    console.log(`🎭 Lahajati TTS API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Accent: ${accent || 'not specified'}`);
    console.log(`  Dialect ID: ${resolvedDialectId}`);
    console.log(`  Style: ${style || 'neutral'}`);
    console.log(`  Voice Instructions: ${voiceInstructions ? 'provided' : 'none'}`);

    // Determine input mode: "1" (custom prompt) when voiceInstructions provided, else "0" (structured)
    let requestBody: Record<string, string>;

    if (voiceInstructions && typeof voiceInstructions === 'string') {
      // input_mode "1": Custom prompt mode (like OpenAI instructions)
      const dialectName = await this.getDialectDisplayName(resolvedDialectId);
      const customPrompt = `Speak in ${dialectName} dialect. ${voiceInstructions}`;

      requestBody = {
        text: text as string,
        id_voice: voiceId as string,
        input_mode: "1",
        custom_prompt_text: customPrompt,
      };

      console.log(`  📝 Using input_mode "1" (custom prompt): ${customPrompt.substring(0, 100)}...`);
    } else {
      // input_mode "0": Structured mode with performance_id and dialect_id
      requestBody = {
        text: text as string,
        id_voice: voiceId as string,
        input_mode: "0",
        performance_id: String(resolvedPerformanceId),
        dialect_id: String(resolvedDialectId),
      };

      console.log(`  📋 Using input_mode "0" (structured): performance_id=${resolvedPerformanceId}, dialect_id=${resolvedDialectId}`);
    }

    console.log(`  📡 Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await this.makeFetch(
      "https://lahajati.ai/api/v1/text-to-speech-absolute-control",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      console.error(`Lahajati error: ${errorInfo.message}`);
      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details
      };
    }

    // Lahajati returns audio directly as audio/mpeg
    const audioArrayBuffer = await response.arrayBuffer();

    console.log(`✅ Lahajati TTS success: received ${audioArrayBuffer.byteLength} bytes`);

    return {
      success: true,
      data: {
        audioArrayBuffer,
        text: text as string,
        voiceId: voiceId as string,
        style: style as string,
        accent: accent as string,
        dialectId: resolvedDialectId,
      }
    };
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioArrayBuffer, text, voiceId, style, accent, dialectId, projectId } = data;

    try {
      console.log("Lahajati: Uploading voice to Vercel Blob...");

      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        'lahajati',
        projectId as string
      );

      console.log(`Lahajati voice uploaded to blob: ${blobResult.url}`);

      return NextResponse.json({
        audio_url: blobResult.url,
        duration: blobResult.duration,
        original_text: text,
        voice_id: voiceId,
        provider: this.providerName,
        style: style,
        accent: accent,
        dialect_id: dialectId,
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: (audioArrayBuffer as ArrayBuffer).byteLength
        }
      });
    } catch (blobError) {
      console.error('Lahajati: Failed to upload voice to blob:', blobError);

      return NextResponse.json(
        { error: "Failed to upload audio to blob storage" },
        { status: 500 }
      );
    }
  }
}

// Export dialect map for use in voice cache building
export { DIALECT_MAP };
