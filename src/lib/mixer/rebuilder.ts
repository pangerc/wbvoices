/**
 * Mixer Rebuild Logic
 *
 * Generates mixer state from the union of active versions across all streams.
 * This is the core logic that ensures the mixer always reflects the current
 * active choices from voices, music, and sound effects panels.
 */

import { getRedisV3 } from "@/lib/redis-v3";
import {
  getActiveVersion,
  getVersion,
  AD_KEYS,
} from "@/lib/redis/versions";
import {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  MixerState,
  MixerTrack,
} from "@/types/versions";
import { LegacyTimelineCalculator } from "@/services/legacyTimelineCalculator";

/**
 * Rebuild mixer state from union of active versions
 *
 * Algorithm:
 * 1. Load active version IDs for voices/music/sfx
 * 2. Load active version data from Redis
 * 3. Build MixerTrack[] from generatedUrls
 * 4. Calculate timeline positions using LegacyTimelineCalculator
 * 5. Save mixer state to Redis
 * 6. Return mixer state
 *
 * @param adId - Advertisement ID
 * @returns Complete mixer state
 */
export async function rebuildMixer(adId: string): Promise<MixerState> {
  console.log(`🔨 Rebuilding mixer for ad ${adId}`);

  const redis = getRedisV3();

  // ============ Step 1: Get Active Version IDs ============

  const activeVoiceId = await getActiveVersion(adId, "voices");
  const activeMusicId = await getActiveVersion(adId, "music");
  const activeSfxId = await getActiveVersion(adId, "sfx");

  console.log(`  Active versions:`, {
    voices: activeVoiceId || "none",
    music: activeMusicId || "none",
    sfx: activeSfxId || "none",
  });

  // ============ Step 2: Load Active Versions ============

  const voiceVersion = activeVoiceId
    ? ((await getVersion(adId, "voices", activeVoiceId)) as VoiceVersion | null)
    : null;

  const musicVersion = activeMusicId
    ? ((await getVersion(adId, "music", activeMusicId)) as MusicVersion | null)
    : null;

  const sfxVersion = activeSfxId
    ? ((await getVersion(adId, "sfx", activeSfxId)) as SfxVersion | null)
    : null;

  // ============ Step 3: Build Mixer Tracks ============

  const tracks: MixerTrack[] = [];
  const audioDurations: { [key: string]: number } = {};

  // Add voice tracks (check both embedded URL and legacy parallel array)
  const hasVoiceAudio = voiceVersion && (
    voiceVersion.voiceTracks.some(t => !!t.generatedUrl) ||
    (voiceVersion.generatedUrls && voiceVersion.generatedUrls.length > 0)
  );
  if (voiceVersion && hasVoiceAudio) {
    voiceVersion.voiceTracks.forEach((voiceTrack, index) => {
      // Use embedded URL first, fall back to legacy parallel array
      const url = voiceTrack.generatedUrl || voiceVersion.generatedUrls?.[index];
      if (!url) return; // Skip if no audio generated yet

      const trackId = `voice-${activeVoiceId}-${index}`;

      // Use actual measured duration if available, fall back to estimation for legacy data
      const duration = voiceTrack.generatedDuration ?? estimateVoiceDuration(voiceTrack.text);

      const track: MixerTrack = {
        id: trackId,
        url,
        type: "voice",
        label: voiceTrack.voice?.name || `Voice ${index + 1}`,
        duration, // Real duration from generation, or estimation for legacy
        playAfter: voiceTrack.playAfter,
        overlap: voiceTrack.overlap,
        isConcurrent: voiceTrack.isConcurrent,
        metadata: {
          voiceId: voiceTrack.voice?.id,
          voiceProvider: voiceTrack.trackProvider || voiceTrack.voice?.provider,
          scriptText: voiceTrack.text,
        },
      };

      tracks.push(track);
      audioDurations[trackId] = duration;
    });
  }

  // Add music track
  if (musicVersion && musicVersion.generatedUrl) {
    const trackId = `music-${activeMusicId}`;
    // Build label from provider and prompt preview
    let label: string;
    if (musicVersion.provider === "custom") {
      // Custom uploads use musicPrompt as the filename/label
      label = musicVersion.musicPrompt || "Custom track";
    } else {
      const providerLabel = musicVersion.provider.charAt(0).toUpperCase() + musicVersion.provider.slice(1);
      const promptPreview = musicVersion.musicPrompt
        ? ` - ${musicVersion.musicPrompt.substring(0, 25)}${musicVersion.musicPrompt.length > 25 ? "..." : ""}`
        : "";
      label = `${providerLabel}${promptPreview}`;
    }
    const track: MixerTrack = {
      id: trackId,
      url: musicVersion.generatedUrl,
      type: "music",
      label,
      duration: musicVersion.duration,
      metadata: {
        promptText: musicVersion.musicPrompt,
        source: musicVersion.provider,
      },
    };

    tracks.push(track);
    audioDurations[trackId] = musicVersion.duration;
  }

  // Add sound effect tracks
  if (sfxVersion && sfxVersion.generatedUrls.length > 0) {
    sfxVersion.soundFxPrompts.forEach((sfxPrompt, index) => {
      const url = sfxVersion.generatedUrls[index];
      if (!url) return; // Skip if no audio generated yet

      const trackId = `sfx-${activeSfxId}-${index}`;
      const track: MixerTrack = {
        id: trackId,
        url,
        type: "soundfx",
        label: sfxPrompt.description.substring(0, 50),
        duration: sfxPrompt.duration,
        playAfter: sfxPrompt.playAfter,
        overlap: sfxPrompt.overlap,
        metadata: {
          promptText: sfxPrompt.description,
          originalDuration: sfxPrompt.duration,
          placementIntent: sfxPrompt.placement,
        },
      };

      tracks.push(track);
      audioDurations[trackId] = sfxPrompt.duration || 3;
    });
  }

  console.log(`  Built ${tracks.length} mixer tracks`);

  // ============ Step 4: Calculate Timeline ============

  const calculated = LegacyTimelineCalculator.calculateTimings(
    tracks,
    audioDurations
  );

  console.log(`  Total duration: ${calculated.totalDuration.toFixed(2)}s`);

  // ============ Step 5: Build Mixer State ============

  const mixerState: MixerState = {
    tracks,
    volumes: {}, // Empty initially - user can override later
    calculatedTracks: calculated.calculatedTracks.map((ct) => ({
      id: ct.id,
      startTime: ct.actualStartTime,
      duration: ct.actualDuration,
      type: ct.type,
    })),
    totalDuration: calculated.totalDuration,
    lastCalculated: Date.now(),
    activeVersions: {
      voices: activeVoiceId,
      music: activeMusicId,
      sfx: activeSfxId,
    },
  };

  // ============ Step 6: Save to Redis ============

  const mixerKey = AD_KEYS.mixer(adId);
  await redis.set(mixerKey, JSON.stringify(mixerState));

  console.log(`✅ Mixer rebuilt and saved for ad ${adId}`);

  return mixerState;
}

/**
 * Estimate voice duration based on text length
 * Rough heuristic: ~150 words per minute = ~2.5 words per second
 *
 * TODO: Replace with actual audio duration measurement in production
 *
 * @param text - Script text
 * @returns Estimated duration in seconds
 */
function estimateVoiceDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5;
  const estimatedDuration = words / wordsPerSecond;

  // Add padding for natural pauses
  return Math.max(1, estimatedDuration + 1);
}

/**
 * Get current mixer state from Redis
 *
 * @param adId - Advertisement ID
 * @returns Mixer state or null if not found
 */
export async function getMixerState(adId: string): Promise<MixerState | null> {
  const redis = getRedisV3();
  const mixerKey = AD_KEYS.mixer(adId);

  const data = await redis.get(mixerKey);

  if (!data) {
    return null;
  }

  return typeof data === "string" ? JSON.parse(data) : data;
}
