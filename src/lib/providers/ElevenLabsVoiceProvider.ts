import {
  BaseAudioProvider,
  ValidationResult,
  AuthCredentials,
  ProviderResponse,
} from "./BaseAudioProvider";
import { uploadVoiceToBlob } from "@/utils/blob-storage";
import { NextResponse } from "next/server";

export class ElevenLabsVoiceProvider extends BaseAudioProvider {
  readonly providerName = "elevenlabs";
  readonly providerType = "voice" as const;

  validateParams(body: Record<string, unknown>): ValidationResult {
    const { text, voiceId, style, useCase, projectId } = body;

    if (!text || typeof text !== "string") {
      return {
        isValid: false,
        error: "Missing required parameter: text",
      };
    }

    if (!voiceId || typeof voiceId !== "string") {
      return {
        isValid: false,
        error: "Missing required parameter: voiceId",
      };
    }

    return {
      isValid: true,
      data: {
        text,
        voiceId,
        style: typeof style === "string" ? style : undefined,
        useCase: typeof useCase === "string" ? useCase : undefined,
        projectId: typeof projectId === "string" ? projectId : undefined,
      },
    };
  }

  protected validateCredentials(): boolean {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error("ElevenLabs API key is missing");
    }

    return { apiKey };
  }

  async makeRequest(
    params: Record<string, unknown>,
    credentials: AuthCredentials
  ): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase } = params;
    const { apiKey } = credentials;

    console.log(`🎭 ElevenLabs API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || "none"}`);
    console.log(`  Use Case: ${useCase || "none"}`);

    // Build voice settings based on emotional dimensions
    // ElevenLabs accepts: stability, similarity_boost, style (0-1), speed (double), use_speaker_boost (boolean)
    type Settings = {
      stability: number;
      similarity_boost: number;
      style: number;
      speed: number;
      use_speaker_boost: boolean;
    };

    const normalizeLabel = (label?: unknown): string => {
      if (!label || typeof label !== "string") return "neutral";
      return label
        .toLowerCase()
        .replace(/[^a-z_\s-]/g, "")
        .replace(/\s+/g, "_");
    };

    const label = normalizeLabel(style);

    // Compact preset table to translate qualitative labels into numeric controls
    const PRESETS: Record<string, Settings> = {
      // upbeat and bright
      cheerful: {
        stability: 0.3,
        similarity_boost: 0.85,
        style: 0.5,
        speed: 1.08,
        use_speaker_boost: false,
      },
      happy: {
        stability: 0.3,
        similarity_boost: 0.85,
        style: 0.5,
        speed: 1.08,
        use_speaker_boost: false,
      },
      excited: {
        stability: 0.28,
        similarity_boost: 0.85,
        style: 0.55,
        speed: 1.1,
        use_speaker_boost: false,
      },

      // high energy promo reads
      energetic: {
        stability: 0.25,
        similarity_boost: 0.85,
        style: 0.6,
        speed: 1.12,
        use_speaker_boost: false,
      },
      dynamic: {
        stability: 0.25,
        similarity_boost: 0.85,
        style: 0.6,
        speed: 1.12,
        use_speaker_boost: false,
      },

      // calm and intimate
      calm: {
        stability: 0.85,
        similarity_boost: 0.65,
        style: 0.15,
        speed: 0.96,
        use_speaker_boost: false,
      },
      gentle: {
        stability: 0.85,
        similarity_boost: 0.65,
        style: 0.15,
        speed: 0.96,
        use_speaker_boost: false,
      },
      soothing: {
        stability: 0.88,
        similarity_boost: 0.65,
        style: 0.12,
        speed: 0.95,
        use_speaker_boost: false,
      },

      // credible, brand-safe
      serious: {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0.2,
        speed: 0.99,
        use_speaker_boost: true,
      },
      professional: {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0.2,
        speed: 0.99,
        use_speaker_boost: true,
      },
      authoritative: {
        stability: 0.78,
        similarity_boost: 0.78,
        style: 0.22,
        speed: 0.98,
        use_speaker_boost: true,
      },

      // warm human read
      empathetic: {
        stability: 0.55,
        similarity_boost: 0.8,
        style: 0.4,
        speed: 1.0,
        use_speaker_boost: false,
      },
      warm: {
        stability: 0.55,
        similarity_boost: 0.8,
        style: 0.4,
        speed: 1.0,
        use_speaker_boost: false,
      },

      // pacing controls
      fast_read: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.35,
        speed: 1.15,
        use_speaker_boost: false,
      },
      slow_read: {
        stability: 0.75,
        similarity_boost: 0.7,
        style: 0.2,
        speed: 0.9,
        use_speaker_boost: false,
      },

      // default/neutral
      neutral: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        speed: 1.0,
        use_speaker_boost: false,
      },
      default: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        speed: 1.0,
        use_speaker_boost: false,
      },
    };

    const settings: Settings = PRESETS[label] || PRESETS["neutral"];

    const voiceSettings: Settings = {
      stability: settings.stability,
      similarity_boost: settings.similarity_boost,
      style: settings.style,
      speed: settings.speed,
      use_speaker_boost: settings.use_speaker_boost,
    };

    console.log(
      `  🎛️ Applied voice settings for "${style || "neutral"}":` +
        ` stability=${voiceSettings.stability},` +
        ` similarity_boost=${voiceSettings.similarity_boost},` +
        ` style=${voiceSettings.style}, speed=${voiceSettings.speed},` +
        ` use_speaker_boost=${voiceSettings.use_speaker_boost}`
    );

    const requestBody = {
      text: text as string,
      model_id: "eleven_multilingual_v2",
      voice_settings: voiceSettings,
    };

    console.log(
      `  📡 ElevenLabs request body:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = await this.makeFetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey as string,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await this.handleApiError(response);
      return {
        success: false,
        error: errorText,
      };
    }

    const audioArrayBuffer = await response.arrayBuffer();

    return {
      success: true,
      data: {
        audioArrayBuffer,
        text: text as string,
        voiceId: voiceId as string,
        style: params.style as string,
        useCase: params.useCase as string,
      },
    };
  }

  public async processSuccessfulResponse(
    data: Record<string, unknown>
  ): Promise<NextResponse> {
    const { audioArrayBuffer, text, voiceId, style, useCase, projectId } = data;

    try {
      console.log("ElevenLabs: Uploading voice to Vercel Blob...");

      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], {
        type: "audio/mpeg",
      });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        "elevenlabs",
        projectId as string
      );

      console.log(`ElevenLabs voice uploaded to blob: ${blobResult.url}`);

      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        voice_id: voiceId,
        provider: this.providerName,
        style: style,
        use_case: useCase,
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: (audioArrayBuffer as ArrayBuffer).byteLength,
        },
      });
    } catch (blobError) {
      console.error("ElevenLabs: Failed to upload voice to blob:", blobError);

      // Fallback: return raw audio (this shouldn't happen in practice)
      return NextResponse.json(
        { error: "Failed to upload audio to blob storage" },
        { status: 500 }
      );
    }
  }
}
