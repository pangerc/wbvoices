import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { Voice, CampaignFormat } from "@/types";

/**
 * Lovo Strategy - Style is baked into voice selection (e.g., "Ava (Cheerful)" vs "Ava (Serious)")
 */
export class LovoPromptStrategy extends BasePromptStrategy {
  readonly provider = "lovo" as const;

  buildStyleInstructions(_context: PromptContext): string {
    return `Lovo voices have styles built into the voice selection (e.g., "Ava (Cheerful)" vs "Ava (Serious)"). The emotional style is already encoded in the voice ID you choose - no additional style parameter is needed or used by the API.`;
  }

  formatVoiceMetadata(voice: Voice, context: PromptContext): string {
    // Use base implementation which includes gender fix
    let desc = super.formatVoiceMetadata(voice, context);

    // Add style field for Lovo (it's part of the voice selection)
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
