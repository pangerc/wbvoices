import { BaseAudioProvider, ValidationResult, AuthCredentials, ProviderResponse } from './BaseAudioProvider';
import { uploadVoiceToBlob } from '@/utils/blob-storage';
import { NextResponse } from 'next/server';

export class OpenAIVoiceProvider extends BaseAudioProvider {
  readonly providerName = 'openai';
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
    const { text, voiceId, style, useCase, instructions: voiceInstructions } = params;
    const { apiKey } = credentials;

    console.log(`🎭 OpenAI API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || 'none'}`);
    console.log(`  Use Case: ${useCase || 'none'}`);
    console.log(`  Voice Instructions: ${voiceInstructions || 'none'}`);
    
    // Extract base voice from our ID format
    const openAIVoice = (voiceId as string).split('-')[0];
    
    // Build voice instructions (separate from text input)
    let instructions = '';
    
    // Use provided voice instructions if available (from LLM)
    if (voiceInstructions && typeof voiceInstructions === 'string') {
      instructions = voiceInstructions;
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
      speed: 1.0,
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
      const errorText = await this.handleApiError(response);
      return {
        success: false,
        error: errorText
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