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
  campaignFormat?:
    | "dialog"
    | "ad_read"
    | "testimonial"
    | "vox_pop"
    | "dramatized_scene"
    | "radio_skit";

  // Stage-3 brief expansion fields. All optional. Threaded from
  // ProjectBrief through buildUserMessage into per-provider modules so
  // they can adapt guidance.
  hasProvidedScript?: boolean;

  // Creative template (AAC-27). When set, the resolved instructions are
  // appended to the base system prompt as a standing per-brief constraint.
  // The id is in the brief; resolution to title + instructions happens
  // server-side in the generation routes so admins can iterate on the
  // wording without forcing a brief rewrite.
  creativeTemplateTitle?: string;
  creativeTemplateInstructions?: string;
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
