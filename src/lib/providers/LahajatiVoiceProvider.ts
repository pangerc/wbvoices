import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

/**
 * Dialect mapping: our accent codes → Lahajati dialect_id
 * Based on Lahajati API response from /api/v1/dialect-absolute-control
 *
 * When multiple sub-dialects exist (e.g., Egyptian Cairo vs Alexandria),
 * we map to the most common/standard variant.
 */
const DIALECT_MAP: Record<string, number> = {
  // Modern Standard Arabic
  'standard': 1,
  'neutral': 1,

  // Saudi variants (2-6) → default to Najdi (most widely recognized)
  'saudi': 2,

  // Egyptian variants (7-11) → default to Cairo (القاهرية)
  'egyptian': 7,

  // Syrian variants (12-16) → default to Damascus (الدمشقية)
  'syrian': 12,

  // Lebanese variants (17-21) → default to Beirut (البيروتية)
  'lebanese': 17,

  // Jordanian variants (22-25) → default to Amman (العمانية)
  'jordanian': 22,

  // Palestinian variants (26-29) → default to urban (المدنية)
  'palestinian': 26,

  // Algerian variants (30-34) → default to capital (العاصمية)
  'algerian': 30,

  // Moroccan variants (35-39) → default to Casablanca/Rabat (الدارجة)
  'moroccan': 35,

  // Tunisian variants (40-43) → default to capital (العاصمة)
  'tunisian': 40,

  // Iraqi variants (44-47) → default to Baghdad (البغدادية)
  'iraqi': 44,

  // Yemeni variants (48-52) → default to Sanaa (الصنعانية)
  'yemeni': 48,

  // Libyan variants (57-59) → default to Tripoli (طرابلس)
  'libyan': 57,

  // Omani variants (60-63) → default to Muscat (مسقط)
  'omani': 60,

  // Kuwaiti variants (64-66) → default to general (العامة)
  'kuwaiti': 64,

  // Bahraini variants (67-68) → default to Manama (العامة)
  'bahraini': 67,

  // Qatari (69)
  'qatari': 69,

  // Emirati variants (70-71) → default to Abu Dhabi/Dubai (الحضرية)
  'emirati': 70,

  // Gulf region fallback → Saudi Najdi
  'gulf': 2,

  // Maghrebi region fallback → Moroccan
  'maghrebi': 35,
};

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
    const { text, voiceId, style, accent, dialectId, projectId } = body;

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
        projectId: typeof projectId === 'string' ? projectId : undefined
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
   * 2. accent code mapped through DIALECT_MAP
   * 3. Default to MSA (1)
   */
  private resolveDialectId(dialectId?: number, accent?: string): number {
    // Explicit dialect ID takes precedence
    if (typeof dialectId === 'number' && dialectId > 0) {
      return dialectId;
    }

    // Map accent to dialect
    if (accent) {
      const accentLower = accent.toLowerCase();
      if (DIALECT_MAP[accentLower]) {
        return DIALECT_MAP[accentLower];
      }
    }

    // Default to MSA
    return 1;
  }

  /**
   * Resolves performance_id from voiceTone/style
   */
  private resolvePerformanceId(style?: string): number {
    if (!style) return DEFAULT_PERFORMANCE_ID;

    const styleLower = style.toLowerCase();
    return PERFORMANCE_MAP[styleLower] || DEFAULT_PERFORMANCE_ID;
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, accent, dialectId } = params;
    const { apiKey } = credentials;

    const resolvedDialectId = this.resolveDialectId(
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
    console.log(`  Performance ID: ${resolvedPerformanceId}`);

    const requestBody = {
      text: text as string,
      id_voice: voiceId as string,
      input_mode: "0",  // Structured mode with performance_id and dialect_id
      performance_id: String(resolvedPerformanceId),
      dialect_id: String(resolvedDialectId),
    };

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
