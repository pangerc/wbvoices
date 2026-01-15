import type { VoiceVersion, MusicVersion, SfxVersion } from "@/types/versions";

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
    dialectId?: number; // Lahajati Arabic dialect ID
    performanceId?: number; // Lahajati performance style ID
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

export interface ReadAdStateParams {
  adId: string;
}

export interface SetAdTitleParams {
  adId: string;
  title: string;
}

export interface SetAdTitleResult {
  success: boolean;
  title: string;
}

// Lightweight summary of voices used in a version (for history tracking)
export interface VoiceHistorySummary {
  versionId: string;
  voiceIds: string[];
  voiceNames: string[];
  requestText: string | null;
}

// ReadAdStateResult returns FULL Redis data - no summaries, no lossy abstraction
// The LLM sees exactly what's in Redis so it can make informed decisions
export interface ReadAdStateResult {
  /** Full voice version data if exists */
  voices?: VoiceVersion & { versionId: string };
  /** History of voices used in previous versions (to avoid duplicates) */
  voiceHistory?: VoiceHistorySummary[];
  /** Full music version data if exists */
  music?: MusicVersion & { versionId: string };
  /** Full SFX version data if exists */
  sfx?: SfxVersion & { versionId: string };
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
