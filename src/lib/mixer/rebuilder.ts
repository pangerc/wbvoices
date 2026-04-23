/**
 * Mixer rebuild + read.
 *
 * Post-stage-6 data flow:
 *   - Every ad has a mixer version stream (`ad:{id}:mixer:...`). On the first
 *     read of a legacy ad, `bootstrapLegacyMixer` materializes `mixer:v1`.
 *   - The active mixer version's `pins` declare which voice/music/sfx
 *     versions this arrangement references. MixerState derives from pins,
 *     not from stream-level active pointers directly. That's what lets a
 *     frozen variant (Mandarin, girl-girl cast, pacing tweak) keep pointing
 *     at the content it was recorded against even after the user moves the
 *     stream-level actives elsewhere.
 *   - `rebuildMixer` is the mutation path: it ensures an active mixer draft
 *     exists (forking the frozen active if needed) and syncs that draft's
 *     pins to the current stream actives. Called from freeze endpoints.
 *   - `getMixerState` is the read path: bootstrap + derive. Never mutates.
 *
 * Positioning still uses `LegacyTimelineCalculator` in this stage — the pure
 * resolver swap lands in stage 7. Until then, the cached resolver output on
 * frozen mixer versions is intentionally unused.
 */

import {
  AD_KEYS,
  createVersion,
  getActiveVersion,
  getVersion,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import { withAdLock } from "@/lib/redis/adLock";
import { bootstrapLegacyMixer } from "@/lib/mixer/bootstrap";
import {
  MixerPins,
  MixerState,
  MixerTrack,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
  VoiceVersion,
} from "@/types/versions";
import { LegacyTimelineCalculator } from "@/services/legacyTimelineCalculator";

// Silence unused-symbol warning while still keeping AD_KEYS imported for
// downstream edits in stage 7 (cached resolver invalidation).
void AD_KEYS;

/**
 * Rebuild mixer state.
 *
 * 1. Ensure bootstrap (idempotent).
 * 2. Ensure active mixer is a draft — fork the frozen active if needed.
 * 3. Sync the draft's pins to current content-stream actives.
 * 4. Derive MixerState from the draft + pinned content versions.
 */
export async function rebuildMixer(adId: string): Promise<MixerState> {
  console.log(`🔨 Rebuilding mixer for ad ${adId}`);

  await bootstrapLegacyMixer(adId);
  await ensureMixerDraftWithCurrentPins(adId);

  const state = await deriveMixerStateFromActive(adId);
  if (!state) {
    // Bootstrap skipped — no content to build from. Return an empty state so
    // callers (freeze endpoints) can still respond coherently.
    return emptyMixerState();
  }
  return state;
}

/**
 * Read mixer state. Bootstraps on first read of a legacy ad. No mutation
 * beyond the bootstrap itself (no draft creation, no pin sync).
 */
export async function getMixerState(adId: string): Promise<MixerState | null> {
  await bootstrapLegacyMixer(adId);
  return deriveMixerStateFromActive(adId);
}

export interface MixerPatch {
  /** Track-id-keyed volumes as the MixerPanel UI sends them. */
  volumes?: Record<string, number>;
  /** URL of the most recent rendered mix uploaded to blob storage. */
  mixedAudioUrl?: string;
}

/**
 * Apply a MixerPanel-style patch (volumes + mixedAudioUrl) to the active
 * mixer version. Forks a frozen active into a new draft first — render saves
 * are user actions and should never mutate a frozen take.
 *
 * Returns the fully-derived MixerState so the endpoint can echo it back.
 */
export async function applyMixerPatch(
  adId: string,
  patch: MixerPatch
): Promise<MixerState | null> {
  await bootstrapLegacyMixer(adId);
  await ensureMixerDraftWithCurrentPins(adId);

  const activeId = await getActiveVersion(adId, "mixer");
  if (!activeId) return null;
  const active = await getVersion(adId, "mixer", activeId);
  if (!active || active.status !== "draft") return null;

  const pinned = await loadPinnedVersions(adId, active.pins);

  const nextOverrides: Record<string, { volume?: number }> = {
    ...(active.overrides ?? {}),
  };
  if (patch.volumes) {
    for (const [trackId, volume] of Object.entries(patch.volumes)) {
      if (typeof volume !== "number") continue;
      const slotId = slotIdForTrack(
        inferTrackShape(trackId),
        pinned.voice,
        pinned.music,
        pinned.sfx
      );
      if (!slotId) continue;
      nextOverrides[slotId] = { ...(nextOverrides[slotId] ?? {}), volume };
    }
  }

  const updates: Partial<MixerVersion> = { overrides: nextOverrides };
  if (typeof patch.mixedAudioUrl === "string") {
    updates.mixedAudioUrl = patch.mixedAudioUrl;
  }
  await updateVersion(adId, "mixer", activeId, updates);

  return deriveMixerStateFromActive(adId);
}

async function loadPinnedVersions(adId: string, pins: MixerVersion["pins"]) {
  return {
    voice: pins.voices
      ? ((await getVersion(adId, "voices", pins.voices)) as VoiceVersion | null)
      : null,
    music: pins.music
      ? ((await getVersion(adId, "music", pins.music)) as MusicVersion | null)
      : null,
    sfx: pins.sfx
      ? ((await getVersion(adId, "sfx", pins.sfx)) as SfxVersion | null)
      : null,
  };
}

/**
 * Recover the track type from its id so `slotIdForTrack` can resolve the
 * slot without the caller supplying it. Track ids are stable by construction
 * (`voice-{versionId}-{n}`, `sfx-{versionId}-{n}`, `music-{versionId}`).
 */
function inferTrackShape(
  trackId: string
): { id: string; type: "voice" | "music" | "soundfx" } {
  if (trackId.startsWith("voice-")) return { id: trackId, type: "voice" };
  if (trackId.startsWith("music-")) return { id: trackId, type: "music" };
  if (trackId.startsWith("sfx-")) return { id: trackId, type: "soundfx" };
  return { id: trackId, type: "voice" };
}

// ============ Draft + pin reconciliation ============

async function ensureMixerDraftWithCurrentPins(adId: string): Promise<void> {
  await withAdLock(
    adId,
    async () => {
      const activeId = await getActiveVersion(adId, "mixer");
      if (!activeId) return; // Bootstrap skipped (empty ad); nothing to reconcile.

      const activeVersion = await getVersion(adId, "mixer", activeId);
      if (!activeVersion) return;

      const currentPins: MixerPins = {
        voices: await getActiveVersion(adId, "voices"),
        music: await getActiveVersion(adId, "music"),
        sfx: await getActiveVersion(adId, "sfx"),
      };

      if (activeVersion.status === "frozen") {
        // Fork the frozen active into a new draft carrying forward its
        // anchor graph + overrides, with updated pins.
        const draft: MixerVersion = {
          anchors: activeVersion.anchors,
          pins: currentPins,
          overrides: activeVersion.overrides,
          createdAt: Date.now(),
          createdBy: "fork",
          status: "draft",
          parentVersionId: activeId,
          label: activeVersion.label,
        };
        const draftId = await createVersion(adId, "mixer", draft);
        await setActiveVersion(adId, "mixer", draftId);
        return;
      }

      // Active is already a draft — just refresh its pins.
      if (!pinsEqual(activeVersion.pins, currentPins)) {
        await updateVersion(adId, "mixer", activeId, {
          pins: currentPins,
        } as Partial<MixerVersion>);
      }
    },
    { ttlSec: 15, timeoutMs: 8_000 }
  );
}

function pinsEqual(a: MixerPins, b: MixerPins): boolean {
  return a.voices === b.voices && a.music === b.music && a.sfx === b.sfx;
}

// ============ MixerState derivation ============

async function deriveMixerStateFromActive(
  adId: string
): Promise<MixerState | null> {
  const activeMixerId = await getActiveVersion(adId, "mixer");
  if (!activeMixerId) return null;

  const mixerVersion = await getVersion(adId, "mixer", activeMixerId);
  if (!mixerVersion) return null;

  return deriveMixerState(adId, mixerVersion, activeMixerId);
}

async function deriveMixerState(
  adId: string,
  mixerVersion: MixerVersion,
  activeMixerId: VersionId
): Promise<MixerState> {
  const { pins } = mixerVersion;

  const voiceVersion = pins.voices
    ? await getVersion(adId, "voices", pins.voices)
    : null;
  const musicVersion = pins.music
    ? await getVersion(adId, "music", pins.music)
    : null;
  const sfxVersion = pins.sfx
    ? await getVersion(adId, "sfx", pins.sfx)
    : null;

  const tracks: MixerTrack[] = [];
  const audioDurations: Record<string, number> = {};

  if (voiceVersion) {
    collectVoiceTracks(
      voiceVersion as VoiceVersion,
      pins.voices!,
      tracks,
      audioDurations
    );
  }
  if (musicVersion) {
    collectMusicTrack(
      musicVersion as MusicVersion,
      pins.music!,
      tracks,
      audioDurations
    );
  }
  if (sfxVersion) {
    collectSfxTracks(
      sfxVersion as SfxVersion,
      pins.sfx!,
      tracks,
      audioDurations
    );
  }

  console.log(
    `  Built ${tracks.length} mixer tracks for ad ${adId} mixer=${activeMixerId}`
  );

  const calculated = LegacyTimelineCalculator.calculateTimings(
    tracks,
    audioDurations
  );

  // Project per-slot overrides (the persisted form) back onto the track-id
  // keyed `volumes` map the client expects. Hydration in mixerStore uses the
  // track's own `volume` field as a fallback; passing volumes explicitly keeps
  // sliders correct even across re-renders where MixerPanel drops local state.
  const volumes = deriveVolumesByTrackId(
    tracks,
    mixerVersion.overrides ?? {},
    voiceVersion as VoiceVersion | null,
    musicVersion as MusicVersion | null,
    sfxVersion as SfxVersion | null
  );
  for (const track of tracks) {
    const v = volumes[track.id];
    if (typeof v === "number") track.volume = v;
  }

  const mixerState: MixerState = {
    tracks,
    volumes,
    calculatedTracks: calculated.calculatedTracks.map((ct) => ({
      id: ct.id,
      startTime: ct.actualStartTime,
      duration: ct.actualDuration,
      type: ct.type,
    })),
    totalDuration: calculated.totalDuration,
    lastCalculated: Date.now(),
    activeVersions: {
      voices: pins.voices,
      music: pins.music,
      sfx: pins.sfx,
    },
    mixedAudioUrl: mixerVersion.mixedAudioUrl,
  };

  return mixerState;
}

/**
 * Rehydrate the track-id-keyed volumes map the MixerPanel consumes from the
 * slot-id-keyed overrides the mixer version persists.
 */
function deriveVolumesByTrackId(
  tracks: MixerTrack[],
  overrides: Record<string, { volume?: number }>,
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const track of tracks) {
    const slotId = slotIdForTrack(track, voiceVersion, musicVersion, sfxVersion);
    if (!slotId) continue;
    const v = overrides[slotId]?.volume;
    if (typeof v === "number") map[track.id] = v;
  }
  return map;
}

/**
 * Resolve the stable slot id for a rendered track. Track ids encode the stream
 * version + ordinal (`voice-v3-0`, `sfx-v1-1`, `music-v2`); the slot id lives
 * on the matching content version's clip. This adapter is the bridge between
 * the two namespaces and is shared by PATCH /mixer and state derivation.
 */
export function slotIdForTrack(
  track: { id: string; type: "voice" | "music" | "soundfx" },
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null
): string | null {
  if (track.type === "voice") {
    const m = /^voice-[^-]+-(\d+)$/.exec(track.id);
    if (!m || !voiceVersion) return null;
    return voiceVersion.voiceTracks[Number(m[1])]?.slotId ?? null;
  }
  if (track.type === "music") {
    return musicVersion?.slotId ?? null;
  }
  if (track.type === "soundfx") {
    const m = /^sfx-[^-]+-(\d+)$/.exec(track.id);
    if (!m || !sfxVersion) return null;
    return sfxVersion.soundFxPrompts[Number(m[1])]?.slotId ?? null;
  }
  return null;
}

function collectVoiceTracks(
  voiceVersion: VoiceVersion,
  voiceVersionId: VersionId,
  tracks: MixerTrack[],
  audioDurations: Record<string, number>
): void {
  const hasAudio =
    voiceVersion.voiceTracks.some((t) => !!t.generatedUrl) ||
    (voiceVersion.generatedUrls && voiceVersion.generatedUrls.length > 0);
  if (!hasAudio) return;

  voiceVersion.voiceTracks.forEach((voiceTrack, index) => {
    const url =
      voiceTrack.generatedUrl || voiceVersion.generatedUrls?.[index];
    if (!url) return;

    const trackId = `voice-${voiceVersionId}-${index}`;
    const duration =
      voiceTrack.generatedDuration ?? estimateVoiceDuration(voiceTrack.text);

    tracks.push({
      id: trackId,
      url,
      type: "voice",
      label: voiceTrack.voice?.name || `Voice ${index + 1}`,
      duration,
      playAfter: voiceTrack.playAfter,
      overlap: voiceTrack.overlap,
      isConcurrent: voiceTrack.isConcurrent,
      metadata: {
        voiceId: voiceTrack.voice?.id,
        voiceProvider: voiceTrack.trackProvider || voiceTrack.voice?.provider,
        scriptText: voiceTrack.text,
      },
    });
    audioDurations[trackId] = duration;
  });
}

function collectMusicTrack(
  musicVersion: MusicVersion,
  musicVersionId: VersionId,
  tracks: MixerTrack[],
  audioDurations: Record<string, number>
): void {
  if (!musicVersion.generatedUrl) return;

  const trackId = `music-${musicVersionId}`;
  let label: string;
  if (musicVersion.provider === "custom") {
    label = musicVersion.musicPrompt || "Custom track";
  } else {
    const providerLabel =
      musicVersion.provider.charAt(0).toUpperCase() +
      musicVersion.provider.slice(1);
    const promptPreview = musicVersion.musicPrompt
      ? ` - ${musicVersion.musicPrompt.substring(0, 25)}${musicVersion.musicPrompt.length > 25 ? "..." : ""}`
      : "";
    label = `${providerLabel}${promptPreview}`;
  }

  tracks.push({
    id: trackId,
    url: musicVersion.generatedUrl,
    type: "music",
    label,
    duration: musicVersion.duration,
    metadata: {
      promptText: musicVersion.musicPrompt,
      source: musicVersion.provider,
    },
  });
  audioDurations[trackId] = musicVersion.duration;
}

function collectSfxTracks(
  sfxVersion: SfxVersion,
  sfxVersionId: VersionId,
  tracks: MixerTrack[],
  audioDurations: Record<string, number>
): void {
  if (sfxVersion.generatedUrls.length === 0) return;

  sfxVersion.soundFxPrompts.forEach((sfxPrompt, index) => {
    const url = sfxVersion.generatedUrls[index];
    if (!url) return;

    const trackId = `sfx-${sfxVersionId}-${index}`;
    tracks.push({
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
    });
    audioDurations[trackId] = sfxPrompt.duration || 3;
  });
}

// ============ Helpers ============

function emptyMixerState(): MixerState {
  return {
    tracks: [],
    volumes: {},
    calculatedTracks: [],
    totalDuration: 0,
    lastCalculated: Date.now(),
    activeVersions: { voices: null, music: null, sfx: null },
  };
}

/**
 * Word-count heuristic fallback. Applies only to legacy voice versions that
 * lack a measured `generatedDuration`. The backfill script is the primary
 * cure; this survives for stragglers that never get backfilled.
 */
function estimateVoiceDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5;
  const estimatedDuration = words / wordsPerSecond;
  return Math.max(1, estimatedDuration + 1);
}
