/**
 * Voice Prefetch Service
 *
 * Prefetches voices BEFORE the LLM call to eliminate the search_voices round-trip.
 * Uses the same voiceCatalogue service as the search_voices tool.
 */

import { voiceCatalogue } from "@/services/voiceCatalogueService";
import type { Language, Provider } from "@/types";

export interface PrefetchedVoice {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "neutral";
  accent: string;
  personality?: string;
  provider: string;
}

export interface VoicePrefetchResult {
  voices: PrefetchedVoice[];
  maleVoices: PrefetchedVoice[];
  femaleVoices: PrefetchedVoice[];
  totalCount: number;
  fetchedAt: number;
}

/**
 * Prefetch voices for initial generation
 * Uses the same service as search_voices tool but runs BEFORE LLM call
 */
export async function prefetchVoices(
  provider: Provider,
  language: Language,
  accent?: string
): Promise<VoicePrefetchResult> {
  // Get all voices for the provider/language combo
  // This is the SAME call that searchVoices() in implementations.ts makes
  const allVoices = await voiceCatalogue.getVoicesForProvider(
    provider,
    language,
    accent,
    true // requireApproval (blacklist filtering)
  );

  // Map to prefetched format
  const voices: PrefetchedVoice[] = allVoices.map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    personality: v.styles?.join(", ") || v.personality,
    provider: v.provider,
  }));

  // Split by gender for dialogue format convenience
  const maleVoices = voices.filter((v) => v.gender === "male");
  const femaleVoices = voices.filter((v) => v.gender === "female");

  return {
    voices,
    maleVoices,
    femaleVoices,
    totalCount: voices.length,
    fetchedAt: Date.now(),
  };
}
