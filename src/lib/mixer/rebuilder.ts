/**
 * Mixer rebuild + read.
 *
 * Post-stage-6 data flow:
 *   - Every ad has a mixer version stream (`ad:{id}:mixer:...`). On the first
 *     read of an ad with content but no mixer stream, `bootstrapLegacyMixer`
 *     materializes `mixer:v1`: a draft for a new ad, a frozen take for a
 *     migrated legacy mixer.
 *   - The active mixer version's `pins` declare which voice/music/sfx
 *     versions this arrangement references. MixerState derives from pins,
 *     not from stream-level active pointers directly. That's what lets a
 *     frozen variant (Mandarin, girl-girl cast, pacing tweak) keep pointing
 *     at the content it was recorded against even after the user moves the
 *     stream-level actives elsewhere.
 *   - `rebuildMixer` is the mutation path: it ensures an active mixer draft
 *     exists (forking the frozen active if needed) and syncs that draft's
 *     pins to the current stream actives. Called from every send/freeze path (version freeze and
 *     update routes, mixer rebuild and remove-stream, generation jobs). It
 *     takes the ad lock itself, so callers must not hold it.
 *   - `getMixerState` is the read path: bootstrap + derive. Never mutates.
 *
 * Positioning itself is pure and lives in `derive-timeline.ts`; this module
 * only loads its inputs and persists the resolver cache.
 */

import {
  bootstrapLegacyMixer,
  loadPinnedWithSlotIds,
} from "@/lib/mixer/bootstrap";
import { deriveTimeline } from "@/lib/mixer/derive-timeline";
import {
  computePatchedVersion,
  planDraftSync,
  type MixerPatch,
  type PinnedVersions,
} from "@/lib/mixer/mixer-reconcile";
import { withAdLock } from "@/lib/redis/adLock";
import {
  createVersion,
  getActiveVersion,
  getAdMetadata,
  getAllVersionsWithData,
  getVersion,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import type { ResolvedTimeline } from "@/services/timelineResolver";
import {
  CachedResolverOutput,
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
 * Read mixer state. Bootstraps mixer:v1 on the first read of an ad without one. No mutation
 * beyond the bootstrap itself (no draft creation, no pin sync).
 */
export async function getMixerState(adId: string): Promise<MixerState | null> {
  await bootstrapLegacyMixer(adId);
  return deriveMixerStateFromActive(adId);
}

export type { MixerPatch };

/**
 * Apply a MixerPanel-style patch (volumes + mixedAudioUrl) to the active
 * mixer version. Forks a frozen active into a new draft first — render saves
 * are user actions and should never mutate a frozen take.
 *
 * Returns the fully-derived MixerState so the endpoint can echo it back.
 */
export async function applyMixerPatch(
  adId: string,
  patch: MixerPatch,
): Promise<MixerState | null> {
  await bootstrapLegacyMixer(adId);
  await ensureMixerDraftWithCurrentPins(adId);

  const activeId = await getActiveVersion(adId, "mixer");
  if (!activeId) return null;
  const active = await getVersion(adId, "mixer", activeId);
  if (!active || active.status !== "draft") return null;

  const pinned = await loadPinnedVersions(adId, active.pins);
  const updates = computePatchedVersion(active, pinned, patch);
  await updateVersion(adId, "mixer", activeId, updates);

  return deriveMixerStateFromActive(adId);
}

async function loadPinnedVersions(
  adId: string,
  pins: MixerVersion["pins"],
): Promise<PinnedVersions> {
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

      // Every pinned clip needs a slotId before the anchor graph is
      // reconciled against it — this is the one place every "send to mixer"
      // path funnels through.
      const pinned = await loadPinnedWithSlotIds(adId, currentPins);

      const plan = planDraftSync(
        activeVersion,
        activeId,
        currentPins,
        pinned,
        Date.now(),
      );
      if (plan.kind === "fork") {
        const draftId = await createVersion(adId, "mixer", plan.draft);
        await setActiveVersion(adId, "mixer", draftId);
      } else if (plan.kind === "update-draft") {
        await updateVersion(adId, "mixer", activeId, {
          pins: plan.pins,
          anchors: plan.anchors,
        } as Partial<MixerVersion>);
      }
    },
    { ttlSec: 15, timeoutMs: 8_000 },
  );
}

// ============ MixerState derivation ============

async function deriveMixerStateFromActive(
  adId: string,
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
  activeMixerId: VersionId,
): Promise<MixerState> {
  const { pins } = mixerVersion;
  const pinned = await loadPinnedVersions(adId, pins);

  // Brief drives two things in this pass: the resolver's over-budget
  // warnings + per-locale speedup cap, AND the mixer UI's soft-elastic
  // format horizon. Load once, pass through.
  const brief = (await getAdMetadata(adId))?.brief;

  const { tracks, calculatedTracks, volumes, resolved, usedCache } =
    deriveTimeline({
      pins,
      pinned,
      mixerVersion,
      formatDuration: brief?.adDuration,
      locale: brief?.selectedLanguage,
    });

  console.log(
    `  Built ${tracks.length} mixer tracks for ad ${adId} mixer=${activeMixerId}`,
  );

  // Lazy cache (re)write for frozen versions: one with no cache yet (it
  // predates stage 7), or one whose cache no longer matches the pinned clips
  // (a pinned draft line was regenerated at a different length), which gets
  // replaced. Best-effort: a failure here shouldn't block the read path.
  if (mixerVersion.status === "frozen" && !usedCache) {
    void writeResolverCache(adId, activeMixerId, resolved, tracks).catch(
      (err) =>
        console.warn(
          `[rebuilder] failed to cache resolver output for ${activeMixerId}:`,
          err,
        ),
    );
  }

  if (resolved.warnings.length > 0) {
    console.log(
      `  resolver warnings for ${activeMixerId}${usedCache ? " (cached)" : ""}:`,
      resolved.warnings,
    );
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

// ============ Resolver cache ============

/**
 * Persist resolver output on a frozen mixer version so future reads can
 * skip the resolve step. Runs out-of-band of the derive path; a failure
 * is a warning, not an error. The next read will just re-resolve.
 */
async function writeResolverCache(
  adId: string,
  mixerVersionId: VersionId,
  resolved: ResolvedTimeline,
  tracks: MixerTrack[],
): Promise<void> {
  const current = (await getVersion(
    adId,
    "mixer",
    mixerVersionId,
  )) as MixerVersion | null;
  // Called only when the derive didn't use the cache — none yet, or one
  // that no longer matches the pinned clips — so an existing one is stale
  // and gets replaced.
  if (!current || current.status !== "frozen") return;

  // Build a slot-id → track map so each resolved slot lands on its
  // correct track id. An earlier revision of this code had a buggy
  // `slotMatchesResolvedTrack` helper that just checked stream type
  // and always returned the first track of that type, collapsing all
  // voice/music/sfx slots onto a single id in the cache.
  const trackBySlot = new Map<SlotId, MixerTrack>();
  for (const t of tracks) {
    if (t.slotId) trackBySlot.set(t.slotId, t);
  }

  const cache: CachedResolverOutput = {
    calculatedTracks: resolved.tracks
      .map((r) => {
        const track = trackBySlot.get(r.slotId);
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
