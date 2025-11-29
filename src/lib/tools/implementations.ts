import {
  SearchVoicesParams,
  SearchVoicesResult,
  CreateVoiceDraftParams,
  CreateMusicDraftParams,
  CreateSfxDraftParams,
  GetCurrentStateParams,
  DraftCreationResult,
  CurrentStateResult,
} from "./types";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import { createVersion, listVersions, getVersion } from "@/lib/redis/versions";
import type { Language, Provider, Voice, MusicProvider, SoundFxPlacementIntent } from "@/types";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
} from "@/types/versions";

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
    duration = 30,
  } = params;

  // Use provider-specific prompts if provided, otherwise fallback to base prompt
  const musicVersion: MusicVersion = {
    musicPrompt: prompt,
    musicPrompts: {
      loudly: loudly || prompt || "",
      mubert: mubert || prompt || "",
      elevenlabs: elevenlabs || prompt || "",
    },
    provider: provider as MusicProvider,
    duration,
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

  const sfxVersion: SfxVersion = {
    soundFxPrompts: prompts.map((p) => {
      // Convert placement to proper typed format
      let placement: SoundFxPlacementIntent | undefined;
      if (p.placement) {
        if (p.placement.type === "start") {
          placement = { type: "start" };
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
 * Get current state for an ad
 * Returns the most recent draft version for each stream type
 */
export async function getCurrentState(
  params: GetCurrentStateParams
): Promise<CurrentStateResult> {
  const { adId } = params;

  const result: CurrentStateResult = {};

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

  // Get latest voices version
  const voicesLatest = await getLatestVersion("voices");
  if (voicesLatest) {
    const vv = voicesLatest.data as VoiceVersion;
    result.voices = {
      versionId: voicesLatest.id,
      summary: `${vv.voiceTracks.length} voice tracks`,
    };
  }

  // Get latest music version
  const musicLatest = await getLatestVersion("music");
  if (musicLatest) {
    const mv = musicLatest.data as MusicVersion;
    result.music = {
      versionId: musicLatest.id,
      summary: `${mv.provider} - "${mv.musicPrompt.slice(0, 50)}..."`,
    };
  }

  // Get latest sfx version
  const sfxLatest = await getLatestVersion("sfx");
  if (sfxLatest) {
    const sv = sfxLatest.data as SfxVersion;
    result.sfx = {
      versionId: sfxLatest.id,
      summary: `${sv.soundFxPrompts.length} sound effects`,
    };
  }

  return result;
}
