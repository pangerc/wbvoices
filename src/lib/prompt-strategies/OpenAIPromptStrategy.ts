import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { CampaignFormat } from "@/types";

/**
 * OpenAI TTS Strategy - Uses freeform voiceInstructions for each voice
 */
export class OpenAIPromptStrategy extends BasePromptStrategy {
  readonly provider = "openai" as const;

  buildStyleInstructions(context: PromptContext): string {
    const { accent, region } = context;

    let instructions = `For OpenAI TTS, provide detailed "voiceInstructions" string for each voice using this structure (this part remains in English):
Voice Affect: <brief description of overall voice character>
Tone: <brief description of emotional tone>
Pacing: <specify speed - slow/moderate/fast/rapid, with any tempo changes>
Emotion: <emotional delivery style>
Emphasis: <what words/phrases to highlight and how>
Pronunciation: <articulation style and clarity>
Pauses: <where to pause and for how long>

Example: "Voice Affect: Energetic spokesperson with confident authority; Tone: Enthusiastic and persuasive; Pacing: Fast-paced with quick delivery, slowing slightly for key product benefits; Emotion: Excited and compelling; Emphasis: Strong emphasis on brand name and call-to-action; Pronunciation: Clear, crisp articulation; Pauses: Brief pause before call-to-action for impact."

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
