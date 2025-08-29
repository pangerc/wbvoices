import { Language } from "@/utils/language";

export type Provider = "any" | "lovo" | "elevenlabs" | "openai" | "qwen";

export type { Language };

export type AIModel = "gpt4" | "gpt5" | "gemini" | "moonshot" | "qwen";

export type Voice = {
  id: string;
  name: string;
  gender: "male" | "female" | null;
  sampleUrl?: string;
  language?: Language;
  isMultilingual?: boolean;
  accent?: string;
  style?: string;
  description?: string;
  age?: string;
  use_case?: string;
};

export type VoiceTrack = {
  voice: Voice | null;
  text: string;
  playAfter?: string;
  overlap?: number;
  isConcurrent?: boolean;
  style?: string;
  useCase?: string;
  voiceInstructions?: string; // OpenAI-specific voice control instructions
};

export type CampaignFormat = "ad_read" | "dialog";

export type MusicProvider = "loudly" | "mubert" | "elevenlabs";

export type MusicTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  provider: MusicProvider;
  playAt?: "start" | "end" | string;
  fadeIn?: number;
  fadeOut?: number;
};

export type SoundFxTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  playAfter?: string;
  overlap?: number;
};

export type SoundFxPrompt = {
  description: string;
  playAfter?: string;
  overlap?: number;
  duration?: number;
};

// Project History Types
export type ProjectBrief = {
  clientDescription: string;
  creativeBrief: string;
  campaignFormat: CampaignFormat;
  selectedLanguage: Language;
  selectedProvider: Provider;
  selectedRegion?: string | null; // Optional for backwards compatibility
  adDuration: number;
  selectedAccent: string | null;
  selectedAiModel: AIModel;
  musicProvider?: MusicProvider; // Optional for backwards compatibility
};

export type ProjectMetadata = {
  id: string;
  headline: string;
  timestamp: number;
  language: Language;
  format: CampaignFormat;
  provider: Provider;
};

export type Project = {
  id: string; // UUID
  headline: string; // LLM-generated title
  timestamp: number; // Creation time
  lastModified: number; // Last update time
  brief: ProjectBrief; // Original brief settings
  voiceTracks: VoiceTrack[]; // Generated voice scripts
  musicPrompt: string; // Music generation prompt
  soundFxPrompt: SoundFxPrompt | null; // Sound effects prompt
  // Store actual generated audio URLs (now permanent with Vercel Blob)
  generatedTracks?: {
    voiceUrls: string[];
    musicUrl?: string;
    soundFxUrl?: string;
  };
  // Mixer state - positions and volumes
  mixerState?: {
    tracks: Array<{
      id: string;
      url: string;
      label: string;
      type: "voice" | "music" | "soundfx";
      duration?: number;
      volume?: number;
      startTime?: number;
    }>;
    totalDuration?: number;
  };
  // Preview fields for client sharing
  preview?: {
    brandName: string;
    slogan: string;
    destinationUrl: string;
    cta: string;
    logoUrl?: string; // Vercel blob URL
    visualUrl?: string; // Vercel blob URL
    mixedAudioUrl?: string; // Final mixed audio from mixer
  };
};
