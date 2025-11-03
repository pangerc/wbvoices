import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { getServerPronunciationRules, injectPronunciationRules } from '@/utils/server-pronunciation-helper';
import { NextResponse } from 'next/server';

export class OpenAIVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'openai';
  readonly providerType = 'voice' as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId, style, useCase, projectId, region, accent, pacing } = body;

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
        useCase: typeof useCase === 'string' ? useCase : undefined,
        projectId: typeof projectId === 'string' ? projectId : undefined,
        region: typeof region === 'string' ? region : undefined,
        accent: typeof accent === 'string' ? accent : undefined,
        pacing: typeof pacing === 'string' ? pacing : undefined
      }
    };
  }

  protected validateCredentials(): boolean {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error("OpenAI API key is missing");
    }

    return { apiKey };
  }

  async makeRequest(params: Record<string, unknown>, credentials: AuthCredentials): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase, instructions: voiceInstructions, region, accent, pacing } = params;
    const { apiKey } = credentials;

    console.log(`🎭 OpenAI API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || 'none'}`);
    console.log(`  Use Case: ${useCase || 'none'}`);
    console.log(`  Voice Instructions: ${voiceInstructions || 'none'}`);
    console.log(`  Region: ${region || 'none'}`);
    console.log(`  Accent: ${accent || 'none'}`);
    console.log(`  Pacing: ${pacing || 'normal (default)'}`);

    // Extract base voice from our ID format
    const openAIVoice = (voiceId as string).split('-')[0];

    // Fetch pronunciation rules from Redis (server-side safe)
    const pronunciationRules = await getServerPronunciationRules();

    // Build voice instructions (separate from text input)
    let instructions = '';

    // Use provided voice instructions if available (from LLM)
    if (voiceInstructions && typeof voiceInstructions === 'string') {
      // Inject pronunciation rules for matched strings in the script
      instructions = injectPronunciationRules(text as string, voiceInstructions, pronunciationRules) || voiceInstructions;
      console.log(`  🎛️ Using LLM voice instructions: "${instructions}"`);
    } else {
      // Fallback: build instructions from style/useCase (for backward compatibility)
      const instructionParts = [];
      
      if (style && style !== 'Default') {
        instructionParts.push(`Speak in a ${(style as string).toLowerCase()} tone`);
      }
      
      if (useCase && useCase !== 'general') {
        if (useCase === 'advertisement') {
          instructionParts.push('Use a promotional, engaging delivery suitable for advertising');
        } else {
          instructionParts.push(`Adapt delivery for ${(useCase as string).toLowerCase()} context`);
        }
      }
      
      if (instructionParts.length > 0) {
        instructions = instructionParts.join('. ') + '.';
        console.log(`  🎛️ Built instructions from style/useCase: "${instructions}"`);
      }
    }

    // Append region/accent information to instructions if available
    const accentInstructionParts = [];
    if (accent && accent !== 'neutral') {
      accentInstructionParts.push(`Speak with a ${accent} accent`);
    }
    if (region && !accent) {
      accentInstructionParts.push(`Use regional pronunciation from ${region}`);
    }
    
    if (accentInstructionParts.length > 0) {
      const accentInstructions = accentInstructionParts.join('. ') + '.';
      if (instructions) {
        instructions += ' ' + accentInstructions;
      } else {
        instructions = accentInstructions;
      }
      console.log(`  🌍 Appended accent instructions: "${accentInstructions}"`);
    }

    // Inject pronunciation rules for matched strings (if not already injected via voiceInstructions)
    if (!voiceInstructions) {
      const withPronunciation = injectPronunciationRules(text as string, instructions || undefined, pronunciationRules);
      if (withPronunciation) {
        instructions = withPronunciation;
      }
    }

    // Map pacing to speed values (tuned based on research feedback)
    let speed = 1.0; // Default: Normal (null/undefined) → 1.0
    if (pacing === 'fast') {
      speed = 1.2; // Fast → 1.2 (reduced from 1.3 - research shows 1.3 was too fast)
    }

    console.log(`  🎛️ Speed setting: ${speed} (pacing: ${pacing || 'normal'})`);

    // Build API request body
    const requestBody: {
      model: string;
      input: string;
      voice: string;
      response_format: string;
      speed: number;
      instructions?: string;
    } = {
      model: "gpt-4o-mini-tts",
      input: text as string,  // Clean text only
      voice: openAIVoice,
      response_format: "mp3",
      speed: speed,
    };

    // Add instructions if we have any
    if (instructions) {
      requestBody.instructions = instructions;
    }
    
    console.log(`  📡 OpenAI request body:`, JSON.stringify(requestBody, null, 2));

    const response = await this.makeFetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorInfo = await this.handleApiError(response);
      return {
        success: false,
        error: errorInfo.message,
        errorDetails: errorInfo.details
      };
    }

    const audioArrayBuffer = await response.arrayBuffer();
    
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

  /**
   * Override makeFetch to ensure no proxy headers leak through to OpenAI
   * This prevents OpenAI from detecting the original request origin (e.g., Hong Kong)
   * when using the proxy architecture
   */
  protected async makeFetch(url: string, options: RequestInit): Promise<Response> {
    // Create completely clean headers - don't inherit any proxy-related headers
    const cleanHeaders = new Headers();

    // Only add the headers we explicitly want for OpenAI
    if (options.headers) {
      const headers = options.headers as HeadersInit;

      if (headers instanceof Headers) {
        // Only copy specific, safe headers
        const authHeader = headers.get('Authorization');
        const contentType = headers.get('Content-Type');

        if (authHeader) cleanHeaders.set('Authorization', authHeader);
        if (contentType) cleanHeaders.set('Content-Type', contentType);
      } else if (typeof headers === 'object' && headers !== null) {
        // Handle object format
        const headerObj = headers as Record<string, string>;

        if (headerObj['Authorization']) {
          cleanHeaders.set('Authorization', headerObj['Authorization']);
        }
        if (headerObj['Content-Type']) {
          cleanHeaders.set('Content-Type', headerObj['Content-Type']);
        }
      }
    }

    // Always set Accept header for JSON responses
    cleanHeaders.set('Accept', 'application/json');

    // Log what headers we're sending (for debugging)
    console.log('🔒 OpenAI request headers (proxy-safe):', {
      Authorization: cleanHeaders.get('Authorization') ? 'Bearer ***' : 'none',
      'Content-Type': cleanHeaders.get('Content-Type'),
      Accept: cleanHeaders.get('Accept'),
      // Log to confirm we're NOT sending proxy headers
      'X-Forwarded-For': 'stripped',
      'X-Real-IP': 'stripped',
      'CF-Connecting-IP': 'stripped'
    });

    // Make the fetch with clean headers only
    const response = await fetch(url, {
      ...options,
      headers: cleanHeaders
    });

    console.log(`${this.providerName} API response status: ${response.status}`);

    return response;
  }

  public async processSuccessfulResponse(data: Record<string, unknown>): Promise<NextResponse> {
    const { audioArrayBuffer, text, voiceId, style, useCase, projectId } = data;

    try {
      console.log("OpenAI: Uploading voice to Vercel Blob...");

      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], { type: 'audio/mpeg' });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        'openai',
        projectId as string
      );

      console.log(`OpenAI voice uploaded to blob: ${blobResult.url}`);

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
      console.error('OpenAI: Failed to upload voice to blob:', blobError);

      // Fallback: return raw audio (this shouldn't happen in practice)
      return NextResponse.json(
        { error: "Failed to upload audio to blob storage" },
        { status: 500 }
      );
    }
  }
}