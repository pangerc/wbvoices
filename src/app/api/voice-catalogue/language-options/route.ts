import { NextRequest, NextResponse } from "next/server";
import { voiceCatalogue, VoiceCounts } from "@/services/voiceCatalogueService";
import { Language, Provider, CampaignFormat } from "@/types";
import { normalizeLanguageCode, getLanguageRegions, accentRegions } from "@/utils/language";

export const runtime = "nodejs";

type RegionOption = { code: string; displayName: string };
type AccentOption = { code: string; displayName: string };

/**
 * GET /api/voice-catalogue/language-options
 *
 * Single consolidated endpoint that returns everything needed when language changes:
 * - regions (from static config)
 * - accents (from voice data)
 * - voiceCounts (per provider)
 * - suggestedProvider (smart default for novice users)
 * - dialogReady (has 2+ voices for dialogue format)
 *
 * This replaces the cascade of 12+ API calls in useVoiceManagerV2.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const rawLanguage = searchParams.get("language");
    const campaignFormat = (searchParams.get("campaignFormat") || "ad_read") as CampaignFormat;
    const region = searchParams.get("region") || null;
    const provider = searchParams.get("provider") || null;
    const accent = searchParams.get("accent") || null;

    if (!rawLanguage) {
      return NextResponse.json(
        { error: "Language parameter required" },
        { status: 400 }
      );
    }

    const language = normalizeLanguageCode(rawLanguage) as Language;

    // 1. Get regions (static, from language utils)
    const rawRegions = getLanguageRegions(language);
    const regions: RegionOption[] = rawRegions.length > 0
      ? [{ code: "all", displayName: "All Regions" }, ...rawRegions]
      : [];

    // 2. Get accents from actual voice data (filtered by region if specified)
    const accents = await getAccentsForLanguage(language, region);

    // 3. Get voice counts per provider (WITH blacklist filtering)
    const voiceCounts = await getFilteredVoiceCounts(language);

    // 4. Suggest best provider for this language
    const suggestedProvider = suggestProvider(language, voiceCounts);

    // 5. Check if enough voices for dialogue format (respects provider/accent filters)
    const filteredVoiceCount = await getFilteredVoiceCountForDialog(language, provider, accent);
    const dialogReady = filteredVoiceCount >= 2;

    return NextResponse.json({
      language, // Include for staleness check on client
      regions,
      accents,
      voiceCounts,
      suggestedProvider,
      dialogReady,
      hasRegions: regions.length > 1,
      hasAccents: accents.length > 1,
    });
  } catch (error) {
    console.error("Error in language-options:", error);
    return NextResponse.json(
      { error: "Failed to get language options" },
      { status: 500 }
    );
  }
}

/**
 * Get voice counts per provider with blacklist filtering.
 * Uses getVoicesForProvider with requireApproval=true to exclude blacklisted voices.
 */
async function getFilteredVoiceCounts(language: Language): Promise<VoiceCounts> {
  const providers = ["elevenlabs", "openai", "qwen", "bytedance", "lahajati"] as const;
  const counts: VoiceCounts = {
    elevenlabs: 0,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    lahajati: 0,
    lovo: 0,
    any: 0,
  };

  for (const provider of providers) {
    try {
      const voices = await voiceCatalogue.getVoicesForProvider(
        provider,
        language,
        undefined, // accent
        true // requireApproval - filter out blacklisted!
      );
      counts[provider] = voices.length;
      counts.any += voices.length;
    } catch {
      // Continue with other providers
    }
  }

  return counts;
}

/**
 * Get voice count for dialog readiness check.
 * Filters by provider and accent if specified.
 */
async function getFilteredVoiceCountForDialog(
  language: Language,
  provider: string | null,
  accent: string | null
): Promise<number> {
  // If no specific provider, check all providers
  const providersToCheck = provider
    ? [provider]
    : ["elevenlabs", "openai", "qwen", "bytedance"];

  let count = 0;
  for (const p of providersToCheck) {
    try {
      const voices = await voiceCatalogue.getVoicesForProvider(
        p as "elevenlabs" | "openai" | "qwen" | "bytedance",
        language,
        accent || undefined, // Pass accent filter if specified
        true // requireApproval - filter out blacklisted
      );
      count += voices.length;
    } catch {
      // Continue with other providers
    }
  }

  return count;
}

/**
 * Get available accents for a language from voice data (with blacklist filtering)
 * Optionally filter by region if specified
 */
async function getAccentsForLanguage(language: Language, region: string | null): Promise<AccentOption[]> {
  const availableAccents = new Set<string>();

  // Get voices from all providers to find available accents
  const providers = ["elevenlabs", "openai", "qwen", "bytedance"] as const;

  for (const provider of providers) {
    try {
      // Use requireApproval=true to exclude blacklisted voices
      const voices = await voiceCatalogue.getVoicesForProvider(
        provider,
        language,
        undefined, // accent
        true // requireApproval - filter out blacklisted!
      );
      voices.forEach((voice) => {
        if (voice.accent) {
          availableAccents.add(voice.accent);
        }
      });
    } catch {
      // Continue with other providers
    }
  }

  // Get the allowed accents for this region (if region is specified and not "all")
  const baseLang = language.split("-")[0];
  const regionAccentMapping = accentRegions[baseLang];
  const allowedAccentsForRegion = region && region !== "all" && regionAccentMapping
    ? regionAccentMapping[region] || null
    : null;

  // Convert to display format, filtering by region if applicable
  const accents: AccentOption[] = Array.from(availableAccents)
    .filter((accent) => {
      // Always exclude neutral from the main list (added separately)
      if (!accent || accent === "neutral") return false;
      // If no region filter, include all accents
      if (!allowedAccentsForRegion) return true;
      // Filter to only accents in the selected region
      return allowedAccentsForRegion.includes(accent);
    })
    .map((accentCode) => ({
      code: accentCode,
      displayName: formatAccentDisplayName(accentCode, language),
    }));

  // Sort by display name
  accents.sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Always add neutral as first option
  accents.unshift({
    code: "neutral",
    displayName: "Any Accent",
  });

  return accents;
}

/**
 * Suggest the best provider for a language based on voice availability
 */
function suggestProvider(language: string, voiceCounts: VoiceCounts): Provider {
  // Arabic languages → prefer lahajati (Arabic specialist)
  if (language === "ar" || language.startsWith("ar-")) {
    if (voiceCounts.lahajati > 0) return "lahajati";
    if (voiceCounts.openai > 0) return "openai";
    if (voiceCounts.elevenlabs > 0) return "elevenlabs";
  }

  // Chinese languages → prefer qwen (better quality for Chinese)
  if (language === "zh" || language.startsWith("zh-")) {
    if (voiceCounts.qwen > 0) return "qwen";
    if (voiceCounts.bytedance > 0) return "bytedance";
  }

  // Default priority: elevenlabs > openai > qwen > bytedance
  if (voiceCounts.elevenlabs > 0) return "elevenlabs";
  if (voiceCounts.openai > 0) return "openai";
  if (voiceCounts.qwen > 0) return "qwen";
  if (voiceCounts.bytedance > 0) return "bytedance";

  return "any";
}

/**
 * Format accent code into display name
 */
function formatAccentDisplayName(accentCode: string, language: Language): string {
  if (!accentCode || accentCode === "neutral") return "Any Accent";

  const accentDisplayNames: Record<string, Record<string, string>> = {
    es: {
      castilian: "Castilian",
      mexican: "Mexican",
      standard: "Standard Spanish",
      argentinian: "Argentinian",
      colombian: "Colombian",
      chilean: "Chilean",
      peruvian: "Peruvian",
    },
    ar: {
      saudi: "Saudi Arabic",
      kuwaiti: "Kuwaiti Arabic",
      emirati: "Emirati Arabic",
      gulf: "Gulf Arabic",
      egyptian: "Egyptian Arabic",
      moroccan: "Moroccan Arabic",
      jordanian: "Jordanian Arabic",
      lebanese: "Lebanese Arabic",
      standard: "Standard Arabic",
      neutral: "Standard Arabic",
    },
    en: {
      american: "American English",
      british: "British English",
      scottish: "Scottish English",
      irish: "Irish English",
      australian: "Australian English",
      canadian: "Canadian English",
      south_african: "South African English",
      indian: "Indian English",
      standard: "Standard English",
      neutral: "Standard English",
    },
    fr: {
      parisian: "Parisian French",
      canadian: "Canadian French",
      belgian: "Belgian French",
      swiss: "Swiss French",
      standard: "Standard French",
    },
    de: {
      standard: "Standard German",
      austrian: "Austrian German",
      swiss: "Swiss German",
    },
    pt: {
      brazilian: "Brazilian Portuguese",
      european: "European Portuguese",
      standard: "Standard Portuguese",
    },
    zh: {
      mandarin: "Mandarin Chinese",
      cantonese: "Cantonese",
      taiwanese: "Taiwanese",
      standard: "Standard Chinese",
    },
  };

  // Extract base language for lookup
  const baseLang = language.split("-")[0];
  const languageAccents = accentDisplayNames[baseLang];
  if (languageAccents && languageAccents[accentCode]) {
    return languageAccents[accentCode];
  }

  // Fallback to generic formatting
  return accentCode
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
