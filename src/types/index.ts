import { Language } from "@/utils/language";

export type Provider = "lovo" | "elevenlabs";

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

export type CampaignFormat = "ad_read" | "dialog" | "group";
