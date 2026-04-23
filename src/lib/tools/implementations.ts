import {
  SearchVoicesParams,
  SearchVoicesResult,
  CreateVoiceDraftParams,
  CreateMusicDraftParams,
  CreateSfxDraftParams,
  ReadAdStateParams,
  SetAdTitleParams,
  SetAdTitleResult,
  DraftCreationResult,
  ReadAdStateResult,
  VoiceHistorySummary,
  ParentVersionRef,
  SlotReconciliation,
  AnchorInput,
} from "./types";
import { reconcileSlots } from "./slotReconciliation";
import {
  translateAnchorInput,
  type OrdinalRefs,
} from "./anchorTranslation";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import {
  createVersion,
  listVersions,
  getVersion,
  getAllVersionsWithData,
  setAdMetadata,
  getAdMetadata,
  updateVersion,
  getActiveVersion,
} from "@/lib/redis/versions";
import { withAdLock } from "@/lib/redis/adLock";
import type { Language, Provider, Voice, MusicProvider, SoundFxPlacementIntent } from "@/types";
import type {
  Anchor,
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
  StreamType,
} from "@/types/versions";

/**
 * Freeze any existing draft in a stream before creating a new one.
 * This ensures only one draft exists at a time.
 */
async function freezeExistingDraft(adId: string, streamType: StreamType): Promise<void> {
  const versions = await listVersions(adId, streamType);
  for (const vId of versions) {
    const version = await getVersion(adId, streamType, vId);
    if (version?.status === "draft") {
      await updateVersion(adId, streamType, vId, { status: "frozen" });
      console.log(`🧊 Froze ${streamType} draft ${vId} for ad ${adId}`);
      // No break - freeze ALL existing drafts to ensure only one draft exists
    }
  }
}

/**
 * Resolve the parent version id for a new draft.
 *
 * - explicit VersionId: use it (caller is forking a specific version).
 * - explicit null: no parent — fresh slate, fresh slot ids.
 * - undefined (default): auto-infer — the most recent frozen version in the stream,
 *   or null if none exists (first-ever draft in this stream).
 *
 * Call this AFTER `freezeExistingDraft` so the previous draft is included in the
 * "most recent frozen" lookup.
 */
async function resolveParentVersionId(
  adId: string,
  streamType: StreamType,
  explicit: ParentVersionRef
): Promise<VersionId | null> {
  if (explicit === null) return null;
  if (typeof explicit === "string") return explicit;

  const versions = await listVersions(adId, streamType);
  for (let i = versions.length - 1; i >= 0; i--) {
    const vId = versions[i];
    const data = await getVersion(adId, streamType, vId);
    if (data?.status === "frozen") return vId;
  }
  return null;
}

/**
 * Helper to extract the parent slot id array for a given stream.
 * Returns null when there's no parent version or the stream has no slot concept here.
 */
async function loadParentSlotIds(
  adId: string,
  streamType: "voices" | "sfx",
  parentVersionId: VersionId | null
): Promise<Array<string | undefined> | null> {
  if (!parentVersionId) return null;
  const data = await getVersion(adId, streamType, parentVersionId);
  if (!data) return null;
  if (streamType === "voices") {
    return (data as VoiceVersion).voiceTracks.map((t) => t.slotId);
  }
  // sfx
  return (data as SfxVersion).soundFxPrompts.map((p) => p.slotId);
}

/**
 * Build the OrdinalRefs lookup table used to translate LLM ordinal-form anchor
 * inputs ("voice-0", "sfx-2", "music") into slot-id-form Anchors.
 *
 * Uses currently-active stream versions for cross-stream refs (sfx-to-voice,
 * music-to-voice). Callers pass their own draft's slot ids as `overrides` so
 * intra-stream refs ("voice-0" within a new voice draft) resolve correctly.
 */
async function loadOrdinalRefs(
  adId: string,
  overrides: Partial<OrdinalRefs>
): Promise<OrdinalRefs> {
  const refs: OrdinalRefs = { ...overrides };

  // Voice refs — for cross-stream anchors (sfx/music referencing voices).
  if (!refs.voices) {
    const activeVoiceId = await getActiveVersion(adId, "voices");
    if (activeVoiceId) {
      const voiceVersion = (await getVersion(
        adId,
        "voices",
        activeVoiceId
      )) as VoiceVersion | null;
      if (voiceVersion) {
        refs.voices = voiceVersion.voiceTracks.map((t) => t.slotId);
      }
    }
  }

  // SFX refs — rare cross-stream use; only loaded when explicitly requested.
  if (!refs.sfx) {
    const activeSfxId = await getActiveVersion(adId, "sfx");
    if (activeSfxId) {
      const sfxVersion = (await getVersion(
        adId,
        "sfx",
        activeSfxId
      )) as SfxVersion | null;
      if (sfxVersion) {
        refs.sfx = sfxVersion.soundFxPrompts.map((p) => p.slotId);
      }
    }
  }

  // Music refs — at most one slot id.
  if (!refs.music) {
    const activeMusicId = await getActiveVersion(adId, "music");
    if (activeMusicId) {
      const musicVersion = (await getVersion(
        adId,
        "music",
        activeMusicId
      )) as MusicVersion | null;
      if (musicVersion?.slotId) refs.music = musicVersion.slotId;
    }
  }

  return refs;
}

/**
 * Attempt to translate an LLM-supplied AnchorInput to slot-id form. Silently
 * returns undefined when the ordinal reference can't be resolved — caller's
 * legacy fields remain the source of truth for positioning.
 */
function safeTranslateAnchor(
  input: AnchorInput | undefined,
  refs: OrdinalRefs
): Anchor | undefined {
  if (!input) return undefined;
  const translated = translateAnchorInput(input, refs);
  if (!translated) {
    console.warn(
      `[anchor-translate] Unresolvable trackRef in anchor input: ${JSON.stringify(input)}`
    );
    return undefined;
  }
  return translated;
}

/**
 * Search voices from the voice catalogue
 */
export async function searchVoices(
  params: SearchVoicesParams
): Promise<SearchVoicesResult> {
  const { provider, language, gender, accent, count = 10 } = params;

  // Get voices from catalogue for the specified provider
  const allVoices = await voiceCatalogue.getVoicesForProvider(
    provider as Provider,
    language as Language,
    accent,
    true // requireApproval
  );

  // Filter by gender if specified
  const filtered = gender
    ? allVoices.filter((v) => v.gender.toLowerCase() === gender.toLowerCase())
    : allVoices;

  // Take first N voices (no style filtering - LLM picks based on personality descriptions)
  const selected = filtered.slice(0, count);

  // Enrich with metadata
  const enriched = selected.map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    style: v.styles?.join(", ") || v.personality,
    provider: v.provider,
  }));

  return {
    voices: enriched,
    count: enriched.length,
  };
}

/**
 * Create voice draft in Redis.
 *
 * Wrapped in a per-ad lock so concurrent LLM calls on the same ad can't each
 * see "no draft" and then both create one — the `freezeExistingDraft` →
 * `createVersion` sequence isn't atomic on its own.
 */
export async function createVoiceDraft(
  params: CreateVoiceDraftParams
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createVoiceDraftLocked(params));
}

async function createVoiceDraftLocked(
  params: CreateVoiceDraftParams
): Promise<DraftCreationResult> {
  const { adId, tracks, parentVersionId: explicitParent } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "voices");

  // Resolve parent lineage + inherit slot ids by ordinal match
  const parentVersionId = await resolveParentVersionId(adId, "voices", explicitParent);
  const parentSlotIds = await loadParentSlotIds(adId, "voices", parentVersionId);
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotIds,
    tracks.length,
    "voices",
    parentVersionId
  );

  // Ordinal refs for anchor translation — voices table is this draft's own slot
  // ids (so "voice-N" ordinal refs resolve to the draft we're building).
  const ordinalRefs = await loadOrdinalRefs(adId, { voices: slotIds });

  // Resolve voice IDs to full Voice objects from catalogue
  const resolvedTracks = await Promise.all(
    tracks.map(async (track, index) => {
      // Try to find voice in catalogue by ID
      const catalogueVoice = await voiceCatalogue.getVoiceById(track.voiceId);

      // Log when lookup fails for debugging
      if (!catalogueVoice) {
        console.warn(
          `⚠️ Voice catalogue lookup failed for ID: ${track.voiceId}. Fallback: language=${track.language}, provider=${track.provider}`
        );
      }

      // Use catalogue voice if found, otherwise fallback to minimal object
      // Map UnifiedVoice fields to Voice type
      // Note: UnifiedVoice.gender includes "neutral" but Voice.gender doesn't
      const mapGender = (g: "male" | "female" | "neutral"): "male" | "female" | null =>
        g === "neutral" ? null : g;

      const voice: Voice = catalogueVoice
        ? {
            id: catalogueVoice.id,
            externalId: catalogueVoice.externalId,
            name: catalogueVoice.name,
            gender: mapGender(catalogueVoice.gender),
            language: catalogueVoice.language,
            accent: catalogueVoice.accent,
            provider: catalogueVoice.provider,
            style: catalogueVoice.styles?.join(", ") || catalogueVoice.personality,
            description: catalogueVoice.personality,
          }
        : {
            id: track.voiceId,
            name: track.voiceId, // Fallback if not found
            gender: null,
            // Preserve language context from LLM params
            language: track.language as Language | undefined,
            accent: track.accent,
            provider: track.provider as Voice["provider"],
          };

      const anchor = safeTranslateAnchor(track.anchor, ordinalRefs);

      return {
        slotId: slotIds[index],
        ...(anchor ? { anchor } : {}),
        voice,
        text: track.text,
        playAfter: track.playAfter || (index === 0 ? "start" : `track-${index - 1}`),
        overlap: track.overlap ?? 0,
        speed: 1.0,
        // Provider-specific fields
        description: track.description, // ElevenLabs baseline tone
        voiceInstructions: track.voiceInstructions, // OpenAI/Lahajati/ByteDance voice guidance
        dialectId: track.dialectId, // Lahajati Arabic dialect ID
        performanceId: track.performanceId, // Lahajati performance style ID
        emotion: track.emotion, // ByteDance TTS 2.0 emotion tag
      };
    })
  );

  const voiceVersion: VoiceVersion = {
    voiceTracks: resolvedTracks,
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
  };

  // Create draft version in Redis
  const versionId = await createVersion(adId, "voices", voiceVersion);

  return slotReportedResult(adId, versionId, report);
}

/**
 * Create music draft in Redis. See createVoiceDraft for the lock rationale.
 */
export async function createMusicDraft(
  params: CreateMusicDraftParams
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createMusicDraftLocked(params));
}

async function createMusicDraftLocked(
  params: CreateMusicDraftParams
): Promise<DraftCreationResult> {
  const {
    adId,
    prompt,
    elevenlabs,
    loudly,
    mubert,
    provider = "elevenlabs",
    duration,
    parentVersionId: explicitParent,
    anchor: anchorInput,
  } = params;

  // Derive duration from brief if LLM didn't provide it
  let effectiveDuration = duration;
  if (!effectiveDuration) {
    const meta = await getAdMetadata(adId);
    const briefDuration = meta?.brief?.adDuration || 30;
    // Music should be longer than ad to allow for LLM overruns and fade-out
    effectiveDuration = Math.max(30, briefDuration + 15);
    console.log(`[create_music_draft] Derived duration ${effectiveDuration}s from brief (ad: ${briefDuration}s)`);
  }

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "music");

  // Resolve parent lineage. Music has exactly one slot per version; carry its id forward.
  const parentVersionId = await resolveParentVersionId(adId, "music", explicitParent);
  let parentSlotId: string | undefined;
  if (parentVersionId) {
    const parent = (await getVersion(adId, "music", parentVersionId)) as MusicVersion | null;
    parentSlotId = parent?.slotId;
  }
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotId ? [parentSlotId] : parentVersionId ? [undefined] : null,
    1,
    "music",
    parentVersionId
  );

  // Anchor translation — music mostly references voices for ducking / swell.
  const ordinalRefs = await loadOrdinalRefs(adId, { music: slotIds[0] });
  const anchor = safeTranslateAnchor(anchorInput, ordinalRefs);

  // Use provider-specific prompts if provided, otherwise fallback to base prompt
  const musicVersion: MusicVersion = {
    slotId: slotIds[0],
    ...(anchor ? { anchor } : {}),
    musicPrompt: prompt,
    musicPrompts: {
      loudly: loudly || prompt || "",
      mubert: mubert || prompt || "",
      elevenlabs: elevenlabs || prompt || "",
    },
    provider: provider as MusicProvider,
    duration: effectiveDuration,
    generatedUrl: "", // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
  };

  const versionId = await createVersion(adId, "music", musicVersion);

  return slotReportedResult(adId, versionId, report);
}

/**
 * Create SFX draft in Redis. See createVoiceDraft for the lock rationale.
 */
export async function createSfxDraft(
  params: CreateSfxDraftParams
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createSfxDraftLocked(params));
}

async function createSfxDraftLocked(
  params: CreateSfxDraftParams
): Promise<DraftCreationResult> {
  const { adId, prompts, parentVersionId: explicitParent } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "sfx");

  // Resolve parent lineage + inherit slot ids by ordinal match
  const parentVersionId = await resolveParentVersionId(adId, "sfx", explicitParent);
  const parentSlotIds = await loadParentSlotIds(adId, "sfx", parentVersionId);
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotIds,
    prompts.length,
    "sfx",
    parentVersionId
  );

  // Anchor translation — sfx typically references voices in the active voice version.
  const ordinalRefs = await loadOrdinalRefs(adId, { sfx: slotIds });

  const sfxVersion: SfxVersion = {
    soundFxPrompts: prompts.map((p, index) => {
      // Convert placement to proper typed format
      let placement: SoundFxPlacementIntent | undefined;
      if (p.placement) {
        if (p.placement.type === "beforeVoices") {
          placement = { type: "beforeVoices" };
        } else if (p.placement.type === "withFirstVoice") {
          placement = { type: "withFirstVoice" };
        } else if (p.placement.type === "start") {
          // Legacy: map to sequential intro
          placement = { type: "beforeVoices" };
        } else if (p.placement.type === "end") {
          placement = { type: "end" };
        } else if (p.placement.type === "afterVoice" && p.placement.index !== undefined) {
          placement = { type: "afterVoice", index: p.placement.index };
        }
      }

      const anchor = safeTranslateAnchor(p.anchor, ordinalRefs);

      return {
        slotId: slotIds[index],
        ...(anchor ? { anchor } : {}),
        description: p.description,
        placement: placement || { type: "end" },
        duration: p.duration || 3,
        // playAfter intentionally omitted - placement is the source of truth
        overlap: 0,
      };
    }),
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
  };

  const versionId = await createVersion(adId, "sfx", sfxVersion);

  return slotReportedResult(adId, versionId, report);
}

/**
 * Small helper: attach the slot-reconciliation report to a draft result only when
 * the draft actually inherited from a parent. Fresh drafts with no parent return
 * just `{ versionId, status }` — the report in that case would only be "created"
 * entries, which callers don't need.
 *
 * Also emits a single structured log line per draft creation so orphan-drift
 * rates are visible in production logs before stage 6 ships the UI-facing
 * orphan affordance.
 */
function slotReportedResult(
  adId: string,
  versionId: VersionId,
  report: SlotReconciliation
): DraftCreationResult {
  const inheritedFromParent =
    report.parentVersionId !== null ||
    report.preserved.length > 0 ||
    report.orphaned.length > 0;

  console.log(
    `[slot-reconciliation] adId=${adId} stream=${report.stream} versionId=${versionId} parent=${report.parentVersionId ?? "none"} preserved=${report.preserved.length} created=${report.created.length} orphaned=${report.orphaned.length}`
  );

  return inheritedFromParent
    ? { versionId, status: "draft", reconciliation: report }
    : { versionId, status: "draft" };
}

/**
 * Read complete ad state from Redis
 * Returns FULL version data - not summaries - so LLM can see exactly what exists
 * and make informed decisions about what to preserve/modify
 */
export async function readAdState(
  params: ReadAdStateParams
): Promise<ReadAdStateResult> {
  const { adId } = params;

  const result: ReadAdStateResult = {};

  // Helper to get latest version from a stream
  async function getLatestVersion(
    streamType: "voices" | "music" | "sfx"
  ): Promise<{ id: VersionId; data: VoiceVersion | MusicVersion | SfxVersion } | null> {
    const versions = await listVersions(adId, streamType);
    if (versions.length === 0) return null;

    const latestId = versions[versions.length - 1];
    const data = await getVersion(adId, streamType, latestId);

    return data ? { id: latestId, data } : null;
  }

  // Get latest voices version - return FULL data
  const voicesLatest = await getLatestVersion("voices");
  if (voicesLatest) {
    result.voices = {
      ...(voicesLatest.data as VoiceVersion),
      versionId: voicesLatest.id,
    };
  }

  // Build voice history summaries (to help LLM avoid reusing previously tried voices)
  const allVoiceVersions = await getAllVersionsWithData(adId, "voices");
  const voiceVersionEntries = Object.entries(allVoiceVersions);
  if (voiceVersionEntries.length > 1) {
    result.voiceHistory = voiceVersionEntries
      .filter(([vId]) => vId !== voicesLatest?.id) // Exclude current version
      .map(([vId, data]): VoiceHistorySummary => {
        const v = data as VoiceVersion;
        // Extract unique voice IDs and names from this version
        const uniqueVoices = new Map<string, string>();
        v.voiceTracks.forEach((t) => {
          if (t.voice?.id) {
            uniqueVoices.set(t.voice.id, t.voice.name || t.voice.id);
          }
        });
        return {
          versionId: vId,
          voiceIds: Array.from(uniqueVoices.keys()),
          voiceNames: Array.from(uniqueVoices.values()),
          requestText: v.requestText || null,
        };
      });
  }

  // Get latest music version - return FULL data
  const musicLatest = await getLatestVersion("music");
  if (musicLatest) {
    result.music = {
      ...(musicLatest.data as MusicVersion),
      versionId: musicLatest.id,
    };
  }

  // Get latest sfx version - return FULL data
  const sfxLatest = await getLatestVersion("sfx");
  if (sfxLatest) {
    result.sfx = {
      ...(sfxLatest.data as SfxVersion),
      versionId: sfxLatest.id,
    };
  }

  return result;
}

/**
 * Set a catchy creative title for the ad
 */
export async function setAdTitle(
  params: SetAdTitleParams
): Promise<SetAdTitleResult> {
  const { adId, title } = params;

  const existing = await getAdMetadata(adId);
  if (!existing) {
    return { success: false, title: "" };
  }

  await setAdMetadata(adId, {
    ...existing,
    name: title,
    lastModified: Date.now(),
  });

  return { success: true, title };
}
