import { NextRequest, NextResponse } from "next/server";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import { Language } from "@/types";
import { normalizeLanguageCode } from "@/utils/language";

// Note: Using Node.js runtime (not Edge) because voiceCatalogueService now depends on postgres
export const runtime = "nodejs";

/**
 * 🗡️ ACCENT API: Get available accents for a language based on actual voice data
 * This queries the voice towers to find which accents actually have voices available
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const rawLanguage = searchParams.get("language");

    if (!rawLanguage) {
      return NextResponse.json(
        {
          error: "Language parameter required",
          accents: [],
        },
        { status: 400 }
      );
    }

    // 🔥 NORMALIZE THE LANGUAGE CODE! This is critical!
    const language = normalizeLanguageCode(rawLanguage) as Language;

    // Get the voice data tower to find available accents
    const stats = await voiceCatalogue.getCacheStats();

    if (stats.totalVoices === 0) {
      return NextResponse.json({
        accents: [],
        message:
          "Voice cache not populated. Run POST /api/admin/voice-cache first.",
      });
    }

    // Read the tower directly — internal HTTP roundtrips would hit the auth
    // gate and silently degrade to an empty accent list.
    const voices = await voiceCatalogue.getVoicesByLanguage(language);

    const accentCounts = new Map<string, number>();
    let totalCount = 0;
    for (const voice of voices) {
      if (!voice.accent) continue;
      totalCount++;
      accentCounts.set(voice.accent, (accentCounts.get(voice.accent) || 0) + 1);
    }

    // Convert to display format using ACTUAL accent codes
    const accents = Array.from(accentCounts.entries())
      .filter(([code]) => code && code !== "neutral")
      .map(([code, count]) => ({
        code,
        displayName: formatAccentDisplayName(code, language),
        count,
      }));

    // Sort by display name
    accents.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Always add neutral as first option (covers all voices in the language)
    accents.unshift({
      code: "neutral",
      displayName: "Any Accent",
      count: totalCount,
    });

    return NextResponse.json({ accents });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to get accents",
        accents: [],
      },
      { status: 500 }
    );
  }
}

/**
 * Format accent code into display name
 */
function formatAccentDisplayName(
  accentCode: string,
  language: Language
): string {
  if (!accentCode || accentCode === "neutral") return "Any Accent";

  // Map ACTUAL accent codes from providers to nice display names
  const accentDisplayNames: Record<string, Record<string, string>> = {
    es: {
      castilian: "Castilian",
      mexican: "Mexican",
      standard: "Standard Spanish", // Keep language for "Standard"
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

  // Try language-specific mapping first
  const languageAccents = accentDisplayNames[language];
  if (languageAccents && languageAccents[accentCode]) {
    return languageAccents[accentCode];
  }

  // Fallback to generic formatting for unknown accent codes
  return accentCode
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
