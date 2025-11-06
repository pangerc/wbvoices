import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { Voice, CampaignFormat } from "@/types";

/**
 * ElevenLabs V3 Strategy - Combines baseline tone presets with emotional tags
 *
 * Dual control system:
 * 1. Baseline tone (description field) - sets voice character via presets
 * 2. Emotional tags (inline in text) - adds punctuated moments
 *
 * V3 model combines both for rich, expressive delivery
 */
export class ElevenLabsV3PromptStrategy extends BasePromptStrategy {
  readonly provider = "elevenlabs" as const;

  buildStyleInstructions(context: PromptContext): string {
    const { pacing } = context;

    // Build pacing guidance if specified
    let pacingGuidance = "";
    if (pacing === "fast") {
      pacingGuidance = `
🐰 PACING REQUIREMENT: FAST-PACED DELIVERY
Create a fast-paced, energetic delivery with urgency and excitement.
RECOMMENDED baseline tones: fast_read, energetic, dynamic, excited
CRITICAL: Use [rapid-fire] tag liberally - it saves 2-4 seconds per ad and creates urgent, quick delivery
Use shorter sentences and action-oriented language.
The voice should feel urgent and compelling.
`;
    }

    return `ElevenLabs V3 Model - Dual Emotional Control System:
${pacingGuidance ? pacingGuidance : ""}

BASELINE TONE (description field):
Choose ONE baseline tone to set the overall voice character:
cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read

Include this as "description" field (REQUIRED) - this provides consistent voice character throughout.

EMOTIONAL TAGS (inline in text):
Layer emotional moments using inline tags for fine-grained control:

Available audio tags (use these as a guide - you can infer similar, contextually appropriate tags):

**Emotional/Delivery Directions:**
[happy], [sad], [excited], [angry], [whisper], [annoyed], [appalled], [thoughtful], [surprised], [sarcastic], [curious], [crying], [mischievously], [rapid-fire]

**Non-verbal Sounds:**
[laughing], [chuckles], [sighs], [clears throat], [short pause], [long pause], [exhales sharply], [inhales deeply], [laughs], [laughs harder], [starts laughing], [wheezing], [whispers], [exhales], [snorts]

**Note:** You can create similar emotional/delivery directions and non-verbal sounds as needed for the context.

Punctuation controls:
- Ellipses (...) - Creates pauses and thoughtful delivery
- CAPITALIZATION - Adds emphasis to specific words
- Standard punctuation - Provides natural speech rhythm

TAG USAGE STRATEGY - CONTEXT-AWARE APPROACH:

ElevenLabs V3 benefits from thoughtful tag usage. The density and types of tags should match your creative intent.

${
      pacing === "fast"
        ? `
🚀 [rapid-fire] + [fast] TAG BOMBARDMENT MODE (pacing=fast):
Since this ad requires FAST pacing, use [rapid-fire] and [fast] tags aggressively:
- PRIORITIZE [rapid-fire] tag - it saves 2-4 seconds and creates urgent delivery
- Stack [rapid-fire] with [fast] tags for maximum speed effect
- Stack 2-3 [fast] tags together between clauses for urgent, rapid delivery
- Target 5-7 tags total per sentence (including mood tags)
- [rapid-fire] and [fast] tags have MULTIPLICATIVE effect when combined - use them liberally
- Example: "[excited][rapid-fire][fast][fast]Check this out! [rapid-fire][energetic]It's amazing! [fast][fast][happy]Don't wait!"`
        : `
⚖️ MODERATE TAG MODE (pacing=normal):
Use tags moderately for natural, balanced delivery:
- Use [fast] tags sparingly (1-2 per sentence) only when natural urgency is needed
- Target 2-4 tags total per sentence
- Focus on mood and emotion rather than pace control
- Example: "[laughs][happy]You'll love this! [excited]Our new product is here."`
    }

${
      (context.accent && context.accent !== "neutral") || context.region
        ? `
ACCENT TAG USAGE:
This ad requires a specific accent/region: ${context.accent || ""}${context.region ? ` from ${context.region}` : ""}
- Place accent tag ONCE at the start of each speaker's first line
- Format: [${context.accent || "regional"} accent]
- Example: "[${context.accent || "regional"} accent][happy]Hola! This is how we speak here."`
        : `
TAG STRUCTURE:
Begin your text directly with emotional and delivery tags.
Example: "[happy][excited]Your text starts here..." or "[laughs][curious]Opening line..."`
    }

TAG STACKING BEHAVIOR:
- [rapid-fire] tag: USE LIBERALLY for fast pacing - saves 2-4 seconds per ad. Combine with [fast] for maximum effect.
- [fast] tags: Only stack when pacing=fast. Use 2-3 together for multiplicative effect.
- Mood tags ([excited], [happy], [joyful]): Diminishing returns after 2. Use sparingly.

General tag placement guidelines:
- Match tags to voice personality (serious voice shouldn't use [giggles])

📋 VOICE PERSONALITY → EMOTIONAL TAG MATCHING:

Review each voice's "Personality" field before selecting tags. Choose tags that align with their natural delivery style:

**Warm, Friendly, Approachable voices:**
✅ Use: [happy], [laughs], [chuckles], [cheerful], [excited]
❌ Avoid: [serious], [cold], [monotone], [stern]

**Professional, Authoritative, Serious voices:**
✅ Use: [confident], [serious], [thoughtful pause], [authoritative]
❌ Avoid: [giggles], [silly], [wheezing], [mischievously]

**Playful, Energetic, Dynamic voices:**
✅ Use: [excited], [laughing], [happy], [mischievously], [very excited]
❌ Avoid: [monotone], [dull], [serious], [whispers]

**Calm, Soothing, Gentle voices:**
✅ Use: [gentle], [whispers], [thoughtful], [soft], [sighs]
❌ Avoid: [shouting], [angry], [excited], [very excited]

**Conversational, Natural, Relatable voices:**
✅ Use: [sighs], [chuckles], [thoughtful], [curious], [laughs]
❌ Avoid: Over-dramatic tags that break natural flow

IMPORTANT: If a voice's personality description includes traits like "calm and composed", do NOT use high-energy tags like [excited] or [shouting]. If it says "energetic and dynamic", do NOT use subdued tags like [whispers] or [gentle]. Always respect the voice's natural character.

- Tags must be in ENGLISH regardless of target language
- More tags = more expressive delivery, but only when contextually appropriate

${
      pacing === "fast"
        ? `🌟 EXAMPLES WITH PERSONALITY AWARENESS (fast pacing):

Example 1 - Warm, Friendly voice (Rachel):
"description": "excited",
"text": "${context.accent && context.accent !== "neutral" ? `[${context.accent} accent]` : ""}[laughs][excited][rapid-fire][fast][fast]You're going to love this! [rapid-fire][happy]Our new product... [very excited]it's AMAZING! [rapid-fire][fast][fast][cheerful]Don't miss out!"

Example 2 - Professional, Authoritative voice (Michael):
"description": "professional",
"text": "${context.accent && context.accent !== "neutral" ? `[${context.accent} accent]` : ""}[confident][rapid-fire][fast][fast]Introducing our solution. [rapid-fire][serious]Proven results. [rapid-fire][authoritative]Act now."`
        : `🌟 EXAMPLES WITH PERSONALITY AWARENESS (normal pacing):

Example 1 - Warm, Friendly voice (Rachel):
"description": "cheerful",
"text": "${context.accent && context.accent !== "neutral" ? `[${context.accent} accent]` : ""}[laughs][happy]You won't believe this! [excited]Our new product is here. [whispers]And the price? [cheerful]Unbeatable."

Example 2 - Professional, Authoritative voice (Michael):
"description": "professional",
"text": "${context.accent && context.accent !== "neutral" ? `[${context.accent} accent]` : ""}[confident]Introducing our latest solution. [thoughtful pause]Proven results. [serious]Guaranteed satisfaction."

Example 3 - Calm, Soothing voice (Sarah):
"description": "calm",
"text": "${context.accent && context.accent !== "neutral" ? `[${context.accent} accent]` : ""}[gentle]Take a moment for yourself... [soft][sighs]You deserve this. [whispers]Pure relaxation."`
    }

KEY PRINCIPLES:
1. [rapid-fire] is CRITICAL for fast pacing - saves 2-4 seconds and creates urgent delivery
2. Tag density follows pacing: fast=5-7 tags (including [rapid-fire]), normal=2-4 tags
3. Only stack [rapid-fire] + [fast] tags when pacing=fast (proven multiplicative effect)
4. Limit mood tags to 2 per emotional beat
5. Tags should enhance, not dominate, the natural delivery

Stability settings (handled automatically via baseline tone):
- Creative (0.0): High expressiveness - cheerful, excited, energetic, fast_read
- Natural (0.5): Balanced delivery - neutral, warm, empathetic (default)
- Robust (1.0): Highly stable - calm, serious, professional

The baseline tone you choose automatically sets the appropriate stability level.

Character limit: 3,000 characters per voice segment (generous for 60s ads)`;
  }

  formatVoiceMetadata(voice: Voice, context: PromptContext): string {
    // Use base implementation which includes gender fix
    let desc = super.formatVoiceMetadata(voice, context);

    // Add style field if present (for Lovo/ElevenLabs)
    if (voice.style && voice.style !== "Default") {
      desc += `\n  Style: ${voice.style}`;
    }

    return desc;
  }

  buildOutputFormat(campaignFormat: CampaignFormat): string {
    const dialogExample =
      campaignFormat === "dialog"
        ? `,
    {
      "type": "voice",
      "speaker": "Different Voice Name (id: different_voice_id)",
      "text": "[thoughtful pause] That's interesting... tell me more.",
      "description": "serious"
    }`
        : "";

    return `IMPORTANT OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a valid JSON object with this structure:
{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice Name (id: exact_voice_id)",
      "text": "[laughs] This is the script with emotional tags inline!",
      "description": "cheerful"
    }${dialogExample}
  ],
  "music": {
    "description": "Base music concept (in English)",
    "loudly": "Full description with band/artist references (in English)",
    "mubert": "Condensed version under 250 chars (in English)",
    "elevenlabs": "Instrumental descriptions only, no artist names (in English)",
    "playAt": "start",
    "fadeIn": 1,
    "fadeOut": 2
  },
  "soundFxPrompts": [
    {
      "description": "Sound effect description (in English)",
      "playAfter": "start",
      "overlap": 0
    }
  ]
}

REMEMBER:
- "description" field sets baseline tone (cheerful, calm, etc.)
- "text" field can include [emotional tags] inline for punctuated moments
- Combine both for rich, expressive delivery
- Music object MUST include all four fields: description, loudly, mubert, elevenlabs`;
  }
}
