// Core tool call types (OpenAI-compatible)
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string; // JSON string
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Tool implementation parameter types
export interface SearchVoicesParams {
  provider: "elevenlabs" | "openai" | "lovo";
  language: string;
  gender?: "male" | "female";
  accent?: string;
  count?: number;
}

export interface CreateVoiceDraftParams {
  adId: string;
  tracks: Array<{
    voiceId: string;
    text: string;
    playAfter?: string;
    overlap?: number;
    description?: string; // ElevenLabs baseline tone
    voiceInstructions?: string; // OpenAI voice guidance
  }>;
}

export interface CreateMusicDraftParams {
  adId: string;
  prompt: string;
  elevenlabs?: string; // Detailed instrumental (no artist names)
  loudly?: string; // Detailed with artist references
  mubert?: string; // 8-12 word vibe storytelling
  provider?: "loudly" | "mubert" | "elevenlabs";
  duration?: number;
}

export interface CreateSfxDraftParams {
  adId: string;
  prompts: Array<{
    description: string;
    placement?: { type: string; index?: number };
    duration?: number;
  }>;
}

export interface GetCurrentStateParams {
  adId: string;
}

// Tool result types
export interface SearchVoicesResult {
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
    accent?: string;
    style?: string;
  }>;
  count: number;
}

export interface DraftCreationResult {
  versionId: string;
  status: "draft";
}

export interface CurrentStateResult {
  voices?: {
    versionId: string;
    summary: string;
    /** Actual track data so LLM can preserve existing content during iterations */
    tracks?: Array<{
      index: number;
      voiceId?: string;
      voiceName?: string;
      text: string;
      voiceInstructions?: string;
    }>;
  };
  music?: {
    versionId: string;
    summary: string;
    /** Full prompts so LLM can preserve during iterations */
    prompt?: string;
    provider?: string;
  };
  sfx?: {
    versionId: string;
    summary: string;
    /** Full SFX descriptions so LLM can preserve during iterations */
    prompts?: Array<{
      index: number;
      description: string;
      placement?: { type: string; index?: number };
    }>;
  };
}
