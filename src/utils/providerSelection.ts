import { Provider, CampaignFormat } from '@/types';

// Define VoiceCounts locally to avoid importing server-side code
export type VoiceCounts = Record<Provider, number>;

export class ProviderSelector {
  /**
   * Dragon-slaying simple provider selection
   * Language-aware quality hierarchy:
   * - Arabic: OpenAI > ElevenLabs (research shows 2/13 ElevenLabs voices good for Arabic)
   * - Chinese: Qwen > ByteDance > ElevenLabs > OpenAI
   * - Other languages: ElevenLabs > OpenAI (Lovo disabled)
   * Dialog needs 2+ voices, ad_read needs 1+ voice
   */
  static selectDefault(
    format: CampaignFormat,
    voiceCounts: VoiceCounts,
    language?: string,
    region?: string,
    accent?: string
  ): Provider {
    const minVoices = format === "dialog" ? 2 : 1;
    const isChineseLanguage = language === "zh" || language?.startsWith("zh-");
    const isArabicLanguage = language === "ar" || language?.startsWith("ar-");

    console.log(`🔍 ProviderSelector.selectDefault:`, {
      format,
      minVoices,
      language,
      region,
      accent,
      isChineseLanguage,
      isArabicLanguage,
      voiceCounts,
      elevenlabsCheck: `${voiceCounts.elevenlabs} >= ${minVoices} = ${voiceCounts.elevenlabs >= minVoices}`
    });

    const contextStr = [language, region, accent].filter(Boolean).join('+');

    // Arabic language preference: Lahajati > OpenAI > ElevenLabs
    // Lahajati is a specialized Arabic dialect provider with 339 voices and 116 dialects
    if (isArabicLanguage) {
      if (voiceCounts.lahajati >= minVoices) {
        console.log(`✅ Selected lahajati for Arabic ${contextStr} (${voiceCounts.lahajati} >= ${minVoices})`);
        return "lahajati";
      }
      if (voiceCounts.openai >= minVoices) {
        console.log(`✅ Selected openai for Arabic ${contextStr} (${voiceCounts.openai} >= ${minVoices})`);
        return "openai";
      }
    }

    // Chinese language preference: Qwen > ByteDance > ElevenLabs > OpenAI
    if (isChineseLanguage && voiceCounts.qwen >= minVoices) {
      console.log(`✅ Selected qwen for ${contextStr} (${voiceCounts.qwen} >= ${minVoices})`);
      return "qwen";
    }

    if (isChineseLanguage && voiceCounts.bytedance >= minVoices) {
      console.log(`✅ Selected bytedance for ${contextStr} (${voiceCounts.bytedance} >= ${minVoices})`);
      return "bytedance";
    }

    // Check providers in quality order (Lovo disabled)
    // For Arabic, only fallback to ElevenLabs if OpenAI unavailable
    if (voiceCounts.elevenlabs >= minVoices) {
      console.log(`✅ Selected elevenlabs for ${contextStr} (${voiceCounts.elevenlabs} >= ${minVoices})`);
      return "elevenlabs";
    }

    // Skip Lovo due to poor voice quality
    // if (voiceCounts.lovo >= minVoices) {
    //   return "lovo";
    // }

    // OpenAI fallback (good for Arabic, fallback for others)
    console.log(`✅ Fallback to openai for ${contextStr} (elevenlabs: ${voiceCounts.elevenlabs} < ${minVoices})`);
    return "openai";
  }
  
  /**
   * Get provider display options with counts for UI
   */
  static getProviderOptions(voiceCounts: VoiceCounts) {
    return [
      {
        value: "elevenlabs",
        label: `ElevenLabs (${voiceCounts.elevenlabs})`,
        disabled: voiceCounts.elevenlabs === 0,
        quality: "excellent" as const
      },
      // Lovo disabled due to poor voice quality
      // {
      //   value: "lovo",
      //   label: `Lovo (${voiceCounts.lovo})`,
      //   disabled: voiceCounts.lovo === 0,
      //   quality: "good" as const
      // },
      {
        value: "lahajati",
        label: `Lahajati (${voiceCounts.lahajati})`,
        disabled: voiceCounts.lahajati === 0,
        quality: "arabic-specialist" as const
      },
      {
        value: "qwen",
        label: `Qwen (${voiceCounts.qwen})`,
        disabled: voiceCounts.qwen === 0,
        quality: "chinese-specialist" as const
      },
      {
        value: "bytedance",
        label: `ByteDance (${voiceCounts.bytedance})`,
        disabled: voiceCounts.bytedance === 0,
        quality: "chinese-specialist" as const
      },
      {
        value: "openai",
        label: `OpenAI (${voiceCounts.openai})`,
        disabled: voiceCounts.openai === 0,
        quality: "fallback" as const
      }
    ];
  }
  
  /**
   * Check if provider switch makes sense
   */
  static shouldSuggestSwitch(
    currentProvider: Provider,
    format: CampaignFormat,
    voiceCounts: VoiceCounts,
    language?: string,
    region?: string,
    accent?: string
  ): { suggest: boolean; reason?: string; suggestedProvider?: Provider } {
    const optimal = this.selectDefault(format, voiceCounts, language, region, accent);
    
    if (currentProvider === optimal) {
      return { suggest: false };
    }
    
    // Suggest switch to better option
    if (optimal === "elevenlabs" && currentProvider !== "elevenlabs") {
      return {
        suggest: true,
        reason: "ElevenLabs has better quality for dialogue",
        suggestedProvider: "elevenlabs"
      };
    }
    
    // Lovo suggestions disabled due to poor voice quality
    // if (optimal === "lovo" && voiceCounts.lovo > voiceCounts[currentProvider]) {
    //   return {
    //     suggest: true,
    //     reason: "Lovo has more voices for this accent",
    //     suggestedProvider: "lovo"
    //   };
    // }
    
    return { suggest: false };
  }
}

/**
 * Future: Accent-specific preferences (after collecting feedback)
 * For now, we stick to simple rules and learn from user behavior
 */
export type AccentPreference = {
  language: string;
  accent: string;
  preferredProvider: Provider;
  confidence: number; // 0-1, how sure we are
  sampleSize: number; // How many projects this is based on
};

// Placeholder for future learning
export const ACCENT_PREFERENCES: AccentPreference[] = [
  // Will be populated based on user feedback
  // Example: { language: "ar-SA", accent: "kuwaiti", preferredProvider: "lovo", confidence: 0.9, sampleSize: 50 }
];