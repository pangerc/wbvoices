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
  language: string;
  gender?: "male" | "female";
  accent?: string;
  style?: string;
  count?: number;
}

export interface CreateVoiceDraftParams {
  adId: string;
  tracks: Array<{
    voiceId: string;
    text: string;
    playAfter?: string;
    overlap?: number;
  }>;
}

export interface CreateMusicDraftParams {
  adId: string;
  prompt: string;
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
  voices?: { versionId: string; summary: string };
  music?: { versionId: string; summary: string };
  sfx?: { versionId: string; summary: string };
}
