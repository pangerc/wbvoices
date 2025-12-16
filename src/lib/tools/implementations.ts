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
} from "./types";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import { createVersion, listVersions, getVersion, getAllVersionsWithData, setAdMetadata, getAdMetadata, updateVersion } from "@/lib/redis/versions";
import type { Language, Provider, Voice, MusicProvider, SoundFxPlacementIntent } from "@/types";
import type {
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
 * Create voice draft in Redis
 */
export async function createVoiceDraft(
  params: CreateVoiceDraftParams
): Promise<DraftCreationResult> {
  const { adId, tracks } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "voices");

  // Resolve voice IDs to full Voice objects from catalogue
  const resolvedTracks = await Promise.all(
    tracks.map(async (track, index) => {
      // Try to find voice in catalogue by ID
      const catalogueVoice = await voiceCatalogue.getVoiceById(track.voiceId);

      // Use catalogue voice if found, otherwise fallback to minimal object
      // Map UnifiedVoice fields to Voice type
      // Note: UnifiedVoice.gender includes "neutral" but Voice.gender doesn't
      const mapGender = (g: "male" | "female" | "neutral"): "male" | "female" | null =>
        g === "neutral" ? null : g;

      const voice: Voice = catalogueVoice
        ? {
            id: catalogueVoice.id,
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
          };

      return {
        voice,
        text: track.text,
        playAfter: track.playAfter || (index === 0 ? "start" : `track-${index - 1}`),
        overlap: track.overlap ?? 0,
        speed: 1.0,
        // Provider-specific fields
        description: track.description, // ElevenLabs baseline tone
        voiceInstructions: track.voiceInstructions, // OpenAI voice guidance
      };
    })
  );

  const voiceVersion: VoiceVersion = {
    voiceTracks: resolvedTracks,
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
  };

  // Create draft version in Redis
  const versionId = await createVersion(adId, "voices", voiceVersion);

  return {
    versionId,
    status: "draft",
  };
}

/**
 * Create music draft in Redis
 */
export async function createMusicDraft(
  params: CreateMusicDraftParams
): Promise<DraftCreationResult> {
  const {
    adId,
    prompt,
    elevenlabs,
    loudly,
    mubert,
    provider = "loudly",
    duration,
  } = params;

  // Derive duration from brief if LLM didn't provide it
  let effectiveDuration = duration;
  if (!effectiveDuration) {
    const meta = await getAdMetadata(adId);
    const briefDuration = meta?.brief?.adDuration || 30;
    // Music should be slightly longer than ad to allow fade-out
    effectiveDuration = Math.max(30, briefDuration + 5);
    console.log(`[create_music_draft] Derived duration ${effectiveDuration}s from brief (ad: ${briefDuration}s)`);
  }

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "music");

  // Use provider-specific prompts if provided, otherwise fallback to base prompt
  const musicVersion: MusicVersion = {
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
  };

  const versionId = await createVersion(adId, "music", musicVersion);

  return {
    versionId,
    status: "draft",
  };
}

/**
 * Create SFX draft in Redis
 */
export async function createSfxDraft(
  params: CreateSfxDraftParams
): Promise<DraftCreationResult> {
  const { adId, prompts } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "sfx");

  const sfxVersion: SfxVersion = {
    soundFxPrompts: prompts.map((p) => {
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

      return {
        description: p.description,
        placement: placement || { type: "end" },
        duration: p.duration || 3,
        playAfter: "start",
        overlap: 0,
      };
    }),
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
  };

  const versionId = await createVersion(adId, "sfx", sfxVersion);

  return {
    versionId,
    status: "draft",
  };
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
