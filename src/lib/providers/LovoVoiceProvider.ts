import {
  BaseAudioProvider,
  ValidationResult,
  AuthCredentials,
  ProviderResponse,
} from "./BaseAudioProvider";
import { uploadVoiceToBlob } from "@/utils/blob-storage";
import { NextResponse } from "next/server";

export class LovoVoiceProvider extends BaseAudioProvider {
  readonly providerName = "lovo";
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
    const apiKey = process.env.LOVO_API_KEY;
    return !!apiKey;
  }

  async authenticate(): Promise<AuthCredentials> {
    const apiKey = process.env.LOVO_API_KEY;

    if (!apiKey) {
      throw new Error("Lovo API key is missing");
    }

    return { apiKey };
  }

  /**
   * Map LLM emotional styles to Lovo's style system
   */
  private mapStyleToLovoStyle(llmStyle: string): string | null {
    const styleMap: Record<string, string> = {
      // Common emotional styles
      cheerful: "cheerful",
      happy: "cheerful",
      excited: "excited",
      energetic: "excited",
      serious: "serious",
      professional: "serious",
      authoritative: "serious",
      calm: "calm",
      gentle: "calm",
      soothing: "calm",
      warm: "warm",
      friendly: "warm",
      confident: "confident",
      whisper: "whisper",
      whispering: "whisper",
      sad: "sad",
      angry: "angry",
      fearful: "fearful",
      surprised: "surprised",
      disgusted: "disgusted",
      // Default fallback
      default: "default",
      neutral: "default",
    };

    const normalizedStyle = llmStyle.toLowerCase().trim();
    return styleMap[normalizedStyle] || null;
  }

  async makeRequest(
    params: Record<string, unknown>,
    credentials: AuthCredentials
  ): Promise<ProviderResponse> {
    const { text, voiceId, style, useCase } = params;
    const { apiKey } = credentials;

    console.log(`🎭 Lovo API Call:`);
    console.log(`  Text: "${(text as string).substring(0, 50)}..."`);
    console.log(`  Voice ID: ${voiceId}`);
    console.log(`  Style: ${style || "none"}`);
    console.log(`  Use Case: ${useCase || "none"}`);

    // Split composite voiceId back to speaker/style components
    // Expected format from list endpoint: "<speakerId>|<styleId>"
    const [speakerId, speakerStyleId] = String(voiceId).split("|");

    // Build request body with optional style
    const requestBody: {
      speed: number;
      text: string;
      speaker: string;
      speakerStyle?: string;
    } = {
      speed: 1,
      text: text as string,
      speaker: speakerId,
    };

    // Map LLM style to Lovo style if provided
    // Prefer exact speakerStyle from the composite ID when available
    if (speakerStyleId) {
      requestBody.speakerStyle = speakerStyleId;
      console.log(`  🎛️ Using exact Lovo speakerStyle id: ${speakerStyleId}`);
    } else if (style) {
      // Fallback: map LLM label -> Lovo style name (older data)
      const lovoStyle = this.mapStyleToLovoStyle(style as string);
      if (lovoStyle) {
        requestBody.speakerStyle = lovoStyle; // some speakers accept style names
        console.log(
          `  🎛️ Mapped style "${style}" to Lovo style "${lovoStyle}"`
        );
      }
    }

    console.log(
      `  📡 Lovo request body:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = await this.makeFetch(
      // Use sync endpoint for reliability in our UX
      "https://api.genny.lovo.ai/api/v1/tts/sync",
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey as string,
          accept: "application/json",
          "content-type": "application/json",
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

    const responseData = await response.json();
    // Sync may return completed audio or a pending job (90s timeout behavior)
    let audioArrayBuffer: ArrayBuffer | null = null;
    let url: string | undefined = responseData?.data?.[0]?.urls?.[0];

    if (responseData?.data?.[0]?.status === "succeeded" && url) {
      const audioRes = await this.makeFetch(url, { method: "GET" });
      if (!audioRes.ok) {
        return {
          success: false,
          error: "Failed to fetch audio file from Lovo URL",
        };
      }
      audioArrayBuffer = await audioRes.arrayBuffer();
    } else {
      const jobId: string | undefined =
        responseData?.id || responseData?.data?.[0]?.id;
      if (!jobId) {
        return {
          success: false,
          error: "No audio URL or job id in Lovo response",
        };
      }
      // Short polling fallback
      const maxAttempts = 10;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusRes = await this.makeFetch(
          `https://api.genny.lovo.ai/api/v1/tts/${jobId}`,
          {
            method: "GET",
            headers: {
              "X-API-KEY": apiKey as string,
              accept: "application/json",
            },
          }
        );
        if (!statusRes.ok) break;
        const statusJson = await statusRes.json();
        const status = statusJson?.status || statusJson?.data?.[0]?.status;
        url = statusJson?.urls?.[0] || statusJson?.data?.[0]?.urls?.[0];
        if (status === "succeeded" && url) {
          const audioRes = await this.makeFetch(url, { method: "GET" });
          if (audioRes.ok) {
            audioArrayBuffer = await audioRes.arrayBuffer();
            break;
          }
        }
        await wait(1000);
      }

      if (!audioArrayBuffer) {
        return { success: false, error: "Timed out waiting for Lovo sync job" };
      }
    }

    return {
      success: true,
      data: {
        audioArrayBuffer,
        text: text as string,
        voiceId: voiceId as string,
        style: params.style as string,
        useCase: params.useCase as string,
        originalLovoUrl: undefined,
      },
    };
  }

  public async processSuccessfulResponse(
    data: Record<string, unknown>
  ): Promise<NextResponse> {
    const {
      audioArrayBuffer,
      text,
      voiceId,
      style,
      useCase,
      projectId,
      originalLovoUrl,
    } = data;

    try {
      console.log("Lovo: Uploading voice to Vercel Blob...");

      const audioBlob = new Blob([audioArrayBuffer as ArrayBuffer], {
        type: "audio/mpeg",
      });
      const blobResult = await uploadVoiceToBlob(
        audioBlob,
        (text as string).substring(0, 50),
        "lovo",
        projectId as string
      );

      console.log(`Lovo voice uploaded to blob: ${blobResult.url}`);

      return NextResponse.json({
        audio_url: blobResult.url,
        original_text: text,
        voice_id: voiceId,
        provider: this.providerName,
        style: style,
        use_case: useCase,
        original_lovo_url: originalLovoUrl, // Keep track of original Lovo URL
        blob_info: {
          downloadUrl: blobResult.downloadUrl,
          size: (audioArrayBuffer as ArrayBuffer).byteLength,
        },
      });
    } catch (blobError) {
      console.error("Lovo: Failed to upload voice to blob:", blobError);

      // Fallback: return raw audio (this shouldn't happen in practice)
      return new NextResponse(audioArrayBuffer as ArrayBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
        },
      });
    }
  }
}
