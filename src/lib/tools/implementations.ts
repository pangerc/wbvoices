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
  const { language, gender, accent, style, count = 10 } = params;

  // Get voices from catalogue
  const allVoices = await voiceCatalogue.getVoicesForProvider(
    "any" as Provider,
    language as Language,
    accent,
    true // requireApproval
  );

  // Filter by gender if specified
  let filtered = gender
    ? allVoices.filter((v) => v.gender.toLowerCase() === gender.toLowerCase())
    : allVoices;

  // Filter by style if specified (check voice.style or voice.use_case)
  if (style) {
    filtered = filtered.filter(
      (v) =>
        v.style?.toLowerCase().includes(style.toLowerCase()) ||
        v.use_case?.toLowerCase().includes(style.toLowerCase())
    );
  }

  // Take first N voices
  const selected = filtered.slice(0, count);

  // Enrich with metadata
  const enriched = selected.map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    style: v.style || v.use_case,
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

  // Build voice version object with required metadata
  // Note: voiceId will be resolved to a full Voice object by the LLM or caller
  // For now, we create minimal Voice objects that satisfy the type system
  const voiceVersion: VoiceVersion = {
    voiceTracks: tracks.map((track, index) => ({
      voice: {
        id: track.voiceId,
        name: track.voiceId, // Will be enriched later
        gender: null
      } as Voice,
      text: track.text,
      playAfter: track.playAfter || (index === 0 ? "start" : `track-${index - 1}`),
      overlap: track.overlap ?? 0,
      speed: 1.0, // Default speed
    })),
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
  const { adId, prompt, provider = "loudly", duration = 30 } = params;

  const musicVersion: MusicVersion = {
    musicPrompt: prompt,
    musicPrompts: {
      loudly: provider === "loudly" ? prompt : "",
      mubert: provider === "mubert" ? prompt : "",
      elevenlabs: provider === "elevenlabs" ? prompt : "",
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
