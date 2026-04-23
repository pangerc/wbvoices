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
 * opening the same legacy ad can't both race to mint `mixer:v1`.
 *
 * In-flight drafts: if a content stream's active version is still a draft
 * at bootstrap time (user was mid-iteration at cutover), the draft is
 * force-frozen with a `bootstrappedAt` flag and used as the pin. Rejected
 * alternative: treating the draft as a seed for a new mixer draft — rejected
 * because bootstrap must produce a coherent frozen+active mixer version,
 * otherwise the UI has nothing to render.
 *
 * Slot-id backfill: stream versions predating stage 2 lack `slotId`. This
 * module fills them in on the fly so the anchor graph has stable referents.
 * This is the only site that mutates frozen stream versions — treated as an
 * idempotent migration write, not a model violation.
 */

import { getRedisV3 } from "@/lib/redis-v3";
import {
  AD_KEYS,
  createVersion,
  getActiveVersion,
  getVersion,
  listVersions,
  setActiveVersion,
  updateVersion,
} from "@/lib/redis/versions";
import { withAdLock } from "@/lib/redis/adLock";
import {
  anchorFromMusicVersion,
  anchorFromSoundFxPrompt,
  anchorFromVoiceTrack,
} from "@/lib/tools/anchorTranslation";
import type {
  Anchor,
  AnchorEntry,
  MixerPins,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  SlotId,
  VersionId,
  VoiceVersion,
} from "@/types/versions";

export interface BootstrapResult {
  /** True if this call created mixer:v1, false if it was already present. */
  created: boolean;
  /** The active mixer version id after bootstrap (always set on success). */
  versionId: VersionId | null;
  /** Version ids force-frozen during bootstrap, by stream. */
  forceFrozen: {
    voices?: VersionId;
    music?: VersionId;
    sfx?: VersionId;
  };
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
  adId: string
): Promise<BootstrapResult> {
  const existing = await listVersions(adId, "mixer");
  if (existing.length > 0) {
    const active = await getActiveVersion(adId, "mixer");
    return {
      created: false,
      versionId: active,
      forceFrozen: {},
      legacyKeyDeleted: false,
    };
  }

  return withAdLock(
    adId,
    () => bootstrapLocked(adId),
    { ttlSec: 30, timeoutMs: 10_000 }
  );
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
      forceFrozen: {},
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
      forceFrozen: {},
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

  // Force-freeze any active draft so the pin references an immutable version.
  // `bootstrappedAt` tags the freeze so audit can tell "user was iterating at
  // cutover" apart from a normal freeze. Apply changes to the in-memory
  // version too, because the slot-id backfill below writes the full version
  // back and would otherwise revert status → "draft".
  const forceFrozen: BootstrapResult["forceFrozen"] = {};
  const bootstrappedAt = Date.now();
  if (voiceVersion && voiceVersion.status === "draft" && activeVoiceId) {
    (voiceVersion as VoiceVersion & { bootstrappedAt?: number }).status = "frozen";
    (voiceVersion as VoiceVersion & { bootstrappedAt?: number }).bootstrappedAt = bootstrappedAt;
    await updateVersion(adId, "voices", activeVoiceId, {
      status: "frozen",
      bootstrappedAt,
    } as Partial<VoiceVersion> & { bootstrappedAt: number });
    forceFrozen.voices = activeVoiceId;
  }
  if (musicVersion && musicVersion.status === "draft" && activeMusicId) {
    (musicVersion as MusicVersion & { bootstrappedAt?: number }).status = "frozen";
    (musicVersion as MusicVersion & { bootstrappedAt?: number }).bootstrappedAt = bootstrappedAt;
    await updateVersion(adId, "music", activeMusicId, {
      status: "frozen",
      bootstrappedAt,
    } as Partial<MusicVersion> & { bootstrappedAt: number });
    forceFrozen.music = activeMusicId;
  }
  if (sfxVersion && sfxVersion.status === "draft" && activeSfxId) {
    (sfxVersion as SfxVersion & { bootstrappedAt?: number }).status = "frozen";
    (sfxVersion as SfxVersion & { bootstrappedAt?: number }).bootstrappedAt = bootstrappedAt;
    await updateVersion(adId, "sfx", activeSfxId, {
      status: "frozen",
      bootstrappedAt,
    } as Partial<SfxVersion> & { bootstrappedAt: number });
    forceFrozen.sfx = activeSfxId;
  }

  // Slot-id backfill: older stream versions lack slotIds. Fill missing ones
  // in place so the anchor graph has stable referents. Writes are idempotent —
  // tracks that already have a slotId keep it.
  const voiceSlotIds = await ensureVoiceSlotIds(
    adId,
    activeVoiceId,
    voiceVersion as VoiceVersion | null
  );
  const sfxSlotIds = await ensureSfxSlotIds(
    adId,
    activeSfxId,
    sfxVersion as SfxVersion | null
  );
  const musicSlotId = await ensureMusicSlotId(
    adId,
    activeMusicId,
    musicVersion as MusicVersion | null
  );

  // Build the anchor graph, keyed by slot id.
  const anchors: Record<SlotId, AnchorEntry> = {};

  if (voiceVersion && voiceSlotIds.length > 0) {
    const vv = voiceVersion as VoiceVersion;
    vv.voiceTracks.forEach((track, index) => {
      const slotId = voiceSlotIds[index];
      if (!slotId) return;
      const anchor = anchorFromVoiceTrack(track, voiceSlotIds, index);
      if (anchor) {
        anchors[slotId] = { anchor, origin: "llm-seed" };
      }
    });
  }

  if (sfxVersion && sfxSlotIds.length > 0) {
    const sv = sfxVersion as SfxVersion;
    sv.soundFxPrompts.forEach((prompt, index) => {
      const slotId = sfxSlotIds[index];
      if (!slotId) return;
      const anchor = anchorFromSoundFxPrompt(prompt, voiceSlotIds, sfxSlotIds, index);
      if (anchor) {
        anchors[slotId] = { anchor, origin: "llm-seed" };
      }
    });
  }

  if (musicVersion && musicSlotId) {
    const anchor: Anchor = anchorFromMusicVersion(musicVersion as MusicVersion);
    anchors[musicSlotId] = { anchor, origin: "llm-seed" };
  }

  const pins: MixerPins = {
    voices: activeVoiceId ?? null,
    music: activeMusicId ?? null,
    sfx: activeSfxId ?? null,
  };

  const mixerV1: MixerVersion = {
    anchors,
    pins,
    createdAt: bootstrappedAt,
    createdBy: "llm", // bootstrap materializes what the LLM already authored
    status: "frozen",
    bootstrappedAt,
  };

  const versionId = await createVersion(adId, "mixer", mixerV1);
  await setActiveVersion(adId, "mixer", versionId);

  // Retire the pre-stage-6 blob. On subsequent bootstrap attempts the early
  // short-circuit returns instead of ever reaching this line.
  const legacyKey = AD_KEYS.mixer(adId);
  const deleted = await redis.del(legacyKey);

  console.log(
    `[mixer-bootstrap] adId=${adId} versionId=${versionId} forceFrozen=${JSON.stringify(forceFrozen)} legacyDeleted=${deleted > 0}`
  );

  return {
    created: true,
    versionId,
    forceFrozen,
    legacyKeyDeleted: deleted > 0,
  };
}

// ============ Slot-id backfill helpers ============

function mintSlotId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureVoiceSlotIds(
  adId: string,
  versionId: VersionId | null,
  voiceVersion: VoiceVersion | null
): Promise<Array<string | undefined>> {
  if (!voiceVersion || !versionId) return [];
  const slotIds: Array<string | undefined> = [];
  let mutated = false;
  const updated: VoiceVersion = {
    ...voiceVersion,
    voiceTracks: voiceVersion.voiceTracks.map((track) => {
      if (track.slotId) {
        slotIds.push(track.slotId);
        return track;
      }
      const fresh = mintSlotId();
      slotIds.push(fresh);
      mutated = true;
      return { ...track, slotId: fresh };
    }),
  };
  if (mutated) {
    await updateVersion(adId, "voices", versionId, updated);
  }
  return slotIds;
}

async function ensureSfxSlotIds(
  adId: string,
  versionId: VersionId | null,
  sfxVersion: SfxVersion | null
): Promise<Array<string | undefined>> {
  if (!sfxVersion || !versionId) return [];
  const slotIds: Array<string | undefined> = [];
  let mutated = false;
  const updated: SfxVersion = {
    ...sfxVersion,
    soundFxPrompts: sfxVersion.soundFxPrompts.map((prompt) => {
      if (prompt.slotId) {
        slotIds.push(prompt.slotId);
        return prompt;
      }
      const fresh = mintSlotId();
      slotIds.push(fresh);
      mutated = true;
      return { ...prompt, slotId: fresh };
    }),
  };
  if (mutated) {
    await updateVersion(adId, "sfx", versionId, updated);
  }
  return slotIds;
}

async function ensureMusicSlotId(
  adId: string,
  versionId: VersionId | null,
  musicVersion: MusicVersion | null
): Promise<string | null> {
  if (!musicVersion || !versionId) return null;
  if (musicVersion.slotId) return musicVersion.slotId;
  const fresh = mintSlotId();
  await updateVersion(adId, "music", versionId, { slotId: fresh });
  return fresh;
}
