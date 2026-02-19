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
import { applyTimeStretch } from "@/utils/audio-processing";

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
  lahajati: "/api/voice/lahajati-v2",
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
  duration: number;
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
      // Lahajati-specific parameters (passed through if present)
      dialectId: track.dialectId,
      performanceId: track.performanceId,
    }),
  });

  if (!response.ok) {
    // Handle timeout specifically (504 from gateway, 408 from server)
    if (response.status === 504 || response.status === 408) {
      throw new Error(
        `Voice generation timed out. The text may be too long for ${provider}. Try shorter segments.`
      );
    }

    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || `Voice generation failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  if (!data.audio_url) {
    throw new Error("No audio URL in response");
  }

  console.log(`✅ Voice track generated: ${data.audio_url.substring(0, 50)}... (duration: ${data.duration || 0}s)`);

  let audioUrl = data.audio_url;
  let duration = data.duration || 0;

  // Apply post-processing speedup if specified (ElevenLabs only)
  if (provider === 'elevenlabs' && (track.postProcessingSpeedup || track.targetDuration)) {
    const processed = await applyPostProcessing(audioUrl, track, duration);
    audioUrl = processed.audioUrl;
    duration = processed.duration;
  }

  return {
    audioUrl,
    duration,
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
  duration: number,
  options: PersistOptions
): Promise<void> {
  const { adId, versionId, trackIndex } = options;

  console.log(
    `💾 Persisting track URL: adId=${adId}, versionId=${versionId}, index=${trackIndex}, duration=${duration}s`
  );

  // Fetch current version to get existing tracks
  const getRes = await fetch(`/api/ads/${adId}/voices/${versionId}`);

  if (!getRes.ok) {
    throw new Error(`Failed to fetch version: ${getRes.statusText}`);
  }

  const version = await getRes.json();

  // Update voiceTracks with embedded URL and duration (new format)
  const tracks = [...(version.voiceTracks || [])];
  if (tracks[trackIndex]) {
    tracks[trackIndex] = {
      ...tracks[trackIndex],
      generatedUrl: audioUrl,
      generatedDuration: duration,
    };
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
  await persistTrackUrl(result.audioUrl, result.duration, persistOptions);
  return result;
}

// ============ Post-Processing ============

/**
 * Apply time-stretching post-processing to generated audio.
 * Downloads original, applies SoundTouch WSOLA, uploads processed WAV.
 * Ported from AudioService.applyPostProcessingSpeedup (audioService.ts).
 */
async function applyPostProcessing(
  originalUrl: string,
  track: VoiceTrack,
  originalDurationFromProvider: number
): Promise<{ audioUrl: string; duration: number }> {
  try {
    console.log(`🎬 Post-processing required for ElevenLabs track`);

    // Download original audio
    const response = await fetch(originalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    const audioArrayBuffer = await response.arrayBuffer();

    // Calculate speedup
    let speedup = track.postProcessingSpeedup || 1.0;

    if (track.targetDuration) {
      // Measure actual duration if provider didn't give us one
      let originalDuration = originalDurationFromProvider;
      if (!originalDuration) {
        originalDuration = await new Promise<number>((resolve) => {
          const audio = new Audio(originalUrl);
          audio.addEventListener('loadedmetadata', () => resolve(audio.duration));
          audio.addEventListener('error', () => resolve(0));
          audio.load();
        });
      }

      if (originalDuration > 0) {
        speedup = originalDuration / track.targetDuration;
        if (speedup > 1.6) {
          console.warn(`Calculated speedup ${speedup.toFixed(2)}x exceeds 1.6x, clamping`);
          speedup = 1.6;
        }
        console.log(`🎯 Target duration ${track.targetDuration}s → ${speedup.toFixed(2)}x speedup`);
      }
    }

    // Apply time-stretching
    const pitch = track.postProcessingPitch || 1.0;
    console.log(`⚡ Applying ${speedup.toFixed(2)}x time-stretch with ${pitch.toFixed(2)}x pitch`);
    const processedArrayBuffer = await applyTimeStretch(audioArrayBuffer, speedup, pitch);

    // Upload processed audio
    const processedBlob = new Blob([processedArrayBuffer], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('audio', processedBlob, `processed-voice-${Date.now()}.wav`);
    formData.append('voiceId', track.voice?.id || 'unknown');
    formData.append('provider', 'elevenlabs-processed');
    formData.append('projectId', `voice-processed-${Date.now()}`);

    const uploadResponse = await fetch('/api/voice/upload-processed', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload processed audio: ${uploadResponse.statusText}`);
    }

    const { audio_url } = await uploadResponse.json();
    const processedDuration = originalDurationFromProvider
      ? originalDurationFromProvider / speedup
      : 0;

    console.log(`✅ Post-processed audio: ${audio_url.substring(0, 50)}... (${processedDuration.toFixed(1)}s)`);
    return { audioUrl: audio_url, duration: processedDuration };
  } catch (error) {
    console.error('❌ Post-processing failed, using original audio:', error);
    return { audioUrl: originalUrl, duration: originalDurationFromProvider };
  }
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
