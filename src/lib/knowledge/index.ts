/**
 * Knowledge Module System
 *
 * Modular knowledge architecture for V3 agentic generation.
 * Enables both full generation and atomic edits with appropriate context.
 *
 * Usage:
 * ```typescript
 * import { buildSystemPrompt } from "@/lib/knowledge";
 *
 * // Auto-detect intent from user message
 * const systemPrompt = buildSystemPrompt(userMessage, { pacing: "fast" });
 *
 * // Or build with explicit intent
 * const systemPrompt = buildSystemPromptWithIntent("voice_edit", { pacing: "normal" });
 * ```
 */

// Types
export type {
  IntentScores,
  IntentType,
  KnowledgeContext,
  KnowledgeModule,
} from "./types";

// Intent detection
export { describeIntent, detectIntent } from "./selector";

// Prompt building
export {
  buildIterationSystemPrompt,
  buildSystemPrompt,
  buildSystemPromptWithIntent,
  getModuleContent,
  getModulesById,
} from "./builder";

// Individual modules (for direct access if needed)
export { creativeAlignmentModule } from "./modules/creative-alignment";
export { elevenlabsVoiceModule } from "./modules/elevenlabs-voice";
export { musicGenerationModule } from "./modules/music-generation";
export { openaiVoiceModule } from "./modules/openai-voice";
export { sfxGenerationModule } from "./modules/sfx-generation";
