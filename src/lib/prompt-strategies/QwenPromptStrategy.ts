import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { CampaignFormat } from "@/types";

/**
 * Qwen Strategy - Direct voice control (similar to basic setup)
 * Also used for ByteDance TTS
 */
export class QwenPromptStrategy extends BasePromptStrategy {
  readonly provider = "qwen" as const;

  buildStyleInstructions(_context: PromptContext): string {
    // No special style instructions - direct voice control
    return "";
  }

  buildOutputFormat(campaignFormat: CampaignFormat): string {
    const dialogExample =
      campaignFormat === "dialog"
        ? `,
    {
      "type": "voice",
      "speaker": "Different Voice Name (id: different_voice_id)",
      "text": "What this voice says"
    }`
        : "";

    return `IMPORTANT OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a valid JSON object with this structure:
{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice Name (id: exact_voice_id)",
      "text": "What the voice says"
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
