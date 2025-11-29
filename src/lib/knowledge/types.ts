/**
 * Knowledge Module System Types
 *
 * Modular knowledge architecture for V3 agentic generation.
 * Enables both full generation and atomic edits with appropriate context.
 */

export interface KnowledgeModule {
  id: string;
  name: string;
  keywords: string[]; // For intent detection
  getContent(context?: KnowledgeContext): string;
}

export interface KnowledgeContext {
  pacing?: "normal" | "fast";
  accent?: string;
  region?: string;
  language?: string;
  voiceProvider?: string;
  campaignFormat?: "dialog" | "ad_read";
}

export type IntentType =
  | "initial_generation" // Full knowledge
  | "voice_edit" // Voice modules only
  | "music_edit" // Music module only
  | "sfx_edit" // SFX module only
  | "multi_stream_edit"; // Multiple streams affected

export interface IntentScores {
  voice_edit: number;
  music_edit: number;
  sfx_edit: number;
}
