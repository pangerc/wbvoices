// Add missing type definitions or modify existing ones for timing information

// Check if VoiceTrack needs isConcurrent property and add it
export interface VoiceTrack {
  voice: {
    id: string;
    name: string;
    gender: string | null;
  };
  text: string;
  // Add timing properties
  playAfter?: string;
  overlap?: number;
  isConcurrent?: boolean;
  // Add voice control properties
  style?: string; // For Lovo, ElevenLabs style variants
  useCase?: string; // General use case info
  voiceInstructions?: string; // OpenAI-specific detailed voice instructions
}

// Check if SoundFxPrompt needs duration property and add it
export interface SoundFxPrompt {
  description: string;
  playAfter?: string;
  overlap?: number;
  duration?: number;
}
