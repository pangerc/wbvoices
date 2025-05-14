import { Language } from "@/utils/language";

export type Provider = "lovo" | "elevenlabs";

export type AIModel = "gpt4" | "deepseek" | "gemini";

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
};

export type VoiceTrack = {
  voice: Voice | null;
  text: string;
  playAfter?: string;
  overlap?: number;
  isConcurrent?: boolean;
};

export type CampaignFormat = "ad_read" | "dialog";

export type MusicProvider = "beatoven" | "loudly";

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
