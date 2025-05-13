import { NextRequest, NextResponse } from "next/server";
import { normalizeLanguageCode } from "@/utils/language";

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels?: {
    gender?: string;
    accent?: string;
    description?: string;
  };
  preview_url?: string;
  high_quality_base_model_ids?: string[];
  verified_languages?: string[];
  fine_tuning?: {
    language?: string;
  };
};

type Voice = {
  id: string;
  name: string;
  gender: string | null;
  sampleUrl: string | null;
  language: string;
  isMultilingual: boolean;
  accent?: string;
};

type LovoVoice = {
  id: string;
  name: string;
  gender: string;
  sampleUrl: string;
  accent?: string;
};

type LovoVoicesByLanguage = {
  [key: string]: LovoVoice[];
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

// Map Eleven Labs voices to languages
const getVoiceLanguage = (
  voice: ElevenLabsVoice
): { language: string; isMultilingual: boolean; accent?: string } => {
  let isMultilingual = false;
  let accent = undefined;

  // Check for multilingual models
  if (
    voice.high_quality_base_model_ids &&
    voice.high_quality_base_model_ids.includes("eleven_multilingual_v2")
  ) {
    isMultilingual = true;
  }

  // Extract accent information from labels
  if (voice.labels && voice.labels.accent) {
    accent = voice.labels.accent;
  }

  // Process accent information to determine most likely language
  const accentLower = accent ? accent.toLowerCase() : "";

  // For multilingual voices, determine the primary language from accent
  if (isMultilingual && accent) {
    // Special handling for mapped accents
    const accentToLanguageMap: Record<string, string> = {
      italian: "it-IT",
      swedish: "sv-SE",
      american: "en-US",
      british: "en-GB",
      irish: "en-IE",
      australian: "en-AU",
      canadian: "en-CA",
      "us southern": "en-US",
      southern: "en-US",
      transatlantic: "en-US",
      spanish: "es-ES",
      mexican: "es-MX",
      colombian: "es-CO",
      argentinian: "es-AR",
      french: "fr-FR",
      parisian: "fr-FR",
      "canadian french": "fr-CA",
      german: "de-DE",
      austrian: "de-AT",
      "swiss german": "de-CH",
      portuguese: "pt-PT",
      brazilian: "pt-BR",
      russian: "ru-RU",
      egyptian: "ar-EG",
      gulf: "ar-SA",
      saudi: "ar-SA",
      jordanian: "ar-JO",
      mandarin: "zh-CN",
      cantonese: "zh-HK",
      japanese: "ja-JP",
    };

    // Check for specific accent matches
    for (const [accentKeyword, langCode] of Object.entries(
      accentToLanguageMap
    )) {
      if (accentLower.includes(accentKeyword)) {
        return {
          language: langCode,
          isMultilingual: true,
          accent,
        };
      }
    }
  }

  // If the voice has verified languages, use the first one
  if (voice.verified_languages && voice.verified_languages.length > 0) {
    const langRaw = voice.verified_languages[0];
    const lang = typeof langRaw === "string" ? langRaw.toLowerCase() : "en-US";

    // If only language code is provided (like 'en'), normalize it to standard format
    if (lang.length === 2) {
      return {
        language: normalizeLanguageCode(lang),
        isMultilingual,
        accent,
      };
    }

    // Otherwise normalize the full language code
    return {
      language: normalizeLanguageCode(lang),
      isMultilingual,
      accent,
    };
  }

  // If the voice has a language in fine_tuning, use that
  if (voice.fine_tuning?.language) {
    const lang = voice.fine_tuning.language.toLowerCase();
    return {
      language: normalizeLanguageCode(lang),
      isMultilingual,
      accent,
    };
  }

  // Default to English if no language information available
  return {
    language: "en-US",
    isMultilingual,
    accent,
  };
};

// Helper to extract accent from Lovo speaker data
const extractAccentFromSpeaker = (speaker: LovoSpeaker): string | undefined => {
  // Get locale and normalize it
  const locale = normalizeLanguageCode(speaker.locale);
  const [lang, region] = locale.split("-");

  // Extract accent based on language family
  switch (lang) {
    case "en":
      // English accents
      const englishAccentMap: Record<string, string> = {
        US: "american",
        GB: "british",
        AU: "australian",
        IE: "irish",
        CA: "canadian",
        IN: "indian",
      };
      return englishAccentMap[region] || "standard";

    case "es":
      // Spanish accents
      const spanishAccentMap: Record<string, string> = {
        ES: "castilian",
        MX: "mexican",
        AR: "argentinian",
        CO: "colombian",
        CL: "chilean",
        PE: "peruvian",
      };
      return spanishAccentMap[region] || "standard";

    case "fr":
      // French accents
      const frenchAccentMap: Record<string, string> = {
        FR: "parisian",
        CA: "canadian",
        BE: "belgian",
        CH: "swiss",
      };
      return frenchAccentMap[region] || "standard";

    case "ar":
      // Arabic accents
      const arabicAccentMap: Record<string, string> = {
        SA: "saudi",
        EG: "egyptian",
        DZ: "maghrebi",
        MA: "maghrebi",
        TN: "maghrebi",
        JO: "jordanian",
        IQ: "iraqi",
        KW: "kuwaiti",
        AE: "gulf",
        BH: "bahraini",
        LB: "lebanese",
        // Fallback for any other Arabic variants
        AR: "standard",
      };
      const accent = arabicAccentMap[region] || "standard";
      console.log(
        `Mapped Arabic voice with region ${region} to accent: ${accent}`
      );
      return accent;

    case "it":
      // Italian accents - most italian voices just use "italian" accent
      return "italian";

    case "de":
      // German accents
      const germanAccentMap: Record<string, string> = {
        DE: "standard",
        AT: "austrian",
        CH: "swiss",
      };
      return germanAccentMap[region] || "standard";

    case "pt":
      // Portuguese accents
      return region === "BR" ? "brazilian" : "european";

    case "zh":
      // Chinese accents
      const chineseAccentMap: Record<string, string> = {
        CN: "mandarin",
        TW: "taiwanese",
        HK: "cantonese",
      };
      return chineseAccentMap[region] || "standard";

    default:
      // For other languages, return a meaningful accent based on region if available
      return region ? `${region.toLowerCase()}` : "standard";
  }
};

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const language = req.nextUrl.searchParams.get("language");

  if (!provider) {
    return NextResponse.json(
      { error: "Provider is required" },
      { status: 400 }
    );
  }

  if (provider === "lovo") {
    const apiKey = process.env.LOVO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Lovo API key is missing" },
        { status: 500 }
      );
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
      console.error("Lovo API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch voices from Lovo" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const speakers: LovoSpeaker[] = data.data;

    // Group speakers by language
    const voicesByLanguage: LovoVoicesByLanguage = {};

    for (const speaker of speakers) {
      // Skip deprecated speakers or those without styles
      if (
        !speaker.speakerStyles.length ||
        speaker.speakerStyles[0].deprecated
      ) {
        continue;
      }

      const voice: LovoVoice = {
        id: speaker.id,
        name: speaker.displayName,
        gender: speaker.gender.toLowerCase(),
        sampleUrl:
          speaker.speakerStyles[0].sampleTtsUrl || "/samples/default.mp3",
      };

      // Extract accent information
      const accent = extractAccentFromSpeaker(speaker);
      if (accent) {
        voice.accent = accent;
        console.log(
          `Voice "${speaker.displayName}" (${speaker.locale}): accent = "${accent}"`
        );
      }

      // Normalize the language code
      const normalizedLocale = normalizeLanguageCode(speaker.locale);

      if (!voicesByLanguage[normalizedLocale]) {
        voicesByLanguage[normalizedLocale] = [];
      }
      voicesByLanguage[normalizedLocale].push(voice);
    }

    // If language is specified, return only voices for that language
    if (language && language in voicesByLanguage) {
      console.log(
        "Returning voices for language:",
        language,
        voicesByLanguage[language]
      );
      return NextResponse.json({
        voicesByLanguage: {
          [language]: voicesByLanguage[language],
        },
      });
    }

    console.log(
      "Returning all voices by language:",
      Object.keys(voicesByLanguage)
    );
    return NextResponse.json({ voicesByLanguage });
  } else if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Eleven Labs API key is missing" },
        { status: 500 }
      );
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
      console.error("Eleven Labs API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch voices from Eleven Labs" },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log(
      "First voice example:",
      JSON.stringify(data.voices[0], null, 2)
    );
    console.log("Voice models:", data.voices[0].high_quality_base_model_ids);
    console.log("Voice labels:", data.voices[0].labels);
    console.log("Voice fine tuning:", data.voices[0].fine_tuning);
    console.log("Voice verified languages:", data.voices[0].verified_languages);

    const voices = data.voices.map((voice: ElevenLabsVoice): Voice => {
      const { language, isMultilingual, accent } = getVoiceLanguage(voice);

      // Normalize language codes for consistency
      const normalizedLanguage = normalizeLanguageCode(language);

      console.log(
        `Voice "${
          voice.name
        }" - Language: ${normalizedLanguage}, Multilingual: ${isMultilingual}, Accent: ${
          accent || "none"
        }`
      );

      return {
        id: voice.voice_id,
        name: voice.name,
        gender: voice.labels?.gender || null,
        sampleUrl: voice.preview_url || null,
        language: normalizedLanguage,
        isMultilingual,
        accent,
      };
    });

    // Log unique languages for debugging
    const uniqueLanguages = [
      ...new Set(voices.map((v: Voice) => v.language)),
    ].sort();
    console.log("Available languages:", uniqueLanguages);
    console.log(
      "Number of multilingual voices:",
      voices.filter((v: Voice) => v.isMultilingual).length
    );

    // If language is specified, filter voices
    if (language) {
      const filteredVoices = voices.filter(
        (v: Voice) => v.language === language || v.isMultilingual
      );
      return NextResponse.json({ voices: filteredVoices });
    }

    return NextResponse.json({ voices });
  } else {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
}
