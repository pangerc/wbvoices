/**
 * Dynamic Prompt Assembly
 *
 * Assembles system prompts from knowledge modules based on detected intent.
 */

import { IntentType, KnowledgeContext } from "./types";
import { detectIntent } from "./selector";
import { elevenlabsVoiceModule } from "./modules/elevenlabs-voice";
import { openaiVoiceModule } from "./modules/openai-voice";
import { simpleVoiceModule } from "./modules/simple-voice";
import { musicGenerationModule } from "./modules/music-generation";
import { sfxGenerationModule } from "./modules/sfx-generation";
import { creativeAlignmentModule } from "./modules/creative-alignment";
import type { VoicePrefetchResult, PrefetchedVoice } from "@/lib/tool-calling/voicePrefetch";

/**
 * Module registry - maps module IDs to implementations
 */
const MODULE_REGISTRY = {
  "elevenlabs-voice": elevenlabsVoiceModule,
  "openai-voice": openaiVoiceModule,
  "simple-voice": simpleVoiceModule,
  "music-generation": musicGenerationModule,
  "sfx-generation": sfxGenerationModule,
  "creative-alignment": creativeAlignmentModule,
};

/**
 * Get voice module(s) based on selected voice provider
 * Only includes the relevant voice module to avoid confusing the LLM
 */
function getVoiceModulesForProvider(
  provider?: string
): (keyof typeof MODULE_REGISTRY)[] {
  switch (provider) {
    case "elevenlabs":
    case "any": // Default to ElevenLabs format when no specific provider
      return ["elevenlabs-voice"];
    case "openai":
      return ["openai-voice"];
    case "qwen":
    case "lovo":
    case "bytedance":
      return ["simple-voice"];
    default:
      // Unknown provider - fallback to ElevenLabs
      return ["elevenlabs-voice"];
  }
}

/**
 * Which modules to include for each intent type
 */
const MODULE_MAPPING: Record<IntentType, (keyof typeof MODULE_REGISTRY)[]> = {
  initial_generation: [
    "elevenlabs-voice",
    "openai-voice",
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ],
  voice_edit: ["elevenlabs-voice", "openai-voice", "creative-alignment"],
  music_edit: ["music-generation", "creative-alignment"],
  sfx_edit: ["sfx-generation"],
  multi_stream_edit: [
    "elevenlabs-voice",
    "openai-voice",
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ],
};

/**
 * Format prefetched voices as context for the system prompt
 * Injected ONLY for initial_generation intent to eliminate search_voices round-trip
 */
function formatVoiceContext(
  voices: VoicePrefetchResult,
  format: "dialog" | "ad_read"
): string {
  const { maleVoices, femaleVoices, totalCount } = voices;

  // Limit to top 8 per gender to keep context manageable (~800-1200 tokens)
  const topMales = maleVoices.slice(0, 8);
  const topFemales = femaleVoices.slice(0, 8);

  const formatVoice = (v: PrefetchedVoice) => {
    let entry = `- **${v.name}** (id: \`${v.id}\`, ${v.gender}, accent: ${v.accent})`;
    if (v.personality) {
      entry += `\n  Personality: ${v.personality}`;
    }
    return entry;
  };

  let context = `## AVAILABLE VOICES (${totalCount} total, pre-filtered for this brief)

**CRITICAL**: You MUST use voices from this list. Do NOT call search_voices - these voices are pre-selected for your language and provider.

### Male Voices (${topMales.length} shown)
${topMales.length > 0 ? topMales.map(formatVoice).join("\n") : "None available"}

### Female Voices (${topFemales.length} shown)
${topFemales.length > 0 ? topFemales.map(formatVoice).join("\n") : "None available"}
`;

  if (format === "dialog") {
    context += `
### DIALOGUE CASTING
For dialogue format, select TWO DIFFERENT voices - typically one male and one female.
Match voice personalities to the characters in your creative concept.`;
  } else {
    context += `
### SINGLE VOICE CASTING
Select ONE voice that best matches the brand personality and target audience.`;
  }

  return context;
}

/**
 * Get format-specific guidance based on campaign format
 * Only injects guidance for the selected format to avoid confusing the LLM
 *
 * @param hasPrefetchedVoices - If true, voices are pre-loaded so don't mention searching
 */
function getFormatGuidance(campaignFormat?: string, hasPrefetchedVoices?: boolean): string {
  if (campaignFormat === "dialog") {
    const searchNote = hasPrefetchedVoices
      ? "Select one voice from the Male Voices section and one from Female Voices above."
      : "Search for voices by gender to find suitable male and female voices.";

    return `## FORMAT: DIALOGUE
Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.
${searchNote}`;
  }
  return `## FORMAT: SINGLE VOICE
Create a single-voice narration that directly addresses the listener.
The voice should maintain consistent tone throughout.
Select ONE voice that best matches the brand personality.`;
}

/**
 * Base system prompt - common across all intents
 *
 * @param hasPrefetchedVoices - If true, voices are pre-loaded in the prompt (initial generation)
 */
function getBaseSystemPrompt(context?: KnowledgeContext, hasPrefetchedVoices?: boolean): string {
  const formatGuidance = getFormatGuidance(context?.campaignFormat, hasPrefetchedVoices);

  // Different process instructions based on whether voices are prefetched
  const processInstructions = hasPrefetchedVoices
    ? `## Your Process - FOLLOW EXACTLY

1. Review the AVAILABLE VOICES section above - voices are pre-loaded for you
2. Select appropriate voices and call create_voice_draft
   - For dialogue: pick TWO different voices (male + female)
   - For single voice: pick ONE voice that fits the brief
3. After voice draft, call create_music_draft
4. After music draft, call create_sfx_draft with 1-2 sound effects
5. STOP - do not make any more tool calls`
    : `## Your Process - FOLLOW EXACTLY

1. Search for voices using search_voices (language required, gender optional)
   - For dialogue: search twice - once for male, once for female
2. Once you have suitable voices, call create_voice_draft
3. After voice draft, call create_music_draft
4. After music draft, call create_sfx_draft with 1-2 sound effects
5. STOP - do not make any more tool calls`;

  return `You are an expert audio ad creative director specializing in creating compelling radio and podcast advertisements.

Your job is to create or modify audio ad elements using the tools available to you.

## Available Tools

1. **search_voices** - Search the voice database by language, gender, accent, or style
2. **create_voice_draft** - Create voice tracks with script text for each voice
3. **create_music_draft** - Create background music with a descriptive prompt
4. **create_sfx_draft** - Create sound effects with placement and description
5. **get_current_state** - Get the current state of the ad (brief, active versions)

${formatGuidance}

${processInstructions}

## CRITICAL RULES
- ONLY search for voices from the provider specified in the user brief (Voice Provider field)
- Do NOT use voices from other providers even if you know them
- get_current_state is useful for understanding the current ad state before making changes
- Do NOT keep searching for "better" voices endlessly - make a decision and proceed
- Do NOT call the same tool twice in a row

## Voice Casting Guidelines

- READ THE CREATIVE BRIEF to understand the story being told
- Match voice genders to the scenario described in the brief
- Follow the FORMAT guidance above for voice selection

## Script Guidelines

- Write scripts in the target language (NOT English unless specified)
- Keep total speaking time within the duration limit
- Create natural-sounding dialogue, not robotic ad copy
- Use local idioms and expressions for authenticity

## Production Guidelines

- Always create voices, music, AND sound effects
- Include 1-2 sound effects per ad - even simple ones like "fizz", "crowd", or "door opening" add production value

## IMPORTANT

- Do NOT return JSON - use the tools to create drafts
- Be conversational in your responses
- Follow the provider-specific guidance below for voice formatting

## TOOL CALLING PREAMBLE

Before calling any tool, briefly explain your reasoning (1 sentence). Example:
"I'll create the voice draft with these two speakers matching the dialogue format." → [calls create_voice_draft]
This helps with debugging and ensures you're making deliberate choices.`;
}

/**
 * Build system prompt with relevant knowledge modules
 * For initial generation, dynamically selects voice module based on voiceProvider
 * Optionally accepts prefetched voices to eliminate search_voices round-trip
 */
export function buildSystemPrompt(
  userMessage: string,
  context?: KnowledgeContext,
  prefetchedVoices?: VoicePrefetchResult
): string {
  const intent = detectIntent(userMessage);

  // For initial generation, use dynamic voice module selection
  // This ensures we only show the relevant voice formatting guidance
  let moduleIds: (keyof typeof MODULE_REGISTRY)[];
  if (intent === "initial_generation" || intent === "multi_stream_edit") {
    const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
    moduleIds = [
      ...voiceModules,
      "music-generation",
      "sfx-generation",
      "creative-alignment",
    ];
  } else if (intent === "voice_edit") {
    // For voice edits, also use dynamic selection
    const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
    moduleIds = [...voiceModules, "creative-alignment"];
  } else {
    // For music/sfx only edits, use static mapping
    moduleIds = MODULE_MAPPING[intent];
  }

  // Determine if we have prefetched voices for this intent
  const hasPrefetchedVoices =
    prefetchedVoices &&
    prefetchedVoices.totalCount > 0 &&
    intent === "initial_generation";

  const basePrompt = getBaseSystemPrompt(context, hasPrefetchedVoices);
  const moduleContent = moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");

  // Inject voice context for initial generation when prefetched voices are provided
  let voiceContext = "";
  if (hasPrefetchedVoices) {
    voiceContext = formatVoiceContext(
      prefetchedVoices!,
      context?.campaignFormat || "ad_read"
    );
  }

  // Structure: base prompt → voice context (if any) → module content
  if (voiceContext) {
    return `${basePrompt}\n\n${voiceContext}\n\n---\n\n${moduleContent}`;
  }
  return `${basePrompt}\n\n---\n\n${moduleContent}`;
}

/**
 * Build system prompt for iteration/conversation continuation
 *
 * Unlike initial generation, iterations:
 * - Do NOT have prefetched voices (stale data issue)
 * - CAN call search_voices to find new voices
 * - Focus on modifying specific streams (voice/music/sfx)
 */
export function buildIterationSystemPrompt(context?: KnowledgeContext): string {
  // Get all voice modules to support any provider
  const moduleIds: (keyof typeof MODULE_REGISTRY)[] = [
    "elevenlabs-voice",
    "openai-voice",
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ];

  // No prefetched voices - LLM should search if needed
  const basePrompt = getBaseSystemPrompt(context, false);
  const moduleContent = moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}

## ITERATION MODE

You are continuing an existing conversation about an ad. The user wants to make changes.

**Key differences from initial generation:**
- Use get_current_state to understand what already exists
- Use search_voices if you need to find new voices (they are NOT pre-loaded)
- Only create drafts for the streams the user wants to change
- Preserve existing work unless explicitly asked to change it

${moduleContent}`;
}

/**
 * Build system prompt with explicit intent (for testing or override)
 */
export function buildSystemPromptWithIntent(
  intent: IntentType,
  context?: KnowledgeContext
): string {
  const moduleIds = MODULE_MAPPING[intent];

  const basePrompt = getBaseSystemPrompt(context);
  const moduleContent = moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}\n\n---\n\n${moduleContent}`;
}

/**
 * Get just the module content (without base prompt) for a specific intent
 * Useful for appending to existing prompts
 */
export function getModuleContent(
  intent: IntentType,
  context?: KnowledgeContext
): string {
  const moduleIds = MODULE_MAPPING[intent];

  return moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");
}

/**
 * Get module content for specific modules by ID
 */
export function getModulesById(
  moduleIds: (keyof typeof MODULE_REGISTRY)[],
  context?: KnowledgeContext
): string {
  return moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");
}
