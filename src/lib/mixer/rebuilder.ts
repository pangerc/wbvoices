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
  createVersion,
  getActiveVersion,
  getAllVersionsWithData,
  getVersion,
  setActiveVersion,
  updateVersion,
  getAdMetadata,
} from "@/lib/redis/versions";
import { withAdLock } from "@/lib/redis/adLock";
import { bootstrapLegacyMixer } from "@/lib/mixer/bootstrap";
import {
  Anchor,
  CachedResolverOutput,
  ClipOverrides,
  MixerPins,
  MixerState,
  MixerTrack,
  MixerVersion,
  MixerVersionSummary,
  MusicVersion,
  SfxVersion,
  SlotId,
  VersionId,
  VoiceVersion,
} from "@/types/versions";
import {
  resolveTimeline,
  type ResolvedTimeline,
  type SlotState,
} from "@/services/timelineResolver";

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
  /**
   * Slot-id-keyed anchor updates. Merges non-destructively — anchors not
   * referenced here are preserved.
   *
   * - Non-null value: overwrite with `origin: "user-edit"`. Stage-6
   *   precedence (user-edit wins on stream regen) kicks in automatically.
   *   Existing `layout` is preserved.
   * - `null` value: reset. Server re-derives from the stream-level seed
   *   (legacy `placement` / `playAfter` / etc.) and writes with
   *   `origin: "llm-seed"`. Used by the SFX panel's "Reset placement"
   *   action when the user wants to revert a mixer drag.
   */
  anchorUpdates?: Record<SlotId, Anchor | null>;
  /**
   * Slot-id-keyed trim updates. Writes onto `overrides[slotId].trim`.
   * Null clears the trim (clip plays full source). Values must satisfy
   * `0 <= start < end <= sourceDuration`; the server doesn't know the
   * source duration at write time, so the client is responsible for
   * clamping before sending.
   */
  trimUpdates?: Record<SlotId, { start: number; end: number } | null>;
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

  const nextOverrides: Record<SlotId, ClipOverrides> = {
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
  if (patch.trimUpdates) {
    for (const [slotId, trim] of Object.entries(patch.trimUpdates)) {
      if (trim === null) {
        // Clear trim; leave other overrides on the slot untouched.
        if (nextOverrides[slotId]) {
          const { trim: _trim, ...rest } = nextOverrides[slotId];
          if (Object.keys(rest).length > 0) {
            nextOverrides[slotId] = rest;
          } else {
            delete nextOverrides[slotId];
          }
        }
        continue;
      }
      if (
        !trim ||
        typeof trim.start !== "number" ||
        typeof trim.end !== "number" ||
        trim.start < 0 ||
        trim.end <= trim.start
      ) {
        continue;
      }
      nextOverrides[slotId] = { ...(nextOverrides[slotId] ?? {}), trim };
    }
  }

  const updates: Partial<MixerVersion> = { overrides: nextOverrides };
  if (typeof patch.mixedAudioUrl === "string") {
    updates.mixedAudioUrl = patch.mixedAudioUrl;
  }
  if (patch.anchorUpdates) {
    const nextAnchors: MixerVersion["anchors"] = { ...active.anchors };
    // For null-valued entries we lazily load the legacy-seed translators
    // so the common case (non-null drag updates) doesn't pay the import.
    const needsReseed = Object.values(patch.anchorUpdates).some((v) => v === null);
    const reseedHelpers = needsReseed
      ? await loadReseedHelpers()
      : null;

    for (const [slotId, anchor] of Object.entries(patch.anchorUpdates)) {
      if (anchor === null) {
        // Reset: re-derive from the pinned stream seed.
        const seed = reseedHelpers
          ? reseedHelpers.deriveSeed(slotId, pinned)
          : null;
        if (seed) {
          const existingLayout = nextAnchors[slotId]?.layout;
          nextAnchors[slotId] = {
            anchor: seed,
            origin: "llm-seed",
            ...(existingLayout ? { layout: existingLayout } : {}),
          };
        } else {
          // No recoverable stream seed — remove the override entirely; the
          // resolver will fall back to its system-default behavior.
          delete nextAnchors[slotId];
        }
        continue;
      }
      if (!anchor) continue;
      const existingLayout = nextAnchors[slotId]?.layout;
      nextAnchors[slotId] = {
        anchor,
        origin: "user-edit",
        ...(existingLayout ? { layout: existingLayout } : {}),
      };
    }
    updates.anchors = nextAnchors;
  }
  await updateVersion(adId, "mixer", activeId, updates);

  return deriveMixerStateFromActive(adId);
}

/**
 * Lazily-loaded helper for resetting an anchor back to its stream-level
 * seed. Called when `applyMixerPatch` receives a `null` value in
 * `anchorUpdates`. Lives inside a dynamic import because the anchor-
 * translation module pulls in the legacy `SoundFxPlacementIntent`
 * vocabulary, which isn't needed by the common drag-update path.
 */
async function loadReseedHelpers(): Promise<{
  deriveSeed: (
    slotId: SlotId,
    pinned: Awaited<ReturnType<typeof loadPinnedVersions>>
  ) => Anchor | null;
}> {
  const {
    anchorFromVoiceTrack,
    anchorFromSoundFxPrompt,
    anchorFromMusicVersion,
  } = await import("@/lib/tools/anchorTranslation");

  return {
    deriveSeed(slotId, pinned) {
      // Voice: lookup by slotId inside voiceTracks.
      if (pinned.voice) {
        const voiceSlotIds = pinned.voice.voiceTracks.map((t) => t.slotId);
        const vIndex = voiceSlotIds.indexOf(slotId);
        if (vIndex >= 0) {
          return (
            anchorFromVoiceTrack(
              pinned.voice.voiceTracks[vIndex],
              voiceSlotIds,
              vIndex
            ) ?? null
          );
        }
      }
      // Music: single slot.
      if (pinned.music && pinned.music.slotId === slotId) {
        return anchorFromMusicVersion(pinned.music);
      }
      // Sfx: lookup by slotId inside soundFxPrompts.
      if (pinned.sfx) {
        const sfxSlotIds = pinned.sfx.soundFxPrompts.map((p) => p.slotId);
        const sIndex = sfxSlotIds.indexOf(slotId);
        if (sIndex >= 0) {
          const voiceSlotIds = pinned.voice?.voiceTracks.map((t) => t.slotId) ?? [];
          return (
            anchorFromSoundFxPrompt(
              pinned.sfx.soundFxPrompts[sIndex],
              voiceSlotIds,
              sfxSlotIds,
              sIndex
            ) ?? null
          );
        }
      }
      return null;
    },
  };
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

  const overrides = mixerVersion.overrides ?? {};
  if (voiceVersion) {
    collectVoiceTracks(
      voiceVersion as VoiceVersion,
      pins.voices!,
      tracks,
      audioDurations,
      mixerVersion.anchors,
      overrides
    );
  }
  if (musicVersion) {
    collectMusicTrack(
      musicVersion as MusicVersion,
      pins.music!,
      tracks,
      audioDurations,
      mixerVersion.anchors,
      overrides
    );
  }
  if (sfxVersion) {
    collectSfxTracks(
      sfxVersion as SfxVersion,
      pins.sfx!,
      tracks,
      audioDurations,
      mixerVersion.anchors,
      overrides
    );
  }

  console.log(
    `  Built ${tracks.length} mixer tracks for ad ${adId} mixer=${activeMixerId}`
  );

  // Brief drives two things in this pass: the resolver's over-budget
  // warnings + per-locale speedup cap, AND the mixer UI's soft-elastic
  // format horizon. Load once, pass through.
  const brief = (await getAdMetadata(adId))?.brief;

  // Resolve timeline via the pure resolver (stage 7 swap).
  //
  // Reuse a cached resolver output on frozen mixer versions — anchors + pins
  // + overrides are all immutable on frozen versions, so the output is a
  // pure function of the version and is safe to memoize. Drafts always
  // resolve fresh because the anchor graph is still being authored.
  let resolved: ResolvedTimeline;
  let usedCache = false;
  if (
    mixerVersion.status === "frozen" &&
    mixerVersion.cachedResolverOutput &&
    cachedOutputMatches(mixerVersion.cachedResolverOutput, tracks)
  ) {
    resolved = projectCachedOutputThroughTracks(
      mixerVersion.cachedResolverOutput,
      tracks,
      voiceVersion as VoiceVersion | null,
      musicVersion as MusicVersion | null,
      sfxVersion as SfxVersion | null
    );
    usedCache = true;
  } else {
    resolved = resolveTimeline({
      slots: buildSlotStates(
        tracks,
        voiceVersion as VoiceVersion | null,
        musicVersion as MusicVersion | null,
        sfxVersion as SfxVersion | null,
        mixerVersion.overrides ?? {}
      ),
      anchors: mixerVersion.anchors,
      formatDuration: brief?.adDuration,
      locale: brief?.selectedLanguage,
    });

    // Lazy cache hydration for frozen versions that predate stage 7 (or any
    // frozen version whose cache was invalidated). Best-effort: a failure
    // here shouldn't block the read path.
    if (mixerVersion.status === "frozen") {
      void writeResolverCache(adId, activeMixerId, resolved, tracks).catch(
        (err) => console.warn(`[rebuilder] failed to cache resolver output for ${activeMixerId}:`, err)
      );
    }
  }

  if (resolved.warnings.length > 0) {
    console.log(
      `  resolver warnings for ${activeMixerId}${usedCache ? " (cached)" : ""}:`,
      resolved.warnings
    );
  }

  const calculatedTracks = mapResolvedToCalculatedTracks(
    resolved,
    tracks,
    voiceVersion as VoiceVersion | null,
    musicVersion as MusicVersion | null,
    sfxVersion as SfxVersion | null
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

  // Mixer version summaries — powers the take-list UI. Keeping the full
  // payload server-side; only id, status, timestamps, and label travel.
  const allMixerVersions = await getAllVersionsWithData(adId, "mixer");
  const mixerVersions: MixerVersionSummary[] = Object.entries(allMixerVersions)
    .map(([id, v]) => ({
      id,
      status: v.status,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      label: v.label,
      parentVersionId: v.parentVersionId,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);

  const mixerState: MixerState = {
    tracks,
    volumes,
    calculatedTracks,
    totalDuration: resolved.totalDuration,
    lastCalculated: Date.now(),
    activeVersions: {
      voices: pins.voices,
      music: pins.music,
      sfx: pins.sfx,
    },
    mixedAudioUrl: mixerVersion.mixedAudioUrl,
    formatDuration: brief?.adDuration,
    mixerActiveVersionId: activeMixerId,
    mixerActiveVersionStatus: mixerVersion.status,
    mixerVersions,
  };

  return mixerState;
}

// ============ Resolver adapter ============

/**
 * Build `SlotState[]` — the resolver's input shape — from the mixer panel's
 * track list plus pinned stream versions. Each track maps to exactly one
 * slot; slot ids come from the content versions, trim comes from mixer
 * overrides.
 */
function buildSlotStates(
  tracks: MixerTrack[],
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null,
  overrides: Record<SlotId, ClipOverrides>
): SlotState[] {
  const slots: SlotState[] = [];
  for (const track of tracks) {
    const slotId = slotIdForTrack(track, voiceVersion, musicVersion, sfxVersion);
    if (!slotId) continue; // Tracks without slot ids can't be resolved; skipped.
    const sourceDuration = track.duration ?? 0;
    const trim = overrides[slotId]?.trim;
    slots.push({
      slotId,
      type: track.type,
      sourceDuration,
      trim,
    });
  }
  return slots;
}

/**
 * Map resolver output back to the track-id-keyed `calculatedTracks` shape the
 * MixerPanel consumes today. Orphan slots (resolver returned nothing) are
 * silently dropped — they're already warned upstream via `resolved.warnings`.
 */
function mapResolvedToCalculatedTracks(
  resolved: ResolvedTimeline,
  tracks: MixerTrack[],
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null
): MixerState["calculatedTracks"] {
  const bySlot = new Map(resolved.tracks.map((t) => [t.slotId, t]));
  const out: MixerState["calculatedTracks"] = [];
  for (const track of tracks) {
    const slotId = slotIdForTrack(track, voiceVersion, musicVersion, sfxVersion);
    if (!slotId) continue;
    const r = bySlot.get(slotId);
    if (!r) continue;
    out.push({
      id: track.id,
      startTime: r.startTime,
      duration: r.duration,
      type: track.type,
    });
  }
  return out;
}

/**
 * Persist resolver output on a frozen mixer version so future reads can
 * skip the resolve step. Runs out-of-band of the derive path; a failure
 * is a warning, not an error — next read will just re-resolve.
 */
async function writeResolverCache(
  adId: string,
  mixerVersionId: VersionId,
  resolved: ResolvedTimeline,
  tracks: MixerTrack[]
): Promise<void> {
  // Re-load the version to avoid trampling concurrent mutations (e.g. a
  // freeze endpoint writing cachedResolverOutput itself). Only write if
  // the cache is still empty.
  const current = (await getVersion(adId, "mixer", mixerVersionId)) as MixerVersion | null;
  if (!current || current.status !== "frozen" || current.cachedResolverOutput) return;

  const cache: CachedResolverOutput = {
    calculatedTracks: resolved.tracks
      .map((r) => {
        const track = tracks.find((t) => slotMatchesResolvedTrack(t, r.slotId));
        if (!track) return null;
        return {
          id: track.id,
          startTime: r.startTime,
          duration: r.duration,
          type: track.type,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x),
    totalDuration: resolved.totalDuration,
    calculatedAt: Date.now(),
  };
  await updateVersion(adId, "mixer", mixerVersionId, {
    cachedResolverOutput: cache,
  } as Partial<MixerVersion>);
}

function slotMatchesResolvedTrack(track: MixerTrack, slotId: SlotId): boolean {
  // Used only inside writeResolverCache, where we already know the pinned
  // versions are active. Fast string prefix check suffices because ids carry
  // the stream marker and the cache is track-id keyed.
  return (
    (track.type === "voice" && track.id.startsWith("voice-")) ||
    (track.type === "music" && track.id.startsWith("music-")) ||
    (track.type === "soundfx" && track.id.startsWith("sfx-"))
  ) && !!slotId;
}

/**
 * Decide whether a cached resolver output is still usable. We only check
 * cardinality + track-id set equality — if the pinned versions moved or a
 * slot was added/removed, the cache is stale and we recompute.
 */
function cachedOutputMatches(
  cache: CachedResolverOutput,
  tracks: MixerTrack[]
): boolean {
  if (cache.calculatedTracks.length !== tracks.length) return false;
  const ids = new Set(tracks.map((t) => t.id));
  return cache.calculatedTracks.every((ct) => ids.has(ct.id));
}

/**
 * Reconstruct a `ResolvedTimeline` from the cached flat shape so the rest
 * of the derive path can be uniform. `warnings` and `voiceActiveIntervals`
 * are left empty because the cache is the post-resolution view.
 */
function projectCachedOutputThroughTracks(
  cache: CachedResolverOutput,
  tracks: MixerTrack[],
  voiceVersion: VoiceVersion | null,
  musicVersion: MusicVersion | null,
  sfxVersion: SfxVersion | null
): ResolvedTimeline {
  const bySlot: ResolvedTimeline["tracks"] = [];
  for (const ct of cache.calculatedTracks) {
    const track = tracks.find((t) => t.id === ct.id);
    if (!track) continue;
    const slotId = slotIdForTrack(track, voiceVersion, musicVersion, sfxVersion);
    if (!slotId) continue;
    bySlot.push({
      slotId,
      type: ct.type,
      startTime: ct.startTime,
      duration: ct.duration,
      resolvedFrom: null,
    });
  }
  return {
    tracks: bySlot,
    totalDuration: cache.totalDuration,
    warnings: [],
    voiceActiveIntervals: bySlot
      .filter((t) => t.type === "voice")
      .map((t) => ({ start: t.startTime, end: t.startTime + t.duration }))
      .sort((a, b) => a.start - b.start),
  };
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

/**
 * Extract the referenced slot id from an anchor, or undefined if the
 * anchor is absolute / missing. Powers the client's cycle-prevention
 * check in `anchorFromDrop`.
 */
function refSlotFromAnchor(anchor?: Anchor): SlotId | undefined {
  if (!anchor) return undefined;
  if (anchor.kind === "absolute") return undefined;
  return anchor.slotId;
}

function collectVoiceTracks(
  voiceVersion: VoiceVersion,
  voiceVersionId: VersionId,
  tracks: MixerTrack[],
  audioDurations: Record<string, number>,
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>
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
      slotId: voiceTrack.slotId,
      anchorOrigin: voiceTrack.slotId ? anchors[voiceTrack.slotId]?.origin : undefined,
      anchorRefSlotId: voiceTrack.slotId
        ? refSlotFromAnchor(anchors[voiceTrack.slotId]?.anchor)
        : undefined,
      trim: voiceTrack.slotId ? overrides[voiceTrack.slotId]?.trim : undefined,
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
  audioDurations: Record<string, number>,
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>
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
    slotId: musicVersion.slotId,
    anchorOrigin: musicVersion.slotId ? anchors[musicVersion.slotId]?.origin : undefined,
    anchorRefSlotId: musicVersion.slotId
      ? refSlotFromAnchor(anchors[musicVersion.slotId]?.anchor)
      : undefined,
    trim: musicVersion.slotId ? overrides[musicVersion.slotId]?.trim : undefined,
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
  audioDurations: Record<string, number>,
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>
): void {
  if (sfxVersion.generatedUrls.length === 0) return;

  sfxVersion.soundFxPrompts.forEach((sfxPrompt, index) => {
    const url = sfxVersion.generatedUrls[index];
    if (!url) return;

    const trackId = `sfx-${sfxVersionId}-${index}`;
    tracks.push({
      id: trackId,
      slotId: sfxPrompt.slotId,
      anchorOrigin: sfxPrompt.slotId ? anchors[sfxPrompt.slotId]?.origin : undefined,
      anchorRefSlotId: sfxPrompt.slotId
        ? refSlotFromAnchor(anchors[sfxPrompt.slotId]?.anchor)
        : undefined,
      trim: sfxPrompt.slotId ? overrides[sfxPrompt.slotId]?.trim : undefined,
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
