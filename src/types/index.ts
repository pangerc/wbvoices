import { Language } from "@/utils/language";
import type { AIModel as AIModelType } from '@/utils/aiModelSelection';

export type Provider = "any" | "lovo" | "elevenlabs" | "openai" | "qwen" | "bytedance";

export type Pacing = "normal" | "fast";

export type { Language };

// Pronunciation Dictionary Types
export type PronunciationRuleType = 'alias' | 'phoneme';
export type PhoneticAlphabet = 'ipa' | 'cmu' | 'x-sampa';

export type PronunciationRule = {
  stringToReplace: string;
  type: PronunciationRuleType;
  alias?: string;
  phoneme?: string;
  alphabet?: PhoneticAlphabet;
};

export type PronunciationDictionary = {
  id: string;
  versionId: string;
  name: string;
  rules: PronunciationRule[];
  description?: string;
  createdAt: string;
};

// Import AIModel from single source of truth
export type AIModel = AIModelType;

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

export type MusicPrompts = {
  loudly: string;
  mubert: string;
  elevenlabs: string;
};

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

// Sound effect placement intent - stores semantic placement that gets resolved at timeline calculation
export type SoundFxPlacementIntent =
  | { type: "start" }  // Before all voice tracks
  | { type: "afterVoice"; index: number }  // After voice track N (0-indexed)
  | { type: "end" }  // After all voice tracks
  | { type: "legacy"; playAfter: string };  // Backwards compatibility with old format

export type SoundFxPrompt = {
  description: string;
  playAfter?: string;  // Legacy field for backwards compatibility
  overlap?: number;
  duration?: number;
  placement?: SoundFxPlacementIntent;  // New intent-based placement
};

export type LibraryMusicTrack = {
  projectId: string;
  projectTitle: string;
  musicPrompt: string;
  musicProvider: MusicProvider;
  musicUrl: string;
  createdAt: number;
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
  selectedCTA?: string | null; // Optional for backwards compatibility
  selectedPacing?: Pacing | null; // Optional for backwards compatibility
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
  musicPrompt: string; // Music generation prompt (base/fallback)
  musicPrompts?: MusicPrompts; // Provider-specific music prompts
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
