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
AVOID slow presets: calm, soothing, gentle, slow_read
Use shorter sentences and action-oriented language.
The voice should feel urgent and compelling.
`;
    } else if (pacing === "slow") {
      pacingGuidance = `
🐢 PACING REQUIREMENT: SLOW-PACED DELIVERY
Create a slow, deliberate delivery with thoughtful pauses and contemplative tone.
RECOMMENDED baseline tones: slow_read, calm, gentle, soothing
AVOID fast presets: energetic, dynamic, excited, fast_read
Use longer sentences with ellipses (...) for natural pauses.
The voice should feel relaxed and unhurried.
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
[happy], [sad], [excited], [angry], [whisper], [annoyed], [appalled], [thoughtful], [surprised], [sarcastic], [curious], [crying], [mischievously]

**Non-verbal Sounds:**
[laughing], [chuckles], [sighs], [clears throat], [short pause], [long pause], [exhales sharply], [inhales deeply], [laughs], [laughs harder], [starts laughing], [wheezing], [whispers], [exhales], [snorts]

**Note:** You can create similar emotional/delivery directions and non-verbal sounds as needed for the context.

Punctuation controls:
- Ellipses (...) - Creates pauses and thoughtful delivery
- CAPITALIZATION - Adds emphasis to specific words
- Standard punctuation - Provides natural speech rhythm

Tag placement guidelines:
- Place tags naturally within text where emotion occurs
- Match tags to voice personality (serious voice shouldn't use [giggles])
- Tags must be in ENGLISH regardless of target language
- Don't overuse - tags should punctuate, not dominate

Example combining baseline + tags:
"description": "cheerful",
"text": "[laughs] You won't believe this! Our new product... [excited] it's AMAZING! [whispers] And just between us, the price is unbeatable."

Stability settings (handled automatically via baseline tone):
- Creative (0.0): High expressiveness - cheerful, excited, energetic, fast_read
- Natural (0.5): Balanced delivery - neutral, warm, empathetic (default)
- Robust (1.0): Highly stable - calm, serious, professional, slow_read

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
    "description": "Background music description (in English)",
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
- Combine both for rich, expressive delivery`;
  }
}
