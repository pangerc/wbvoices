/**
 * Dynamic Prompt Assembly
 *
 * Unified prompt builder - ONE pattern for initial generation AND iteration.
 * The LLM always: read_ad_state → search if needed → write drafts
 */

import { IntentType, KnowledgeContext } from "./types";
import { detectIntent } from "./selector";
import { elevenlabsVoiceModule } from "./modules/elevenlabs-voice";
import { openaiVoiceModule } from "./modules/openai-voice";
import { simpleVoiceModule } from "./modules/simple-voice";
import { musicGenerationModule } from "./modules/music-generation";
import { sfxGenerationModule } from "./modules/sfx-generation";
import { creativeAlignmentModule } from "./modules/creative-alignment";

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
 * Get format-specific guidance based on campaign format
 */
function getFormatGuidance(campaignFormat?: string): string {
  if (campaignFormat === "dialog") {
    return `## FORMAT: DIALOGUE
Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.
Use search_voices to find suitable male and female voices.`;
  }
  return `## FORMAT: SINGLE VOICE
Create a single-voice narration that directly addresses the listener.
The voice should maintain consistent tone throughout.
Use search_voices to find ONE voice that best matches the brand personality.`;
}

/**
 * Base system prompt - unified for all flows
 *
 * ONE pattern: read_ad_state → search_voices if needed → create drafts
 */
function getBaseSystemPrompt(context?: KnowledgeContext): string {
  const formatGuidance = getFormatGuidance(context?.campaignFormat);

  return `You are an expert audio ad creative director specializing in creating compelling radio and podcast advertisements.

Your job is to create or modify audio ad elements using the tools available to you.

## Available Tools

1. **read_ad_state** - Read the complete current state of the ad from Redis (voices, music, SFX versions)
2. **search_voices** - Search the voice database by provider, language, gender, accent
3. **create_voice_draft** - Create voice tracks with script text for each voice
4. **create_music_draft** - Create background music with a descriptive prompt
5. **create_sfx_draft** - Create sound effects with placement and description
6. **set_ad_title** - Set a catchy creative title for the ad

${formatGuidance}

## Your Process - FOLLOW EXACTLY

1. Call read_ad_state FIRST to see what already exists
2. If you need voices, use search_voices (provider and language required)
   - For dialogue: search twice - once for male, once for female
   - For single voice: search once for the best match
3. Create drafts for the streams you need to change:
   - create_voice_draft for voice tracks
   - create_music_draft for background music
   - create_sfx_draft for sound effects (1-2 per ad)
4. For NEW ads: call set_ad_title with a catchy creative title
5. STOP - do not make any more tool calls

## Ad Title Guidelines

When creating a new ad, call set_ad_title with a catchy 3-5 word title that combines:
- The brand/client name
- The essence of the creative campaign

Good examples:
- "QuickBite Convenient German Delivery"
- "CocaCola Conquista Chicas"
- "What Watt Energy Dialogues"
- "Explore Kuala Lumpur Effortlessly"

Bad examples (too structured, avoid these):
- "IKEA - Spanish - Summer Sale"
- "QuickBite Ad (German)"

## CRITICAL RULES

- ALWAYS call read_ad_state first to understand what exists
- ONLY search for voices from the provider specified in the user brief
- Do NOT keep searching for "better" voices endlessly - make a decision and proceed
- Do NOT call the same tool twice in a row
- ONLY create drafts for streams the user wants to change (preserve existing work)

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

- Always create voices, music, AND sound effects for new ads
- Include 1-2 sound effects per ad - even simple ones like "fizz", "crowd", or "door opening" add production value
- For iterations: only modify what the user asks for

## IMPORTANT

- Do NOT return JSON - use the tools to create drafts
- Be conversational in your responses
- Follow the provider-specific guidance below for voice formatting

## TOOL CALLING PREAMBLE

Before calling any tool, briefly explain your reasoning (1 sentence). Example:
"I'll check the current ad state first to see what exists." → [calls read_ad_state]
"I'll create the voice draft with these two speakers matching the dialogue format." → [calls create_voice_draft]
This helps with debugging and ensures you're making deliberate choices.`;
}

/**
 * Build system prompt with relevant knowledge modules
 * Unified for both initial generation and iteration
 */
export function buildSystemPrompt(
  userMessage: string,
  context?: KnowledgeContext
): string {
  const intent = detectIntent(userMessage);

  // Select voice modules based on provider
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
    const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
    moduleIds = [...voiceModules, "creative-alignment"];
  } else {
    moduleIds = MODULE_MAPPING[intent];
  }

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
 * Build system prompt for iteration/conversation continuation
 * Now uses the same unified pattern as initial generation
 */
export function buildIterationSystemPrompt(context?: KnowledgeContext): string {
  // Get voice modules based on provider
  const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
  const moduleIds: (keyof typeof MODULE_REGISTRY)[] = [
    ...voiceModules,
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ];

  const basePrompt = getBaseSystemPrompt(context);
  const moduleContent = moduleIds
    .map((id) => {
      const module = MODULE_REGISTRY[id];
      return module.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}

## ITERATION MODE

You are continuing an existing conversation about an ad. The user wants to make changes.

**Key behavior:**
- Call read_ad_state first to see what currently exists
- Use search_voices if you need to find new voices
- Only create drafts for the streams the user wants to change
- Preserve existing work unless explicitly asked to change it

**Voice iteration - IMPORTANT:**
When changing voices, check the voiceHistory array in read_ad_state response.
This shows which voices were already tried in previous versions.
AVOID reusing voice IDs from voiceHistory unless the user explicitly asks to go back to a previous voice.
This prevents accidentally reverting to voices the user already rejected.

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
