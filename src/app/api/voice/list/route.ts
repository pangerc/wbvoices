import { NextRequest, NextResponse } from "next/server";
import { normalizeLanguageCode } from "@/utils/language";
// Normalization is now handled during cache ingestion; avoid duplicating here
import path from "path";
import { promises as fsPromises } from "fs";

// Create directory if it doesn't exist
const ensureDirectoryExists = async (dirPath: string) => {
  try {
    await fsPromises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
  }
};

// Save JSON data to file
const saveJsonToFile = async (
  data: Record<string, unknown> | unknown[],
  fileName: string
) => {
  try {
    const dataDir = path.join(process.cwd(), "data");
    await ensureDirectoryExists(dataDir);
    const filePath = path.join(dataDir, fileName);
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving data to ${fileName}:`, error);
  }
};

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels?: {
    gender?: string;
    accent?: string;
    description?: string;
    age?: string;
    use_case?: string;
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
  age?: string;
  description?: string;
  use_case?: string;
  style?: string;
};

type LovoVoice = {
  id: string;
  name: string;
  gender: string;
  sampleUrl: string;
  accent?: string;
  age?: string;
  description?: string;
  use_case?: string;
  style?: string;
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

  // Special case for Spanish accents - if a voice has "peninsular" or "latin american" accent
  // and is multilingual, assume it's a Spanish voice regardless of what the API reports
  if (isMultilingual && accent) {
    if (
      accentLower.includes("peninsular") ||
      accentLower.includes("latin american")
    ) {
      return {
        language: "es-ES",
        isMultilingual: true,
        accent,
      };
    }
  }

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
      // Polish mappings
      polish: "pl-PL",
      mazovian: "pl-PL",
      warsaw: "pl-PL",
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
      return accent;

    case "it":
      // Italian accents - Northern and Southern regions
      const italianAccentMap: Record<string, string> = {
        IT: "standard", // Standard Italian
      };
      // Check for specific cities/regions that map to accents
      if (speaker.displayName) {
        const lowerName = speaker.displayName.toLowerCase();
        if (
          lowerName.includes("milano") ||
          lowerName.includes("milan") ||
          lowerName.includes("north")
        ) {
          return "northern";
        }
        if (
          lowerName.includes("napoli") ||
          lowerName.includes("naples") ||
          lowerName.includes("south")
        ) {
          return "southern";
        }
      }
      return italianAccentMap[region] || "standard";

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

    case "pl":
      // Polish accents
      const polishAccentMap: Record<string, string> = {
        PL: "standard",
      };
      // Check for specific regions that map to accents
      if (speaker.displayName) {
        const lowerName = speaker.displayName.toLowerCase();
        if (lowerName.includes("warsaw") || lowerName.includes("mazov")) {
          return "mazovian";
        }
      }
      return polishAccentMap[region] || "standard";

    case "sv":
      // Swedish accents
      const swedishAccentMap: Record<string, string> = {
        SE: "swedish", // Default Swedish accent
      };
      return swedishAccentMap[region] || "swedish";

    default:
      // For languages without defined regional accents, default to standard
      // This prevents country codes from being interpreted as meaningless accents
      return "standard";
  }
};

// Map Lovo age ranges to standardized categories that match ElevenLabs
const mapLovoAgeRange = (ageRange: string): string => {
  if (ageRange.includes("young") || ageRange.includes("18-25")) return "young";
  if (ageRange.includes("old") || parseInt(ageRange.split("-")[0]) > 50)
    return "old";
  return "middle_aged"; // default for most adult voices
};

// Map Lovo speaker characteristics to a descriptive tone/personality
const mapLovoStyleToDescription = (
  speaker: LovoSpeaker
): string | undefined => {
  // Extract style information from first speaking style if available
  if (speaker.speakerStyles[0]?.displayName) {
    const styleName = speaker.speakerStyles[0].displayName.toLowerCase();

    // Map common style keywords to descriptive terms
    if (styleName.includes("casual")) return "conversational";
    if (styleName.includes("formal")) return "professional";
    if (styleName.includes("cheerful") || styleName.includes("happy"))
      return "upbeat";
    if (styleName.includes("serious")) return "authoritative";
    if (styleName.includes("soft")) return "calm";

    // If no specific mapping, return first part of style name as description
    return styleName.split(" ")[0];
  }

  // Default descriptions based on gender if no style info available
  return speaker.gender.toLowerCase() === "female" ? "pleasant" : "neutral";
};

// Infer use case based on speaker type
const inferUseCase = (speakerType: string): string | undefined => {
  const type = speakerType.toLowerCase();

  if (type.includes("narration") || type.includes("audio_book"))
    return "narration";
  if (type.includes("advertisement")) return "advertisement";
  if (type.includes("announcement")) return "announcement";
  if (type.includes("social")) return "social_media";
  if (type.includes("character")) return "characters";

  return "general"; // Default use case
};

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const language = req.nextUrl.searchParams.get("language");
  const saveData = req.nextUrl.searchParams.get("saveData") === "true";

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

    // Save raw Lovo data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(data, `lovo-raw-${timestamp}.json`);
    }

    const speakers: LovoSpeaker[] = data.data;

    // Group speakers by language
    const voicesByLanguage: LovoVoicesByLanguage = {};

    for (const speaker of speakers) {
      // Skip deprecated speakers or those without styles
      if (!speaker.speakerStyles.length) {
        continue;
      }

      // 🎭 CREATE SEPARATE VOICE ENTRY FOR EACH STYLE!
      for (const style of speaker.speakerStyles) {
        // Skip deprecated styles
        if (style.deprecated) {
          continue;
        }

        // Use a composite ID that encodes both the speaker and the exact style ID
        // This allows TTS generation to send { speaker, speakerStyle } precisely
        const styleId = `${speaker.id}|${style.id}`;

        const voice: LovoVoice = {
          id: styleId, // speakerId|styleId (exact mapping for TTS)
          name:
            style.displayName === "Default"
              ? speaker.displayName
              : `${speaker.displayName} (${style.displayName})`,
          gender: speaker.gender.toLowerCase(),
          sampleUrl: style.sampleTtsUrl || "/samples/default.mp3",
          // Derive additional attributes based on available Lovo data
          age: speaker.ageRange ? mapLovoAgeRange(speaker.ageRange) : undefined,
          description:
            style.displayName === "Default"
              ? mapLovoStyleToDescription(speaker)
              : style.displayName.toLowerCase(),
          use_case: inferUseCase(speaker.speakerType),
          style: style.displayName,
        };

        // Extract accent information
        const accent = extractAccentFromSpeaker(speaker);
        if (accent) {
          voice.accent = accent;
        }

        // Normalize the language code
        const normalizedLocale = normalizeLanguageCode(speaker.locale);

        if (!voicesByLanguage[normalizedLocale]) {
          voicesByLanguage[normalizedLocale] = [];
        }
        voicesByLanguage[normalizedLocale].push(voice);
      }
    }

    // Save processed Lovo data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(
        voicesByLanguage,
        `lovo-processed-${timestamp}.json`
      );
    }

    // If language is specified, return only voices for that language
    if (language && language in voicesByLanguage) {
      return NextResponse.json({
        voicesByLanguage: {
          [language]: voicesByLanguage[language],
        },
      });
    }

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

    // Save raw ElevenLabs data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(data, `elevenlabs-raw-${timestamp}.json`);
    }

    const voices = data.voices.flatMap((voice: ElevenLabsVoice): Voice[] => {

      // For voices with verified_languages, create multiple entries (one per language)
      if (voice.verified_languages && voice.verified_languages.length > 0) {
        return voice.verified_languages.map((langString) => {
          const normalizedLanguage = normalizeLanguageCode(langString);

          return {
            id: `${voice.voice_id}-${langString}`,
            name: voice.name,
            gender: voice.labels?.gender || null,
            sampleUrl: voice.preview_url || null,
            language: normalizedLanguage,
            isMultilingual: voice.verified_languages!.length > 1,
            accent: voice.labels?.accent || undefined,
            age: voice.labels?.age || undefined,
            description: voice.labels?.description || undefined,
            use_case: voice.labels?.use_case || undefined,
          };
        });
      }

      // Fallback for voices without verified_languages (use original logic)
      const { language, isMultilingual, accent } = getVoiceLanguage(voice);
      const normalizedLanguage = normalizeLanguageCode(language);

      return [{
        id: voice.voice_id,
        name: voice.name,
        gender: voice.labels?.gender || null,
        sampleUrl: voice.preview_url || null,
        language: normalizedLanguage,
        isMultilingual,
        accent,
        age: voice.labels?.age || undefined,
        description: voice.labels?.description || undefined,
        use_case: voice.labels?.use_case || undefined,
      }];
    });

    // Save processed ElevenLabs data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(voices, `elevenlabs-processed-${timestamp}.json`);
    }

    // Calculate unique languages (no logging)
    // const uniqueLanguages = [...new Set(voices.map((v: Voice) => v.language))].sort();

    // If language is specified, filter voices
    if (language) {
      const filteredVoices = voices.filter((v: Voice) => {
        // Show voice if it matches the requested language directly
        if (v.language === language) return true;

        // Show multilingual voices for all language filters
        if (v.isMultilingual) return true;

        // Special case: For Spanish-accented voices, show them in English filters too
        // And for English voices, show them in Spanish filters if they have Spanish accent
        if (
          language === "en-US" &&
          v.language === "es-ES" &&
          v.accent &&
          (v.accent.includes("peninsular") ||
            v.accent.includes("latin american"))
        ) {
          return true;
        }

        return false;
      });
      return NextResponse.json({ voices: filteredVoices });
    }

    return NextResponse.json({ voices });
  } else if (provider === "openai") {
    // OpenAI TTS voices - updated with latest voice catalog
    // qualityTier: "poor" = English-only, "good"/"excellent" = multilingual suitable
    const openAIVoiceVariants = [
      // Original 6 voices with updated data
      {
        id: "alloy",
        name: "Alloy",
        gender: "male", // Updated from neutral - perceived as male/ambiguous per table
        description: "Balanced, neutral, clear",
        style: "Default",
        qualityTier: "poor", // Not recommended for multilingual - strong English optimization
      },
      {
        id: "echo",
        name: "Echo",
        gender: "male",
        description: "Calm, measured, thoughtful", // Updated description from table
        style: "Default",
        qualityTier: "poor", // Not recommended for multilingual - English-primed, accent persists
      },
      {
        id: "fable",
        name: "Fable",
        gender: "male", // Updated from neutral per table
        description: "Warm, engaging, storytelling", // Updated description from table
        style: "Default",
        qualityTier: "excellent", // Better for multilingual - more natural in languages like German
      },
      {
        id: "onyx",
        name: "Onyx",
        gender: "male",
        description: "Deep, authoritative",
        style: "Default",
        qualityTier: "poor", // Not recommended for multilingual - English-centric
      },
      {
        id: "nova",
        name: "Nova",
        gender: "female",
        description: "Bright, energetic, enthusiastic", // Updated description from table
        style: "Default",
        qualityTier: "excellent", // Better for multilingual - relatively stronger performance
      },
      {
        id: "shimmer",
        name: "Shimmer",
        gender: "female",
        description: "Soft, gentle, soothing", // Updated description from table
        style: "Default",
        qualityTier: "good", // Not specified in table - assume multilingual suitable
      },

      // New voices from expanded catalog
      {
        id: "ash",
        name: "Ash",
        gender: "male",
        description: "Mature, sophisticated",
        style: "Default",
        qualityTier: "poor", // Not specified - likely similar to Alloy/Echo; assume English-focused
      },
      {
        id: "ballad",
        name: "Ballad",
        gender: "male",
        description: "Smooth, melodic",
        style: "Default",
        qualityTier: "good", // Not specified - assume similar constraints as other new voices
      },
      {
        id: "coral",
        name: "Coral",
        gender: "female",
        description: "Vibrant, lively",
        style: "Default",
        qualityTier: "good", // Not specified - assume multilingual suitable
      },
      {
        id: "sage",
        name: "Sage",
        gender: "male",
        description: "Wise, contemplative",
        style: "Default",
        qualityTier: "poor", // Not specified - likely similar to other English-optimized voices
      },
    ];

    // OpenAI supports these languages
    const openAILanguages = [
      "af",
      "ar",
      "hy",
      "az",
      "be",
      "bs",
      "bg",
      "ca",
      "zh",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "et",
      "fi",
      "fr",
      "gl",
      "de",
      "el",
      "he",
      "hi",
      "hu",
      "is",
      "id",
      "it",
      "ja",
      "kn",
      "kk",
      "ko",
      "lv",
      "lt",
      "mk",
      "ms",
      "mr",
      "mi",
      "ne",
      "no",
      "fa",
      "pl",
      "pt",
      "ro",
      "ru",
      "sr",
      "sk",
      "sl",
      "es",
      "sw",
      "sv",
      "tl",
      "ta",
      "th",
      "tr",
      "uk",
      "ur",
      "vi",
      "cy",
    ];

    // Create voice entries for each language
    const voicesByLanguage: { [key: string]: Voice[] } = {};

    openAILanguages.forEach((langCode) => {
      // Map short codes to our Language format
      const languageMap: { [key: string]: string } = {
        en: "en-US",
        es: "es-ES",
        fr: "fr-FR",
        de: "de-DE",
        it: "it-IT",
        pt: "pt-BR",
        nl: "nl-NL",
        pl: "pl-PL",
        ru: "ru-RU",
        ja: "ja-JP",
        ko: "ko-KR",
        zh: "zh-CN",
        ar: "ar-SA",
        hi: "hi-IN",
        sv: "sv-SE",
        da: "da-DK",
        fi: "fi-FI",
        no: "nb-NO",
        tr: "tr-TR",
        cs: "cs-CZ",
        el: "el-GR",
        he: "he-IL",
        hu: "hu-HU",
        id: "id-ID",
        th: "th-TH",
        vi: "vi-VN",
        uk: "uk-UA",
        ro: "ro-RO",
        bg: "bg-BG",
        hr: "hr-HR",
        sk: "sk-SK",
        sl: "sl-SI",
        lt: "lt-LT",
        lv: "lv-LV",
        et: "et-EE",
        fa: "fa-IR",
        ur: "ur-PK",
        ta: "ta-IN",
        bn: "bn-BD",
        mr: "mr-IN",
        kn: "kn-IN",
        sw: "sw-KE",
        ca: "ca-ES",
        gl: "gl-ES",
        eu: "eu-ES",
        mk: "mk-MK",
        bs: "bs-BA",
        sr: "sr-RS",
        sq: "sq-AL",
        az: "az-AZ",
        kk: "kk-KZ",
        be: "be-BY", // Belarusian
        hy: "hy-AM", // Armenian
        ne: "ne-NP", // Nepali
        mi: "mi-NZ", // Maori
        cy: "cy-GB", // Welsh
        is: "is-IS", // Icelandic
        ms: "ms-MY", // Malay
        tl: "tl-PH", // Tagalog
        nb: "nb-NO", // Norwegian Bokmål
        af: "af-ZA",
      };

      const normalizedLang =
        languageMap[langCode] || `${langCode}-${langCode.toUpperCase()}`;

      // Filter voices based on language - restrict poor quality voices for non-English
      const isEnglish = langCode === "en";
      const filteredVoices = isEnglish
        ? openAIVoiceVariants // All voices for English
        : openAIVoiceVariants.filter(
            (voice: { qualityTier?: string }) => voice.qualityTier !== "poor"
          ); // No Echo for non-English

      voicesByLanguage[normalizedLang] = filteredVoices.map(
        (voice) =>
          ({
            id: `${voice.id}-${langCode}`,
            name: voice.name,
            gender:
              voice.gender === "neutral"
                ? null
                : (voice.gender as "male" | "female"),
            language: normalizedLang,
            description: voice.description,
            use_case: "general",
            age: "middle_aged",
            isMultilingual: true,
            accent: "neutral",
            style: voice.style,
          } as Voice)
      );
    });

    // For language filter
    if (language) {
      const filteredVoices = voicesByLanguage[language] || [];
      return NextResponse.json({ voices: filteredVoices });
    }

    return NextResponse.json({ voicesByLanguage });
  } else {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }
}
