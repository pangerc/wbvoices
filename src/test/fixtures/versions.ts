/**
 * Test fixtures
 * Reusable test data for versions
 */

import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VoiceTrack,
  SoundFxPrompt,
} from "@/types/versions";

/**
 * Mock Voice Track
 */
export const mockVoiceTrack: VoiceTrack = {
  voice: {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    provider: "elevenlabs",
    gender: "female",
    language: "en",
  },
  text: "Discover Spotify Premium today and enjoy ad-free music.",
  playAfter: "start",
  overlap: 0,
  isConcurrent: false,
};

/**
 * Mock Voice Version (draft)
 */
export const mockVoiceVersionDraft: VoiceVersion = {
  voiceTracks: [mockVoiceTrack],
  generatedUrls: [],
  createdAt: Date.now(),
  createdBy: "user",
  status: "draft",
};

/**
 * Mock Voice Version (active, with generated URLs)
 */
export const mockVoiceVersionActive: VoiceVersion = {
  voiceTracks: [mockVoiceTrack],
  generatedUrls: ["https://blob.vercel-storage.com/voice-track-1.mp3"],
  createdAt: Date.now(),
  createdBy: "llm",
  status: "active",
  promptContext: "Generate an energetic ad for Spotify Premium",
};

/**
 * Mock Music Version (draft)
 */
export const mockMusicVersionDraft: MusicVersion = {
  musicPrompt: "Upbeat electronic music, modern, energetic",
  musicPrompts: {
    loudly: "Upbeat electronic music, modern, energetic",
    mubert: "Electronic, energetic, fast tempo",
    elevenlabs: "Upbeat electronic background music",
  },
  generatedUrl: "",
  duration: 30,
  provider: "loudly",
  createdAt: Date.now(),
  createdBy: "user",
  status: "draft",
};

/**
 * Mock Music Version (active, with generated URL)
 */
export const mockMusicVersionActive: MusicVersion = {
  musicPrompt: "Upbeat electronic music, modern, energetic",
  musicPrompts: {
    loudly: "Upbeat electronic music, modern, energetic",
    mubert: "Electronic, energetic, fast tempo",
    elevenlabs: "Upbeat electronic background music",
  },
  generatedUrl: "https://blob.vercel-storage.com/music-track-1.mp3",
  duration: 30,
  provider: "loudly",
  createdAt: Date.now(),
  createdBy: "llm",
  status: "active",
};

/**
 * Mock Sound Effect Prompt
 */
export const mockSoundFxPrompt: SoundFxPrompt = {
  description: "Whoosh sound effect",
  duration: 2,
  playAfter: "start",
  overlap: 0,
  placement: {
    type: "start",
  },
};

/**
 * Mock SFX Version (draft)
 */
export const mockSfxVersionDraft: SfxVersion = {
  soundFxPrompts: [mockSoundFxPrompt],
  generatedUrls: [],
  createdAt: Date.now(),
  createdBy: "user",
  status: "draft",
};

/**
 * Mock SFX Version (active, with generated URLs)
 */
export const mockSfxVersionActive: SfxVersion = {
  soundFxPrompts: [mockSoundFxPrompt],
  generatedUrls: ["https://blob.vercel-storage.com/sfx-1.mp3"],
  createdAt: Date.now(),
  createdBy: "user",
  status: "active",
};

/**
 * Mock Ad ID for testing
 */
export const mockAdId = "test-ad-123";

/**
 * Mock Session ID for testing
 */
export const mockSessionId = "test-session-456";
