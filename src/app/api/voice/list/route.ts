import { NextRequest, NextResponse } from "next/server";
import { normalizeLanguageCode } from "@/utils/language";
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
    console.log(`Data saved to ${filePath}`);
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
      console.log(
        `Mapping multilingual voice with accent "${accent}" to Spanish (es-ES)`
      );
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
        // Derive additional attributes based on available Lovo data
        age: speaker.ageRange ? mapLovoAgeRange(speaker.ageRange) : undefined,
        description: mapLovoStyleToDescription(speaker),
        use_case: inferUseCase(speaker.speakerType),
        style: speaker.speakerStyles[0].displayName || undefined,
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

    // Save raw ElevenLabs data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(data, `elevenlabs-raw-${timestamp}.json`);
    }

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
        age: voice.labels?.age || undefined,
        description: voice.labels?.description || undefined,
        use_case: voice.labels?.use_case || undefined,
      };
    });

    // Save processed ElevenLabs data if requested
    if (saveData) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await saveJsonToFile(voices, `elevenlabs-processed-${timestamp}.json`);
    }

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
    // OpenAI TTS has 6 voices with emotional variants for better variety
    const openAIVoiceVariants = [
      // Alloy variants
      { id: "alloy", name: "Alloy", gender: "neutral", description: "Neutral and balanced", style: "Default" },
      { id: "alloy-confident", name: "Alloy (Confident)", gender: "neutral", description: "Neutral and balanced", style: "confident" },
      { id: "alloy-casual", name: "Alloy (Casual)", gender: "neutral", description: "Neutral and balanced", style: "casual" },
      
      // Echo variants
      { id: "echo", name: "Echo", gender: "male", description: "Warm and conversational", style: "Default" },
      { id: "echo-excited", name: "Echo (Excited)", gender: "male", description: "Warm and conversational", style: "excited" },
      { id: "echo-serious", name: "Echo (Serious)", gender: "male", description: "Warm and conversational", style: "serious" },
      
      // Fable variants
      { id: "fable", name: "Fable", gender: "neutral", description: "Expressive and dynamic", style: "Default" },
      { id: "fable-dramatic", name: "Fable (Dramatic)", gender: "neutral", description: "Expressive and dynamic", style: "dramatic" },
      { id: "fable-playful", name: "Fable (Playful)", gender: "neutral", description: "Expressive and dynamic", style: "playful" },
      
      // Onyx variants
      { id: "onyx", name: "Onyx", gender: "male", description: "Deep and authoritative", style: "Default" },
      { id: "onyx-authoritative", name: "Onyx (Authoritative)", gender: "male", description: "Deep and authoritative", style: "authoritative" },
      { id: "onyx-calm", name: "Onyx (Calm)", gender: "male", description: "Deep and authoritative", style: "calm" },
      
      // Nova variants
      { id: "nova", name: "Nova", gender: "female", description: "Friendly and warm", style: "Default" },
      { id: "nova-cheerful", name: "Nova (Cheerful)", gender: "female", description: "Friendly and warm", style: "cheerful" },
      { id: "nova-professional", name: "Nova (Professional)", gender: "female", description: "Friendly and warm", style: "formal" },
      
      // Shimmer variants
      { id: "shimmer", name: "Shimmer", gender: "female", description: "Soft and gentle", style: "Default" },
      { id: "shimmer-whispering", name: "Shimmer (Whispering)", gender: "female", description: "Soft and gentle", style: "whispering" },
      { id: "shimmer-warm", name: "Shimmer (Warm)", gender: "female", description: "Soft and gentle", style: "warm" }
    ];

    // OpenAI supports these languages
    const openAILanguages = [
      "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl", "en",
      "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu", "is", "id", "it", "ja", "kn",
      "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi", "ne", "no", "fa", "pl", "pt", "ro",
      "ru", "sr", "sk", "sl", "es", "sw", "sv", "tl", "ta", "th", "tr", "uk", "ur", "vi", "cy"
    ];

    // Create voice entries for each language
    const voicesByLanguage: { [key: string]: Voice[] } = {};
    
    openAILanguages.forEach(langCode => {
      // Map short codes to our Language format
      const languageMap: { [key: string]: string } = {
        "en": "en-US",
        "es": "es-ES",
        "fr": "fr-FR",
        "de": "de-DE",
        "it": "it-IT",
        "pt": "pt-BR",
        "nl": "nl-NL",
        "pl": "pl-PL",
        "ru": "ru-RU",
        "ja": "ja-JP",
        "ko": "ko-KR",
        "zh": "zh-CN",
        "ar": "ar-SA",
        "hi": "hi-IN",
        "sv": "sv-SE",
        "da": "da-DK",
        "fi": "fi-FI",
        "no": "nb-NO",
        "tr": "tr-TR",
        "cs": "cs-CZ",
        "el": "el-GR",
        "he": "he-IL",
        "hu": "hu-HU",
        "id": "id-ID",
        "th": "th-TH",
        "vi": "vi-VN",
        "uk": "uk-UA",
        "ro": "ro-RO",
        "bg": "bg-BG",
        "hr": "hr-HR",
        "sk": "sk-SK",
        "sl": "sl-SI",
        "lt": "lt-LT",
        "lv": "lv-LV",
        "et": "et-EE",
        "fa": "fa-IR",
        "ur": "ur-PK",
        "ta": "ta-IN",
        "bn": "bn-BD",
        "mr": "mr-IN",
        "kn": "kn-IN",
        "sw": "sw-KE",
        "ca": "ca-ES",
        "gl": "gl-ES",
        "eu": "eu-ES",
        "mk": "mk-MK",
        "bs": "bs-BA",
        "sr": "sr-RS",
        "sq": "sq-AL",
        "az": "az-AZ",
        "kk": "kk-KZ",
        "be": "be-BY", // Belarusian
        "hy": "hy-AM", // Armenian
        "ne": "ne-NP", // Nepali
        "mi": "mi-NZ", // Maori
        "cy": "cy-GB", // Welsh
        "is": "is-IS", // Icelandic
        "ms": "ms-MY", // Malay
        "tl": "tl-PH", // Tagalog
        "nb": "nb-NO", // Norwegian Bokmål
        "af": "af-ZA"
      };
      
      const normalizedLang = languageMap[langCode] || `${langCode}-${langCode.toUpperCase()}`;
      
      voicesByLanguage[normalizedLang] = openAIVoiceVariants.map(voice => ({
        id: `${voice.id}-${langCode}`,
        name: voice.name,
        gender: voice.gender === "neutral" ? null : voice.gender as "male" | "female",
        language: normalizedLang,
        description: voice.description,
        use_case: "general",
        age: "middle_aged",
        isMultilingual: true,
        accent: "neutral",
        style: voice.style
      } as Voice));
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
