import { NextRequest, NextResponse } from "next/server";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import { Language, Voice } from "@/types";
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

    // Get voices for this language from all providers to find ACTUAL accent codes
    const availableAccents = new Set<string>();
    const providers = ["elevenlabs", "lovo", "openai"] as const;

    // 🗡️ ATTACK ALL PROVIDERS SIMULTANEOUSLY!
    const providerPromises = providers.map(async (provider) => {
      try {
        // Get voices for this provider/language combination (no accent filter!)
        const url = new URL(req.url);
        url.pathname = "/api/voice-catalogue";
        url.search = "";
        url.searchParams.set("operation", "voices");
        url.searchParams.set("provider", provider);
        url.searchParams.set("language", language); // Using normalized language!
        // DON'T pass accent - we want to see all accents available

        const response = await fetch(url);
        if (response.ok) {
          const voices = await response.json();

          const providerAccents = new Set<string>();
          // Collect ACTUAL accent codes from the stored voice data
          voices.forEach((voice: Voice) => {
            if (voice.accent) {
              providerAccents.add(voice.accent);
            }
          });

          return { provider, accents: Array.from(providerAccents) };
        }
        return { provider, accents: [] };
      } catch {
        return { provider, accents: [] };
      }
    });

    // Wait for ALL providers to report their accents
    const providerResults = await Promise.all(providerPromises);

    // Merge ALL accents from ALL providers
    providerResults.forEach((result) => {
      result.accents.forEach((accent) => availableAccents.add(accent));
    });

    // Convert to display format using ACTUAL accent codes
    const accents = Array.from(availableAccents)
      .filter((accent) => accent && accent !== "neutral") // Remove any empty or neutral accents
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
