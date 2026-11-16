/**
 * Lazy mixer bootstrap (stage 6).
 *
 * Materializes `mixer:v1` for an ad the first time a consumer asks for mixer
 * state. Derives the anchor graph from the ad's current voice/music/sfx
 * active versions using the legacy-anchor translators, tags every entry
 * with `origin: "llm-seed"`, and deletes the pre-stage-6 single-key
 * `ad:{adId}:mixer` blob on success.
 *
 * Serialization: the whole sequence runs under `withAdLock` so two tabs
 * opening the same ad (legacy or new) can't both race to mint `mixer:v1`.
 *
 * Stream-version status is preserved. Earlier revisions of this file
 * force-froze active drafts at bootstrap time on the premise that mixer:v1
 * must pin immutable content. That premise was wrong — it stole draft
 * editability from freshly-generated ads. The correct reproducibility
 * contract lives on `freezeExistingDraft` (stream iterations freeze the
 * outgoing draft) and on future variant-fork (must freeze pinned drafts
 * at fork time). A new ad's mixer:v1 is a draft (its pins follow the stream
 * actives on every rebuild). Only a migrated legacy ad's mixer:v1 is frozen;
 * a frozen mixer:v1 pinning a stream draft is an accepted soft invariant:
 * the pin is stable in practice until the user iterates, at which point the
 * old draft is frozen in place and the pin retroactively hardens.
 *
 * Slot-id backfill: stream versions predating stage 2 lack `slotId`. This
 * module fills them in on the fly so the anchor graph has stable referents.
 * This is an idempotent additive write — it only adds slotId, never
 * changes semantic content.
 */

import {
  buildSeedAnchors,
  mintSlotId,
  type PinnedVersions,
} from "@/lib/mixer/mixer-reconcile";
import { getRedisV3 } from "@/lib/redis-v3";
import { withAdLock } from "@/lib/redis/adLock";
import {
  AD_KEYS,
  createVersion,
  getActiveVersion,
  getVersion,
  listVersions,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import type {
  MixerPins,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
  VoiceVersion,
} from "@/types/versions";

export interface BootstrapResult {
  /** True if this call created mixer:v1, false if it was already present. */
  created: boolean;
  /** The active mixer version id after bootstrap (always set on success). */
  versionId: VersionId | null;
  /** Legacy `ad:{id}:mixer` key deleted as part of this call. */
  legacyKeyDeleted: boolean;
}

/**
 * Ensure the mixer stream is populated. Idempotent: if `mixer:versions`
 * already has entries, this is a no-op returning the current active id.
 *
 * Fast path skips the lock entirely on already-bootstrapped ads — bootstrap
 * is on the hot read path (every GET /mixer), so we avoid lock churn on the
 * common case. The slow path re-checks inside the lock to handle a concurrent
 * bootstrap that landed between our list read and our lock acquisition.
 */
export async function bootstrapLegacyMixer(
  adId: string,
): Promise<BootstrapResult> {
  const existing = await listVersions(adId, "mixer");
  if (existing.length > 0) {
    const active = await getActiveVersion(adId, "mixer");
    return {
      created: false,
      versionId: active,
      legacyKeyDeleted: false,
    };
  }

  return withAdLock(adId, () => bootstrapLocked(adId), {
    ttlSec: 30,
    timeoutMs: 10_000,
  });
}

async function bootstrapLocked(adId: string): Promise<BootstrapResult> {
  const redis = getRedisV3();

  // Short-circuit: already bootstrapped.
  const existingVersions = await listVersions(adId, "mixer");
  if (existingVersions.length > 0) {
    const active = await getActiveVersion(adId, "mixer");
    return {
      created: false,
      versionId: active,
      legacyKeyDeleted: false,
    };
  }

  // Load the ad's current content-stream actives. Missing streams are fine —
  // the mixer version simply pins null for those.
  const activeVoiceId = await getActiveVersion(adId, "voices");
  const activeMusicId = await getActiveVersion(adId, "music");
  const activeSfxId = await getActiveVersion(adId, "sfx");

  // Truly-empty ad: no content in any stream. Don't mint a mixer:v1 with all
  // null pins — it would be spurious state for ads that never reached content
  // generation. Bootstrap runs again the next time content exists.
  if (!activeVoiceId && !activeMusicId && !activeSfxId) {
    return {
      created: false,
      versionId: null,
      legacyKeyDeleted: false,
    };
  }

  const voiceVersion = activeVoiceId
    ? await getVersion(adId, "voices", activeVoiceId)
    : null;
  const musicVersion = activeMusicId
    ? await getVersion(adId, "music", activeMusicId)
    : null;
  const sfxVersion = activeSfxId
    ? await getVersion(adId, "sfx", activeSfxId)
    : null;

  // Stream versions keep their current status. If they were drafts, they
  // stay drafts — `freezeExistingDraft` (in tool-calling implementations)
  // freezes the outgoing draft lazily when the next iteration is created,
  // which is also the moment a pin would start mutating under mixer:v1's
  // feet. Bootstrap doesn't need to do it preemptively.

  // Slot-id backfill: older stream versions lack slotIds. Fill missing ones
  // in place so the anchor graph has stable referents. Writes are idempotent —
  // tracks that already have a slotId keep it.
  const voiceSlots = await ensureVoiceSlotIds(
    adId,
    activeVoiceId,
    voiceVersion as VoiceVersion | null,
  );
  const sfxSlots = await ensureSfxSlotIds(
    adId,
    activeSfxId,
    sfxVersion as SfxVersion | null,
  );
  const musicSlotId = await ensureMusicSlotId(
    adId,
    activeMusicId,
    musicVersion as MusicVersion | null,
  );

  // Build the anchor graph, keyed by slot id.
  const anchors = buildSeedAnchors({
    voice: voiceSlots,
    music: musicVersion
      ? { ...(musicVersion as MusicVersion), slotId: musicSlotId ?? undefined }
      : null,
    sfx: sfxSlots,
  });

  const pins: MixerPins = {
    voices: activeVoiceId ?? null,
    music: activeMusicId ?? null,
    sfx: activeSfxId ?? null,
  };

  // A legacy ad's mix is migrated as a frozen take: the first edit forks it,
  // so the migrated arrangement stays in the take list. A new ad's first mix
  // is the take the user goes on to edit, so it is a draft — frozen, the
  // rebuild that follows would fork it into a second take straight away.
  const legacyKey = AD_KEYS.mixer(adId);
  const isLegacy = (await redis.exists(legacyKey)) > 0;

  const mixerV1: MixerVersion = {
    anchors,
    pins,
    createdAt: Date.now(),
    createdBy: "llm", // bootstrap materializes what the LLM already authored
    status: isLegacy ? "frozen" : "draft",
  };

  const versionId = await createVersion(adId, "mixer", mixerV1);
  await setActiveVersion(adId, "mixer", versionId);

  // Retire the pre-stage-6 blob. On subsequent bootstrap attempts the early
  // short-circuit returns instead of ever reaching this line.
  const deleted = await redis.del(legacyKey);

  console.log(
    `[mixer-bootstrap] adId=${adId} versionId=${versionId} legacyDeleted=${deleted > 0}`,
  );

  return {
    created: true,
    versionId,
    legacyKeyDeleted: deleted > 0,
  };
}

// ============ Slot-id backfill helpers ============

/**
 * Give every item lacking a `slotId` a freshly minted one. Items that already
 * carry a slotId are returned as-is (same reference). `mutated` reports
 * whether anything needs persisting.
 */
export function assignMissingSlotIds<T extends { slotId?: string }>(
  items: T[],
  mint: () => string = mintSlotId,
): { items: T[]; mutated: boolean } {
  let mutated = false;
  const next = items.map((item) => {
    if (item.slotId) return item;
    mutated = true;
    return { ...item, slotId: mint() };
  });
  return { items: next, mutated };
}

/** Returns the voice version with slotIds filled in (persisted if changed). */
async function ensureVoiceSlotIds(
  adId: string,
  versionId: VersionId | null,
  voiceVersion: VoiceVersion | null,
): Promise<VoiceVersion | null> {
  if (!voiceVersion || !versionId) return null;
  const { items, mutated } = assignMissingSlotIds(voiceVersion.voiceTracks);
  const updated: VoiceVersion = { ...voiceVersion, voiceTracks: items };
  if (mutated) {
    await updateVersion(adId, "voices", versionId, updated);
  }
  return updated;
}

/** Returns the sfx version with slotIds filled in (persisted if changed). */
async function ensureSfxSlotIds(
  adId: string,
  versionId: VersionId | null,
  sfxVersion: SfxVersion | null,
): Promise<SfxVersion | null> {
  if (!sfxVersion || !versionId) return null;
  const { items, mutated } = assignMissingSlotIds(sfxVersion.soundFxPrompts);
  const updated: SfxVersion = { ...sfxVersion, soundFxPrompts: items };
  if (mutated) {
    await updateVersion(adId, "sfx", versionId, updated);
  }
  return updated;
}

export async function ensureMusicSlotId(
  adId: string,
  versionId: VersionId | null,
  musicVersion: MusicVersion | null,
): Promise<string | null> {
  if (!musicVersion || !versionId) return null;
  if (musicVersion.slotId) return musicVersion.slotId;
  const fresh = mintSlotId();
  await updateVersion(adId, "music", versionId, { slotId: fresh });
  return fresh;
}

/**
 * Load the content versions `pins` point at, backfilling any missing slotId
 * (persisted) along the way.
 *
 * Tracks created outside the LLM path — hand-added voice tracks and SFX
 * prompts, custom music uploads, versions predating slot ids — have no
 * slotId. Without one, `slotIdForTrack` can't resolve the track, so the
 * rebuild silently drops it from the timeline and the mix (AAC-188 was the
 * music instance of this). The bootstrap backfill only runs once per ad, so
 * this runs on every rebuild. Idempotent: clips that already carry a slotId
 * keep it.
 */
export async function loadPinnedWithSlotIds(
  adId: string,
  pins: MixerPins,
): Promise<PinnedVersions> {
  const voice = pins.voices
    ? ((await getVersion(adId, "voices", pins.voices)) as VoiceVersion | null)
    : null;
  const music = pins.music
    ? ((await getVersion(adId, "music", pins.music)) as MusicVersion | null)
    : null;
  const sfx = pins.sfx
    ? ((await getVersion(adId, "sfx", pins.sfx)) as SfxVersion | null)
    : null;

  const musicSlotId = await ensureMusicSlotId(adId, pins.music, music);
  return {
    voice: await ensureVoiceSlotIds(adId, pins.voices, voice),
    music: music ? { ...music, slotId: musicSlotId ?? undefined } : null,
    sfx: await ensureSfxSlotIds(adId, pins.sfx, sfx),
  };
}
