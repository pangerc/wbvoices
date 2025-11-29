/**
 * ElevenLabs Voice Knowledge Module
 *
 * Extracted from ElevenLabsV3PromptStrategy.buildStyleInstructions()
 * Dual control system: baseline tones + emotional tags
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const elevenlabsVoiceModule: KnowledgeModule = {
  id: "elevenlabs-voice",
  name: "ElevenLabs Voice Guidance",
  keywords: [
    "voice",
    "script",
    "elevenlabs",
    "emotional",
    "tag",
    "laughs",
    "happy",
    "excited",
    "tone",
    "description",
    "baseline",
  ],

  getContent(context?: KnowledgeContext): string {
    const pacing = context?.pacing || "normal";
    const accent = context?.accent;
    const region = context?.region;

    // Build pacing guidance if specified
    let pacingGuidance = "";
    if (pacing === "fast") {
      pacingGuidance = `
PACING REQUIREMENT: FAST-PACED DELIVERY
Create a fast-paced, energetic delivery with urgency and excitement.
RECOMMENDED baseline tones: fast_read, energetic, dynamic, excited
CRITICAL: Use [rapid-fire] tag liberally - it saves 2-4 seconds per ad and creates urgent, quick delivery
Use shorter sentences and action-oriented language.
`;
    }

    let accentGuidance = "";
    if (accent && accent !== "neutral") {
      accentGuidance = `
ACCENT TAG USAGE:
This ad requires a specific accent/region: ${accent}${region ? ` from ${region}` : ""}
- Place accent tag ONCE at the start of each speaker's first line
- Format: [${accent} accent]
- Example: "[${accent} accent][happy]Hola! This is how we speak here."`;
    } else {
      accentGuidance = `
TAG STRUCTURE:
Begin your text directly with emotional and delivery tags.
Example: "[happy][excited]Your text starts here..." or "[laughs][curious]Opening line..."`;
    }

    const tagDensityGuidance =
      pacing === "fast"
        ? `
[rapid-fire] + [fast] TAG BOMBARDMENT MODE (pacing=fast):
Since this ad requires FAST pacing, use [rapid-fire] and [fast] tags aggressively:
- PRIORITIZE [rapid-fire] tag - it saves 2-4 seconds and creates urgent delivery
- Stack [rapid-fire] with [fast] tags for maximum speed effect
- Stack 2-3 [fast] tags together between clauses for urgent, rapid delivery
- Target 5-7 tags total per sentence (including mood tags)
- [rapid-fire] and [fast] tags have MULTIPLICATIVE effect when combined - use them liberally
- Example: "[excited][rapid-fire][fast][fast]Check this out! [rapid-fire][energetic]It's amazing! [fast][fast][happy]Don't wait!"`
        : `
MODERATE TAG MODE (pacing=normal):
Use tags moderately for natural, balanced delivery:
- Use [fast] tags sparingly (1-2 per sentence) only when natural urgency is needed
- Target 2-4 tags total per sentence
- Focus on mood and emotion rather than pace control
- Example: "[laughs][happy]You'll love this! [excited]Our new product is here."`;

    const examples =
      pacing === "fast"
        ? `
EXAMPLES WITH PERSONALITY AWARENESS (fast pacing):

Example 1 - Warm, Friendly voice:
"description": "excited",
"text": "${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[laughs][excited][rapid-fire][fast][fast]You're going to love this! [rapid-fire][happy]Our new product... [very excited]it's AMAZING! [rapid-fire][fast][fast][cheerful]Don't miss out!"

Example 2 - Professional, Authoritative voice:
"description": "professional",
"text": "${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[confident][rapid-fire][fast][fast]Introducing our solution. [rapid-fire][serious]Proven results. [rapid-fire][authoritative]Act now."`
        : `
EXAMPLES WITH PERSONALITY AWARENESS (normal pacing):

Example 1 - Warm, Friendly voice:
"description": "cheerful",
"text": "${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[laughs][happy]You won't believe this! [excited]Our new product is here. [whispers]And the price? [cheerful]Unbeatable."

Example 2 - Professional, Authoritative voice:
"description": "professional",
"text": "${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[confident]Introducing our latest solution. [thoughtful pause]Proven results. [serious]Guaranteed satisfaction."

Example 3 - Calm, Soothing voice:
"description": "calm",
"text": "${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[gentle]Take a moment for yourself... [soft][sighs]You deserve this. [whispers]Pure relaxation."`;

    return `## ElevenLabs V3 Voice Guidance - Dual Emotional Control System
${pacingGuidance}

### BASELINE TONE (description field)
Choose ONE baseline tone to set the overall voice character. This is REQUIRED.
Available tones: cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read

### EMOTIONAL TAGS (inline in text)
Layer emotional moments using inline tags for fine-grained control:

**Emotional/Delivery Directions:**
[happy], [sad], [excited], [angry], [whisper], [annoyed], [appalled], [thoughtful], [surprised], [sarcastic], [curious], [crying], [mischievously], [rapid-fire]

**Non-verbal Sounds:**
[laughing], [chuckles], [sighs], [clears throat], [short pause], [long pause], [exhales sharply], [inhales deeply], [laughs], [laughs harder], [starts laughing], [wheezing], [whispers], [exhales], [snorts]

**Punctuation controls:**
- Ellipses (...) - Creates pauses and thoughtful delivery
- CAPITALIZATION - Adds emphasis to specific words
- Standard punctuation - Provides natural speech rhythm
${tagDensityGuidance}
${accentGuidance}

### VOICE PERSONALITY → TAG MATCHING

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
${examples}

### KEY PRINCIPLES
1. [rapid-fire] is CRITICAL for fast pacing - saves 2-4 seconds
2. Tag density follows pacing: fast=5-7 tags, normal=2-4 tags
3. Only stack [rapid-fire] + [fast] tags when pacing=fast
4. Tags must be in ENGLISH regardless of target language
5. Match tags to voice personality - respect the voice's natural character

Character limit: 3,000 characters per voice segment`;
  },
};
