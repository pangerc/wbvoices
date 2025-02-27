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
};

export type VoiceTrack = {
  voice: Voice | null;
  text: string;
};

export type CampaignFormat = "ad_read" | "dialog";

export type MusicProvider = "beatoven" | "loudly";

export type MusicTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  provider: MusicProvider;
};
