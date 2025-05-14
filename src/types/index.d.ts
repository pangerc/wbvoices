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
}

// Check if SoundFxPrompt needs duration property and add it
export interface SoundFxPrompt {
  description: string;
  playAfter?: string;
  overlap?: number;
  duration?: number;
}
