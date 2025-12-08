/**
 * Voice Provider Service
 * Fetches voices directly from external provider APIs
 * Used by both /api/voice/list and /api/admin/voice-cache
 *
 * This avoids internal HTTP calls which cause issues on Vercel
 */

import { normalizeLanguageCode } from "@/utils/language";

export type ProviderVoice = {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  accent?: string;
  description?: string;
  age?: string;
  style?: string;
  sampleUrl?: string;
  use_case?: string;
  isMultilingual?: boolean;
};

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: {
    gender?: string;
    accent?: string;
    description?: string;
    age?: string;
    use_case?: string;
    locale?: string; // locale field (e.g., "es-AR", "es-MX")
    language?: string;
  };
  preview_url?: string;
  high_quality_base_model_ids?: string[];
  verified_languages?: Array<{
    language: string;
    locale: string;
    accent: string;
    model_id: string;
    preview_url?: string;
  }>;
  fine_tuning?: {
    language?: string;
  };
};

type LovoSpeaker = {
  id: string;
  displayName: string;
  locale: string;
  gender: string;
  imageUrl: string;
  speakerType: string;
  ageRange?: string;
  speakerStyles: {
    deprecated: boolean;
    id: string;
    displayName: string;
    sampleTtsUrl?: string;
  }[];
};

/**
 * Fetch voices from ElevenLabs API
 */
export async function fetchElevenLabsVoices(): Promise<ProviderVoice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ElevenLabs API key is missing");
  }

  const response = await fetch(
    "https://api.elevenlabs.io/v1/voices?show_legacy=true",
    {
      headers: {
        "xi-api-key": apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${errorText}`);
  }

  const data = await response.json();
  const voices: ProviderVoice[] = [];

  for (const voice of data.voices as ElevenLabsVoice[]) {
    // For voices with verified_languages, create entries for each language
    if (voice.verified_languages && voice.verified_languages.length > 0) {
      for (const verifiedLang of voice.verified_languages) {
        const normalizedLanguage = normalizeLanguageCode(verifiedLang.language);

        // 🔥 FIXED: Extract specific accent from locale field, but preserve Modern Standard Arabic
        let accent = verifiedLang.accent;

        // Don't overwrite Modern Standard Arabic accents with locale region
        const isModernStandardArabic =
          normalizedLanguage === 'ar' &&
          accent &&
          (accent.toLowerCase().includes('modern') ||
           accent.toLowerCase() === 'standard');

        if (!isModernStandardArabic && verifiedLang.locale) {
          const [, region] = verifiedLang.locale.split('-');
          if (region) {
            // Use region code (e.g., AR, MX, CO) which normalizeAccent will convert to specific accents
            accent = region;
          }
        }

        voices.push({
          id: `${voice.voice_id}-${verifiedLang.language}`,
          name: voice.name,
          gender: voice.labels?.gender,
          language: normalizedLanguage,
          accent: accent,
          description: voice.labels?.description,
          age: voice.labels?.age,
          use_case: voice.labels?.use_case,
          sampleUrl: verifiedLang.preview_url || voice.preview_url,
          isMultilingual: voice.verified_languages.length > 1,
        });
      }

      // 🔥 FIX: For Professional Voice Clones, include labels.language as primary language
      // even if not in verified_languages (language-agnostic fix for all PVCs)
      if (voice.category === 'professional' && voice.labels?.language) {
        const labelLang = voice.labels.language.toLowerCase();
        const alreadyProcessed = voice.verified_languages.some(
          (vl: { language: string }) => vl.language.toLowerCase() === labelLang
        );

        if (!alreadyProcessed) {
          const normalizedLanguage = normalizeLanguageCode(voice.labels.language);
          const accent = voice.labels.accent;

          voices.push({
            id: `${voice.voice_id}-${voice.labels.language}`,
            name: voice.name,
            gender: voice.labels?.gender,
            language: normalizedLanguage,
            accent: accent,
            description: voice.labels?.description,
            age: voice.labels?.age,
            use_case: voice.labels?.use_case,
            sampleUrl: voice.preview_url,
            isMultilingual: voice.verified_languages.length > 1,
          });
        }
      }
    } else {
      // Fallback for voices without verified_languages (Professional Voice Clones)
      const { language, isMultilingual, accent } = getVoiceLanguage(voice);
      const normalizedLanguage = normalizeLanguageCode(language);

      // 🔥 FIXED: For Arabic PVCs, use labels.accent directly (e.g., "egyptian", "jordanian", "moroccan")
      let finalAccent = accent || voice.labels?.accent;

      // Check if this is Modern Standard Arabic before extracting from locale
      const isModernStandardArabic =
        normalizedLanguage === 'ar' &&
        finalAccent &&
        (finalAccent.toLowerCase().includes('modern') ||
         finalAccent.toLowerCase() === 'standard');

      // Only extract from locale if not MSA and not already a specific Arabic accent
      if (!isModernStandardArabic && voice.labels?.locale) {
        const [, region] = voice.labels.locale.split('-');
        if (region) {
          finalAccent = region;
        }
      }

      voices.push({
        id: voice.voice_id,
        name: voice.name,
        gender: voice.labels?.gender,
        language: normalizedLanguage,
        accent: finalAccent,
        description: voice.labels?.description,
        age: voice.labels?.age,
        use_case: voice.labels?.use_case,
        sampleUrl: voice.preview_url,
        isMultilingual,
      });
    }
  }

  return voices;
}

/**
 * Fetch voices from Lovo API
 */
export async function fetchLovoVoices(): Promise<ProviderVoice[]> {
  const apiKey = process.env.LOVO_API_KEY;
  if (!apiKey) {
    throw new Error("Lovo API key is missing");
  }

  const response = await fetch(
    "https://api.genny.lovo.ai/api/v1/speakers?sort=displayName%3A1",
    {
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lovo API error: ${errorText}`);
  }

  const data = await response.json();
  const speakers: LovoSpeaker[] = data.data;
  const voices: ProviderVoice[] = [];

  for (const speaker of speakers) {
    // Skip speakers without styles
    if (!speaker.speakerStyles.length) continue;

    // Create separate voice entry for each style
    for (const style of speaker.speakerStyles) {
      if (style.deprecated) continue;

      const styleId = `${speaker.id}|${style.id}`;
      const accent = extractAccentFromSpeaker(speaker);
      const normalizedLocale = normalizeLanguageCode(speaker.locale);

      voices.push({
        id: styleId,
        name: style.displayName === "Default"
          ? speaker.displayName
          : `${speaker.displayName} (${style.displayName})`,
        gender: speaker.gender.toLowerCase(),
        language: normalizedLocale,
        accent,
        age: speaker.ageRange ? mapLovoAgeRange(speaker.ageRange) : undefined,
        description: style.displayName === "Default"
          ? mapLovoStyleToDescription(speaker)
          : style.displayName.toLowerCase(),
        use_case: inferUseCase(speaker.speakerType),
        style: style.displayName,
        sampleUrl: style.sampleTtsUrl || "/samples/default.mp3",
        isMultilingual: false,
      });
    }
  }

  return voices;
}

/**
 * Get OpenAI voices (hardcoded - no API needed)
 */
export function getOpenAIVoices(): ProviderVoice[] {
  const openAIVoiceVariants = [
    {
      id: "alloy",
      name: "Alloy",
      gender: "female",
      description: "Balanced, neutral, clear",
    },
    {
      id: "echo",
      name: "Echo",
      gender: "male",
      description: "Calm, measured, thoughtful",
    },
    {
      id: "fable",
      name: "Fable",
      gender: "female",
      description: "Warm, engaging, storytelling",
    },
    {
      id: "onyx",
      name: "Onyx",
      gender: "male",
      description: "Deep, authoritative",
    },
    {
      id: "nova",
      name: "Nova",
      gender: "female",
      description: "Bright, energetic, enthusiastic",
    },
    {
      id: "shimmer",
      name: "Shimmer",
      gender: "female",
      description: "Soft, gentle, soothing",
    },
    {
      id: "ash",
      name: "Ash",
      gender: "male",
      description: "Mature, sophisticated",
    },
    {
      id: "ballad",
      name: "Ballad",
      gender: "male",
      description: "Smooth, melodic",
    },
    {
      id: "coral",
      name: "Coral",
      gender: "female",
      description: "Vibrant, lively",
    },
    {
      id: "sage",
      name: "Sage",
      gender: "female",
      description: "Wise, contemplative",
    },
    {
      id: "verse",
      name: "Verse",
      gender: "male",
      description: "Confident, engaging, dynamic",
    },
  ];

  const openAILanguages = [
    "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da",
    "nl", "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu", "is",
    "id", "it", "ja", "kn", "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi",
    "ne", "no", "fa", "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sw",
    "sv", "tl", "ta", "th", "tr", "uk", "ur", "vi", "cy",
  ];

  const languageMap: { [key: string]: string } = {
    en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT",
    pt: "pt-BR", nl: "nl-NL", pl: "pl-PL", ru: "ru-RU", ja: "ja-JP",
    ko: "ko-KR", zh: "zh-CN", ar: "ar-SA", hi: "hi-IN", sv: "sv-SE",
    da: "da-DK", fi: "fi-FI", no: "nb-NO", tr: "tr-TR", cs: "cs-CZ",
    el: "el-GR", he: "he-IL", hu: "hu-HU", id: "id-ID", th: "th-TH",
    vi: "vi-VN", uk: "uk-UA", ro: "ro-RO", bg: "bg-BG", hr: "hr-HR",
    sk: "sk-SK", sl: "sl-SI", lt: "lt-LT", lv: "lv-LV", et: "et-EE",
    fa: "fa-IR", ur: "ur-PK", ta: "ta-IN", bn: "bn-BD", mr: "mr-IN",
    kn: "kn-IN", sw: "sw-KE", ca: "ca-ES", gl: "gl-ES", eu: "eu-ES",
    mk: "mk-MK", bs: "bs-BA", sr: "sr-RS", sq: "sq-AL", az: "az-AZ",
    kk: "kk-KZ", be: "be-BY", hy: "hy-AM", ne: "ne-NP", mi: "mi-NZ",
    cy: "cy-GB", is: "is-IS", ms: "ms-MY", tl: "tl-PH", nb: "nb-NO",
    af: "af-ZA",
  };

  const voices: ProviderVoice[] = [];

  for (const langCode of openAILanguages) {
    const normalizedLang = languageMap[langCode] || `${langCode}-${langCode.toUpperCase()}`;

    // Expose all voices for all languages - let the LLM choose based on rich metadata
    for (const voice of openAIVoiceVariants) {
      voices.push({
        id: `${voice.id}-${langCode}`,
        name: voice.name,
        gender: voice.gender,
        language: normalizedLang,
        description: voice.description,
        use_case: "general",
        age: "middle_aged",
        accent: "neutral",
        isMultilingual: true,
      });
    }
  }

  return voices;
}

/**
 * Fetch voices from Lahajati API (Arabic dialect specialist)
 * All Lahajati voices support all 116 Arabic dialects - the dialect is passed at TTS time
 */
export async function fetchLahajatiVoices(): Promise<ProviderVoice[]> {
  const apiKey = process.env.LAHAJATI_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Lahajati API key is missing");
  }

  // Fetch all voices (paginated, max 339 voices)
  const allVoices: LahajatiVoice[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://lahajati.ai/api/v1/voices-absolute-control?page=${page}`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lahajati voices API error: ${errorText}`);
    }

    const data = await response.json();
    allVoices.push(...(data.data || []));

    // Check if there are more pages
    hasMore = data.meta && data.meta.current_page < data.meta.last_page;
    page++;
  }

  console.log(`📡 Lahajati: fetched ${allVoices.length} voices`);

  // Transform to ProviderVoice format
  // All Lahajati voices are Arabic and support all dialects
  const voices: ProviderVoice[] = allVoices
    .filter(voice => !voice.is_cloned) // Only include non-cloned voices
    .map(voice => ({
      id: voice.id_voice,
      name: voice.display_name,
      gender: voice.gender?.toLowerCase() || 'neutral',
      language: 'ar', // All Lahajati voices are Arabic
      accent: 'standard', // Dialect-agnostic (dialect passed at TTS time)
      description: `${voice.display_name} - Arabic voice`,
      use_case: 'advertisement',
      isMultilingual: false,
    }));

  return voices;
}

// Lahajati voice type
type LahajatiVoice = {
  id_voice: string;
  display_name: string;
  gender: string;
  is_cloned: boolean;
  average_rating: number | null;
};

// Helper functions

function getVoiceLanguage(voice: ElevenLabsVoice): {
  language: string;
  isMultilingual: boolean;
  accent?: string;
} {
  let isMultilingual = false;
  let accent = undefined;

  if (
    voice.high_quality_base_model_ids &&
    voice.high_quality_base_model_ids.includes("eleven_multilingual_v2")
  ) {
    isMultilingual = true;
  }

  if (voice.labels && voice.labels.accent) {
    accent = voice.labels.accent;
  }

  const accentLower = accent ? accent.toLowerCase() : "";

  if (isMultilingual && accent) {
    if (accentLower.includes("peninsular") || accentLower.includes("latin american")) {
      return { language: "es-ES", isMultilingual: true, accent };
    }

    const accentToLanguageMap: Record<string, string> = {
      italian: "it-IT", swedish: "sv-SE", american: "en-US", british: "en-GB",
      irish: "en-IE", australian: "en-AU", canadian: "en-CA", "us southern": "en-US",
      southern: "en-US", transatlantic: "en-US", spanish: "es-ES", mexican: "es-MX",
      colombian: "es-CO", argentinian: "es-AR", french: "fr-FR", parisian: "fr-FR",
      "canadian french": "fr-CA", german: "de-DE", austrian: "de-AT",
      "swiss german": "de-CH", portuguese: "pt-PT", brazilian: "pt-BR",
      russian: "ru-RU", egyptian: "ar-EG", gulf: "ar-SA", saudi: "ar-SA",
      jordanian: "ar-JO", moroccan: "ar-MA", mandarin: "zh-CN", cantonese: "zh-HK", japanese: "ja-JP",
      polish: "pl-PL", mazovian: "pl-PL", warsaw: "pl-PL",
    };

    for (const [accentKeyword, langCode] of Object.entries(accentToLanguageMap)) {
      if (accentLower.includes(accentKeyword)) {
        return { language: langCode, isMultilingual: true, accent };
      }
    }
  }

  // Note: verified_languages is now an array of objects, handled in fetchElevenLabsVoices()
  // This fallback is for voices without verified_languages
  if (voice.verified_languages && voice.verified_languages.length > 0) {
    const firstVerified = voice.verified_languages[0];
    const lang = firstVerified.language.toLowerCase();

    if (lang.length === 2) {
      return { language: normalizeLanguageCode(lang), isMultilingual, accent };
    }

    return { language: normalizeLanguageCode(lang), isMultilingual, accent };
  }

  if (voice.fine_tuning?.language) {
    const lang = voice.fine_tuning.language.toLowerCase();
    return { language: normalizeLanguageCode(lang), isMultilingual, accent };
  }

  // 🔥 FIX: Check labels.language for Professional Voice Clones
  if (voice.labels?.language) {
    const lang = voice.labels.language.toLowerCase();
    return { language: normalizeLanguageCode(lang), isMultilingual, accent };
  }

  return { language: "en-US", isMultilingual, accent };
}

function extractAccentFromSpeaker(speaker: LovoSpeaker): string | undefined {
  const locale = normalizeLanguageCode(speaker.locale);
  const [lang, region] = locale.split("-");

  switch (lang) {
    case "en":
      const englishAccentMap: Record<string, string> = {
        US: "american", GB: "british", AU: "australian",
        IE: "irish", CA: "canadian", IN: "indian",
      };
      return englishAccentMap[region] || "standard";

    case "es":
      const spanishAccentMap: Record<string, string> = {
        ES: "castilian", MX: "mexican", AR: "argentinian",
        CO: "colombian", CL: "chilean", PE: "peruvian",
      };
      return spanishAccentMap[region] || "standard";

    case "fr":
      const frenchAccentMap: Record<string, string> = {
        FR: "parisian", CA: "canadian", BE: "belgian", CH: "swiss",
      };
      return frenchAccentMap[region] || "standard";

    case "ar":
      const arabicAccentMap: Record<string, string> = {
        SA: "saudi", EG: "egyptian", DZ: "maghrebi", MA: "maghrebi",
        TN: "maghrebi", JO: "jordanian", IQ: "iraqi", KW: "kuwaiti",
        AE: "gulf", BH: "bahraini", LB: "lebanese", AR: "standard",
      };
      return arabicAccentMap[region] || "standard";

    case "it":
      if (speaker.displayName) {
        const lowerName = speaker.displayName.toLowerCase();
        if (lowerName.includes("milano") || lowerName.includes("milan") || lowerName.includes("north")) {
          return "northern";
        }
        if (lowerName.includes("napoli") || lowerName.includes("naples") || lowerName.includes("south")) {
          return "southern";
        }
      }
      return "standard";

    case "de":
      const germanAccentMap: Record<string, string> = {
        DE: "standard", AT: "austrian", CH: "swiss",
      };
      return germanAccentMap[region] || "standard";

    case "pt":
      return region === "BR" ? "brazilian" : "european";

    case "zh":
      const chineseAccentMap: Record<string, string> = {
        CN: "mandarin", TW: "taiwanese", HK: "cantonese",
      };
      return chineseAccentMap[region] || "standard";

    case "pl":
      if (speaker.displayName) {
        const lowerName = speaker.displayName.toLowerCase();
        if (lowerName.includes("warsaw") || lowerName.includes("mazov")) {
          return "mazovian";
        }
      }
      return "standard";

    case "sv":
      return "swedish";

    default:
      return "standard";
  }
}

function mapLovoAgeRange(ageRange: string): string {
  if (ageRange.includes("young") || ageRange.includes("18-25")) return "young";
  if (ageRange.includes("old") || parseInt(ageRange.split("-")[0]) > 50) return "old";
  return "middle_aged";
}

function mapLovoStyleToDescription(speaker: LovoSpeaker): string | undefined {
  if (speaker.speakerStyles[0]?.displayName) {
    const styleName = speaker.speakerStyles[0].displayName.toLowerCase();
    if (styleName.includes("casual")) return "conversational";
    if (styleName.includes("formal")) return "professional";
    if (styleName.includes("cheerful") || styleName.includes("happy")) return "upbeat";
    if (styleName.includes("serious")) return "authoritative";
    if (styleName.includes("soft")) return "calm";
    return styleName.split(" ")[0];
  }
  return speaker.gender.toLowerCase() === "female" ? "pleasant" : "neutral";
}

function inferUseCase(speakerType: string): string | undefined {
  const type = speakerType.toLowerCase();
  if (type.includes("narration") || type.includes("audio_book")) return "narration";
  if (type.includes("advertisement")) return "advertisement";
  if (type.includes("announcement")) return "announcement";
  if (type.includes("social")) return "social_media";
  if (type.includes("character")) return "characters";
  return "general";
}
