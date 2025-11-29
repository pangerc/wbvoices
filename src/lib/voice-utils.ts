/**
 * Voice Generation Utilities
 *
 * Unified module for voice generation and persistence.
 * - Provider resolution: getEffectiveProvider()
 * - Generation: generateVoiceTrack() - calls existing v2 endpoints
 * - Persistence: persistTrackUrl() - updates Redis version
 * - Combined: generateAndPersistTrack() - does both
 */

import type { VoiceTrack, Provider } from "@/types";

// ============ Provider Resolution ============

/**
 * Get the effective provider for a voice track.
 *
 * Fallback chain (matches audioService.ts):
 * 1. track.trackProvider - Manual override (user changed provider in modal)
 * 2. track.voice.provider - From Redis/catalogue (source of truth)
 * 3. defaultProvider - Global fallback (selectedProvider)
 */
export function getEffectiveProvider(
  track: VoiceTrack | undefined,
  defaultProvider: Provider
): Provider {
  if (!track) return defaultProvider;
  return track.trackProvider || track.voice?.provider || defaultProvider;
}

// ============ API Endpoint Mapping ============

const VOICE_ENDPOINTS: Record<string, string> = {
  elevenlabs: "/api/voice/elevenlabs-v2",
  openai: "/api/voice/openai-v2",
  lovo: "/api/voice/lovo-v2",
  qwen: "/api/voice/qwen-v2",
  bytedance: "/api/voice/bytedance-v2",
};

// ============ Types ============

export interface GenerateOptions {
  /** Truncate text for quick preview (chars). Full text if undefined */
  truncateLength?: number;
  /** Fallback provider if track doesn't specify */
  defaultProvider?: Provider;
}

export interface GenerateResult {
  audioUrl: string;
  provider: Provider;
  text: string;
}

export interface PersistOptions {
  adId: string;
  versionId: string;
  trackIndex: number;
}

// ============ Generation ============

/**
 * Generate voice audio for a single track
 * Uses existing v2 endpoints - no new provider code
 */
export async function generateVoiceTrack(
  track: VoiceTrack,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  if (!track.voice?.id) {
    throw new Error("No voice selected for track");
  }

  if (!track.text?.trim()) {
    throw new Error("No text for track");
  }

  const provider = getEffectiveProvider(
    track,
    options.defaultProvider || "elevenlabs"
  );
  const endpoint = VOICE_ENDPOINTS[provider];

  if (!endpoint) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  let text = track.text;
  if (options.truncateLength) {
    text = truncateForPreview(text, options.truncateLength);
  }

  console.log(
    `🎙️ Generating voice track: provider=${provider}, voice=${track.voice.name}, text="${text.substring(0, 50)}..."`
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId: track.voice.id,
      style: track.style,
      useCase: track.useCase,
      voiceInstructions: track.voiceInstructions,
      speed: track.speed,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Voice generation failed: ${response.statusText}`
    );
  }

  const data = await response.json();

  if (!data.audio_url) {
    throw new Error("No audio URL in response");
  }

  console.log(`✅ Voice track generated: ${data.audio_url.substring(0, 50)}...`);

  return {
    audioUrl: data.audio_url,
    provider,
    text,
  };
}

// ============ Persistence ============

/**
 * Persist a generated URL to the voice track's embedded generatedUrl field
 * Also maintains deprecated generatedUrls[] for backwards compatibility during migration
 */
export async function persistTrackUrl(
  audioUrl: string,
  options: PersistOptions
): Promise<void> {
  const { adId, versionId, trackIndex } = options;

  console.log(
    `💾 Persisting track URL: adId=${adId}, versionId=${versionId}, index=${trackIndex}`
  );

  // Fetch current version to get existing tracks
  const getRes = await fetch(`/api/ads/${adId}/voices/${versionId}`);

  if (!getRes.ok) {
    throw new Error(`Failed to fetch version: ${getRes.statusText}`);
  }

  const version = await getRes.json();

  // Update voiceTracks with embedded URL (new format)
  const tracks = [...(version.voiceTracks || [])];
  if (tracks[trackIndex]) {
    tracks[trackIndex] = { ...tracks[trackIndex], generatedUrl: audioUrl };
  }

  // PATCH to persist (only voiceTracks with embedded URLs)
  const patchRes = await fetch(`/api/ads/${adId}/voices/${versionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceTracks: tracks }),
  });

  if (!patchRes.ok) {
    throw new Error(`Failed to persist URL: ${patchRes.statusText}`);
  }

  console.log(`✅ Track URL persisted to voiceTracks[${trackIndex}].generatedUrl`);
}

// ============ Combined Convenience ============

/**
 * Generate and persist in one call
 * Use this when you want the URL stored in Redis
 */
export async function generateAndPersistTrack(
  track: VoiceTrack,
  persistOptions: PersistOptions,
  genOptions: GenerateOptions = {}
): Promise<GenerateResult> {
  const result = await generateVoiceTrack(track, genOptions);
  await persistTrackUrl(result.audioUrl, persistOptions);
  return result;
}

// ============ Helpers ============

/**
 * Truncate text for preview, preferring sentence boundaries
 */
function truncateForPreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const truncated = text.substring(0, maxChars);

  // Try to find sentence end within limit
  const sentenceEnds = [
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  ];
  const sentenceEnd = Math.max(...sentenceEnds);

  // If we found a sentence end in the first 50% of the text, use it
  if (sentenceEnd > maxChars * 0.5) {
    return text.substring(0, sentenceEnd + 1);
  }

  // Otherwise just truncate with ellipsis
  return truncated.trim() + "...";
}
