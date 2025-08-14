import { Provider, CampaignFormat } from '@/types';

// Define VoiceCounts locally to avoid importing server-side code
export type VoiceCounts = Record<Provider, number>;

export class ProviderSelector {
  /**
   * Dragon-slaying simple provider selection
   * Quality hierarchy: ElevenLabs > Lovo > OpenAI
   * Dialog needs 2+ voices, ad_read needs 1+ voice
   */
  static selectDefault(
    format: CampaignFormat,
    voiceCounts: VoiceCounts
  ): Provider {
    const minVoices = format === "dialog" ? 2 : 1;
    
    // Check providers in quality order
    if (voiceCounts.elevenlabs >= minVoices) {
      return "elevenlabs";
    }
    
    if (voiceCounts.lovo >= minVoices) {
      return "lovo";
    }
    
    // OpenAI fallback
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
      {
        value: "lovo", 
        label: `Lovo (${voiceCounts.lovo})`,
        disabled: voiceCounts.lovo === 0,
        quality: "good" as const
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
    voiceCounts: VoiceCounts
  ): { suggest: boolean; reason?: string; suggestedProvider?: Provider } {
    const optimal = this.selectDefault(format, voiceCounts);
    
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
    
    if (optimal === "lovo" && voiceCounts.lovo > voiceCounts[currentProvider]) {
      return {
        suggest: true,
        reason: "Lovo has more voices for this accent",
        suggestedProvider: "lovo"
      };
    }
    
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