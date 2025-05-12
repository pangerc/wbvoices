import { NextRequest, NextResponse } from "next/server";

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
  // Check if voice supports multiple languages
  const isMultilingual =
    voice.high_quality_base_model_ids?.some((id) =>
      id.includes("multilingual")
    ) || false;

  // Get accent if available
  const accent = voice.labels?.accent;
  const accentLower = accent?.toLowerCase() || "";

  // For non-multilingual voices with American accent, default to en-US
  if (!isMultilingual && accentLower.includes("american")) {
    return {
      language: "en-US",
      isMultilingual: false,
      accent,
    };
  }

  // For multilingual voices, determine the primary language from accent
  if (isMultilingual && accent) {
    // Special handling for Italian accent
    if (accentLower === "italian") {
      return {
        language: "it-IT",
        isMultilingual: true,
        accent,
      };
    }

    // Special handling for Swedish accent
    if (accentLower === "swedish") {
      return {
        language: "sv-SE",
        isMultilingual: true,
        accent,
      };
    }

    // For English accents, use en-US
    if (
      accentLower.includes("american") ||
      accentLower.includes("british") ||
      accentLower.includes("irish") ||
      accentLower.includes("australian") ||
      accentLower.includes("transatlantic")
    ) {
      return {
        language: "en-US",
        isMultilingual: true,
        accent,
      };
    }
  }

  // If the voice has verified languages, use the first one
  if (voice.verified_languages && voice.verified_languages.length > 0) {
    const langRaw = voice.verified_languages[0];
    const lang = typeof langRaw === "string" ? langRaw.toLowerCase() : "en-US";
    // Map common language codes to our format
    const langMap: Record<string, string> = {
      en: "en-US",
      it: "it-IT",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      sv: "sv-SE",
    };
    return {
      language: langMap[lang] || `${lang}-${lang.toUpperCase()}`,
      isMultilingual,
      accent,
    };
  }

  // If the voice has a language in fine_tuning, use that
  if (voice.fine_tuning?.language) {
    const lang = voice.fine_tuning.language.toLowerCase();
    const langMap: Record<string, string> = {
      en: "en-US",
      it: "it-IT",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      sv: "sv-SE",
    };
    return {
      language: langMap[lang] || `${lang}-${lang.toUpperCase()}`,
      isMultilingual,
      accent,
    };
  }

  // Default to en-US for any remaining voices
  return {
    language: "en-US",
    isMultilingual: isMultilingual,
    accent,
  };
};

// Helper function to normalize language codes
const normalizeLanguageCode = (locale: string): string => {
  // Split the locale into language and region
  const [lang, region] = locale.split("-");

  // Map of language codes to their standardized format
  const langMap: Record<string, string> = {
    // English variants
    en: "en-US",
    // German variants
    de: "de-DE",
    // French variants
    fr: "fr-FR",
    // Spanish variants
    es: "es-ES",
    // Other languages
    it: "it-IT",
    sv: "sv-SE",
    sl: "sl-SI",
    hr: "hr-HR",
    lt: "lt-LT",
    bs: "bs-BA",
    cy: "cy-GB",
    bn: "bn-IN",
    // Arabic variants
    ar: "ar-SA", // Default to Saudi Arabia for Arabic
    // Asian languages
    zh: "zh-CN", // Default to Simplified Chinese
    ja: "ja-JP",
    ko: "ko-KR",
    // Indian languages
    hi: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    ml: "ml-IN",
    // Other standardized mappings
    am: "am-ET", // Amharic
    hy: "hy-AM", // Armenian
    az: "az-AZ", // Azerbaijani
    eu: "eu-ES", // Basque
    be: "be-BY", // Belarusian
    bg: "bg-BG", // Bulgarian
    my: "my-MM", // Burmese
    ca: "ca-ES", // Catalan
    cs: "cs-CZ", // Czech
    da: "da-DK", // Danish
    et: "et-EE", // Estonian
    fi: "fi-FI", // Finnish
    ka: "ka-GE", // Georgian
    el: "el-GR", // Greek
    gu: "gu-IN", // Gujarati
    he: "he-IL", // Hebrew
    hu: "hu-HU", // Hungarian
    is: "is-IS", // Icelandic
    id: "id-ID", // Indonesian
    kk: "kk-KZ", // Kazakh
    km: "km-KH", // Khmer
    lo: "lo-LA", // Lao
    lv: "lv-LV", // Latvian
    mk: "mk-MK", // Macedonian
    ms: "ms-MY", // Malay
    mn: "mn-MN", // Mongolian
    ne: "ne-NP", // Nepali
    no: "nb-NO", // Norwegian
    fa: "fa-IR", // Persian
    pl: "pl-PL", // Polish
    pt: "pt-PT", // Portuguese
    ro: "ro-RO", // Romanian
    ru: "ru-RU", // Russian
    sr: "sr-RS", // Serbian
    si: "si-LK", // Sinhala
    sk: "sk-SK", // Slovak
    so: "so-SO", // Somali
    sw: "sw-KE", // Swahili
    tl: "tl-PH", // Tagalog
    th: "th-TH", // Thai
    tr: "tr-TR", // Turkish
    uk: "uk-UA", // Ukrainian
    ur: "ur-PK", // Urdu
    uz: "uz-UZ", // Uzbek
    vi: "vi-VN", // Vietnamese
  };

  // If we have a direct mapping for the language code, use it
  if (lang && langMap[lang.toLowerCase()]) {
    return langMap[lang.toLowerCase()];
  }

  // If we have both language and region, format them properly
  if (lang && region) {
    return `${lang.toLowerCase()}-${region.toUpperCase()}`;
  }

  // If we only have language, use language code with itself as region
  return `${lang.toLowerCase()}-${lang.toUpperCase()}`;
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
      console.log(
        `Voice "${
          voice.name
        }" - Language: ${language}, Multilingual: ${isMultilingual}, Accent: ${
          accent || "none"
        }`
      );

      return {
        id: voice.voice_id,
        name: voice.name,
        gender: voice.labels?.gender || null,
        sampleUrl: voice.preview_url || null,
        language,
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
