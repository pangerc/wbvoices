import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { CampaignFormat } from "@/types";

/**
 * OpenAI TTS Strategy - Uses freeform voiceInstructions for each voice
 */
export class OpenAIPromptStrategy extends BasePromptStrategy {
  readonly provider = "openai" as const;

  buildStyleInstructions(context: PromptContext): string {
    const { accent, region, pacing } = context;

    // Build pacing-specific guidance
    let pacingGuidance = "";
    if (pacing === "fast") {
      pacingGuidance =
        " REQUIRED (client specified it for this ad): Use FAST pacing - rapid, energetic delivery with quick tempo and urgency.";
    } else if (pacing === "slow") {
      pacingGuidance =
        " REQUIRED (client specified it for this ad): Use SLOW pacing - deliberate delivery with thoughtful pauses and relaxed tempo.";
    }

    let instructions = `For OpenAI TTS, provide detailed "voiceInstructions" string for each voice using this structure (IMPORTANT: this part remains in English):
Voice Affect: <detailed description of overall voice character and personality>
Tone: <specific emotional tone with context and nuance>
Pacing: <precise speed description with tempo changes and rhythm details>${pacingGuidance}
Emotion: <emotional delivery style with specific feelings and expressions>
Emphasis: <specific words/phrases to highlight and exact delivery method>
Pronunciation: <articulation style, clarity level, and speech characteristics>
Pauses: <exact placement and duration of pauses with purpose>

Example: "Voice Affect: Calm, composed, and reassuring; Tone: Sincere, empathetic, and gently authoritative; Pacing: Steady and moderate; unhurried yet professional; Emotion: Genuine empathy and understanding; Emphasis: Clear emphasis on key reassurances and benefits; Pronunciation: Clear and precise, emphasizing important words; Pauses: Brief pauses after offering assistance, highlighting willingness to listen."

Consider commercial pacing needs - fast for urgency, moderate for clarity, slow for luxury/premium brands.`;

    if (accent && accent !== "neutral") {
      instructions += ` Include accent guidance in Pronunciation (e.g., "Pronunciation: ${accent}${
        region ? ` (${region})` : ""
      } accent; clear, articulate").`;
    }

    return instructions;
  }

  buildOutputFormat(campaignFormat: CampaignFormat): string {
    const dialogExample =
      campaignFormat === "dialog"
        ? `,
    {
      "type": "voice",
      "speaker": "Different Voice Name (id: different_voice_id)",
      "text": "What this voice says",
      "voiceInstructions": "Provide labeled instructions: Affect/personality; Tone; Pronunciation; Pauses; Emotion. Keep it concise."
    }`
        : "";

    return `IMPORTANT OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a valid JSON object with this structure:
{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice Name (id: exact_voice_id)",
      "text": "What the voice says",
      "voiceInstructions": "Provide labeled instructions: Affect/personality; Tone; Pronunciation; Pauses; Emotion. Keep it concise."
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
}`;
  }
}
