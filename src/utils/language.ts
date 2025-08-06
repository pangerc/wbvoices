// ISO language family definitions - languages that should be treated as related
export const languageFamilies: Record<string, string[]> = {
  arabic: [
    "ar-SA",
    "ar-EG",
    "ar-DZ",
    "ar-JO",
    "ar-AE",
    "ar-BH",
    "ar-IQ",
    "ar-KW",
    "ar-LB",
    "ar-AR",
  ],
  english: ["en-US", "en-GB", "en-AU", "en-IE", "en-IN", "en-CA", "en-NZ"],
  spanish: ["es-ES", "es-MX", "es-AR", "es-CO", "es-CL", "es-PE"],
  french: ["fr-FR", "fr-CA", "fr-BE", "fr-CH"],
  german: ["de-DE", "de-AT", "de-CH"],
  portuguese: ["pt-PT", "pt-BR"],
  chinese: ["zh-CN", "zh-TW", "zh-HK"],
};

// Reverse mapping to find which family a language belongs to
export const getLanguageFamily = (languageCode: string): string | null => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  for (const [family, codes] of Object.entries(languageFamilies)) {
    if (codes.includes(normalizedCode)) {
      return family;
    }
  }
  return null;
};

// Check if two language codes are in the same family
export const areSameLanguageFamily = (
  code1: string,
  code2: string
): boolean => {
  const family1 = getLanguageFamily(code1);
  const family2 = getLanguageFamily(code2);
  return family1 !== null && family1 === family2;
};

/**
 * Normalizes a language code according to ISO standards
 * Handles malformed codes like "en-US-EN-US" automatically
 */
export const normalizeLanguageCode = (locale: string): string => {
  if (!locale) return "en-US"; // Default fallback

  // Handle completely malformed codes with regex
  if (!locale.match(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,3})?/)) {
    return "en-US"; // Default to English for completely invalid codes
  }

  // Handle codes with more than one hyphen (like en-US-EN-US)
  if (locale.split("-").length > 2) {
    const parts = locale.split("-");
    // Take just the first two parts (language-region)
    locale = `${parts[0]}-${parts[1]}`;
  }

  // Split the locale into language and region
  const [lang, region] = locale.split("-");

  // If we have both language and region, format them properly
  if (lang && region) {
    return `${lang.toLowerCase()}-${region.toUpperCase()}`;
  }

  // If we only have language, use standard region codes based on ISO
  const standardRegions: Record<string, string> = {
    en: "US",
    es: "ES",
    fr: "FR",
    de: "DE",
    it: "IT",
    pt: "PT",
    ru: "RU",
    zh: "CN",
    ja: "JP",
    ko: "KR",
    ar: "SA",
    // Add more as needed based on ISO standards
  };

  if (lang && standardRegions[lang.toLowerCase()]) {
    return `${lang.toLowerCase()}-${standardRegions[lang.toLowerCase()]}`;
  }

  // Last resort - use language code for both parts
  return `${lang.toLowerCase()}-${lang.toUpperCase()}`;
};

// Languages that should be shown as a single language option with multiple accents
// rather than as separate language choices in the dropdown
export const unifiedDisplayLanguages = [
  "ar", // Arabic variants
  "en", // English variants
  "es", // Spanish variants
  "fr", // French variants
  "de", // German variants
  "pt", // Portuguese variants
  "zh", // Chinese variants
];

/**
 * Get display name for a language based on its code
 * Uses standard language naming
 */
export const getLanguageName = (code: string): string => {
  const normalizedCode = normalizeLanguageCode(code);
  const [lang, region] = normalizedCode.split("-");

  // Base language names according to ISO standards
  const baseLanguageNames: Record<string, string> = {
    en: "English",
    ar: "Arabic",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    nl: "Dutch",
    sv: "Swedish",
    fi: "Finnish",
    da: "Danish",
    no: "Norwegian",
    pl: "Polish",
    tr: "Turkish",
    cs: "Czech",
    hu: "Hungarian",
    hi: "Hindi",
    bn: "Bengali",
    ta: "Tamil",
    te: "Telugu",
    ml: "Malayalam",
    th: "Thai",
    vi: "Vietnamese",
    id: "Indonesian",
    ms: "Malay",
    fil: "Filipino",
    he: "Hebrew",
    ro: "Romanian",
    uk: "Ukrainian",
    el: "Greek",
    bg: "Bulgarian",
    hr: "Croatian",
    sr: "Serbian",
    sk: "Slovak",
    sl: "Slovenian",
    et: "Estonian",
    lv: "Latvian",
    lt: "Lithuanian",
    af: "Afrikaans",
    eu: "Basque",
    ca: "Catalan",
    gl: "Galician",
    ga: "Irish",
    cy: "Welsh",
    is: "Icelandic",
    fa: "Persian",
    ur: "Urdu",
    pa: "Punjabi",
    kn: "Kannada",
    mr: "Marathi",
    gu: "Gujarati",
    or: "Odia",
    my: "Burmese",
    km: "Khmer",
    lo: "Lao",
    am: "Amharic",
    sw: "Swahili",
    zu: "Zulu",
    yo: "Yoruba",
    ig: "Igbo",
    ha: "Hausa",
    so: "Somali",
    si: "Sinhala",
    mn: "Mongolian",
    hy: "Armenian",
    ka: "Georgian",
    az: "Azerbaijani",
    kk: "Kazakh",
    uz: "Uzbek",
    tg: "Tajik",
    ky: "Kyrgyz",
    tk: "Turkmen",
    ug: "Uyghur",
    ps: "Pashto",
    sd: "Sindhi",
    ne: "Nepali",
    bo: "Tibetan",
    dz: "Dzongkha",
    jv: "Javanese",
    su: "Sundanese",
    bs: "Bosnian",
    mk: "Macedonian",
    sq: "Albanian",
    mt: "Maltese",
    yue: "Cantonese",
    wuu: "Wu Chinese",
    be: "Belarusian",
    mi: "Maori",
    nb: "Norwegian Bokmål",
    tl: "Tagalog",
    multi: "Multilingual",
  };

  // For languages that should be unified in display, ignore region in name
  if (unifiedDisplayLanguages.includes(lang)) {
    return baseLanguageNames[lang.toLowerCase()] || lang;
  }

  // Region names for common regions
  const regionNames: Record<string, string> = {
    US: "US",
    GB: "UK",
    AU: "Australia",
    CA: "Canada",
    IE: "Ireland",
    IN: "India",
    SA: "Saudi Arabia",
    EG: "Egypt",
    ES: "Spain",
    MX: "Mexico",
    AR: "Argentina",
    FR: "France",
    BE: "Belgium",
    CH: "Switzerland",
    DE: "Germany",
    AT: "Austria",
    PT: "Portugal",
    BR: "Brazil",
    RU: "Russia",
    CN: "China",
    TW: "Taiwan",
    HK: "Hong Kong",
    JP: "Japan",
    KR: "Korea",
    IT: "Italy",
  };

  // Special cases where region shouldn't be shown
  const skipRegion = ["CN", "JP", "KR", "IT", "RU", "SA", "DE", "FR"];

  // Get base language name
  const baseName = baseLanguageNames[lang.toLowerCase()] || lang;

  // If it's a special "multi-LINGUAL" code
  if (code === "multi-LINGUAL") {
    return "Multilingual";
  }

  // For most major languages, don't show region for the primary region
  if (
    skipRegion.includes(region) &&
    normalizedCode === `${lang.toLowerCase()}-${region}`
  ) {
    return baseName;
  }

  // Add region for other cases
  const regionName = regionNames[region];
  return regionName ? `${baseName} (${regionName})` : baseName;
};

/**
 * Get the flag code for a language
 * Uses ISO country codes
 */
export const getFlagCode = (languageCode: string): string => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const [, region] = normalizedCode.split("-");

  // Special cases
  const specialCases: Record<string, string> = {
    "multi-LINGUAL": "un", // UN flag for multilingual
    "en-GB": "gb", // Use GB flag for British English
  };

  if (specialCases[languageCode]) {
    return specialCases[languageCode];
  }

  // Convert region code to lowercase for flag icons
  return region.toLowerCase();
};

/**
 * Get possible accents for a language based on its code or language family
 */
export const getLanguageAccents = (languageCode: string): string[] => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const family = getLanguageFamily(normalizedCode) || "";
  const [lang] = normalizedCode.split("-");

  // Language family to accent mapping
  const accentMap: Record<string, string[]> = {
    english: [
      "standard",
      "american",
      "british",
      "australian",
      "canadian",
      "irish",
      "scottish",
      "indian",
    ],
    arabic: [
      "standard",
      "saudi",
      "egyptian",
      "gulf",
      "maghrebi",
      "lebanese",
      "jordanian",
      "iraqi",
      "kuwaiti",
      "bahraini",
    ],
    spanish: [
      "standard",
      "castilian",
      "mexican",
      "argentinian",
      "colombian",
      "chilean",
      "peruvian",
    ],
    french: [
      "standard",
      "parisian",
      "canadian",
      "belgian",
      "swiss",
      "southern",
    ],
    german: ["standard", "austrian", "swiss", "bavarian", "berlin"],
    portuguese: ["standard", "european", "brazilian"],
    chinese: ["standard", "mandarin", "cantonese", "taiwanese", "shanghainese"],
    // Add other languages as needed
  };

  // Generic language to accent mapping for languages not in a family
  const genericAccents: Record<string, string[]> = {
    it: ["standard", "northern", "central", "southern", "sicilian"],
    ru: ["standard", "moscow", "st. petersburg"],
    ja: ["standard", "tokyo", "kansai", "osaka"],
    ko: ["standard", "seoul"],
    sv: ["standard", "stockholm", "finland swedish"],
    // Add more as needed
  };

  // Try to get accents from language family
  if (family && accentMap[family]) {
    return ["none", ...accentMap[family]];
  }

  // Try to get accents from generic language mapping
  if (genericAccents[lang.toLowerCase()]) {
    return ["none", ...genericAccents[lang.toLowerCase()]];
  }

  // Default to just "standard" if no specific accents defined
  return ["none", "standard"];
};

/**
 * Format accent name for display
 */
export const formatAccentName = (accent: string): string => {
  if (!accent) return "None";

  // Handle various forms of "none"
  if (["none", "standard"].includes(accent.toLowerCase())) {
    return "None";
  }

  // Special case mappings for known accent formats
  const specialCases: Record<string, string> = {
    "us-southern": "US Southern",
    "us southern": "US Southern",
    southern: "Southern",
    american: "American",
    british: "British",
    australian: "Australian",
    canadian: "Canadian",
    irish: "Irish",
    scottish: "Scottish",
    indian: "Indian",
    castilian: "Castilian",
    mexican: "Mexican",
    gulf: "Gulf",
    saudi: "Saudi",
    egyptian: "Egyptian",
    lebanese: "Lebanese",
    maghrebi: "Maghrebi",
    jordanian: "Jordanian",
    iraqi: "Iraqi",
    kuwaiti: "Kuwaiti",
    bahraini: "Bahraini",
    parisian: "Parisian",
    belgian: "Belgian",
    swiss: "Swiss",
    italian: "Italian",
    mandarin: "Mandarin",
    cantonese: "Cantonese",
    taiwanese: "Taiwanese",
  };

  const lowerAccent = accent.toLowerCase();
  if (specialCases[lowerAccent]) {
    return specialCases[lowerAccent];
  }

  // Split by hyphens, spaces, or other delimiters and capitalize each word
  return accent
    .split(/[\s-_.,]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export type Language =
  | "af-ZA"
  | "am-ET"
  | "ar-AR" // Arabic (generic)
  | "ar-DZ"
  | "ar-EG"
  | "ar-SA"
  | "ar-AE"
  | "ar-BH"
  | "ar-JO"
  | "ar-IQ"
  | "ar-KW"
  | "ar-LB"
  | "az-AZ"
  | "bg-BG"
  | "bn-BD"
  | "bn-IN"
  | "bs-BA"
  | "ca-ES"
  | "cs-CZ"
  | "cy-GB"
  | "da-DK"
  | "de-AT"
  | "de-CH"
  | "de-DE"
  | "el-GR"
  | "en-AU"
  | "en-GB"
  | "en-IE"
  | "en-IN"
  | "en-US"
  | "es-ES"
  | "es-MX"
  | "et-EE"
  | "eu-ES"
  | "fa-IR"
  | "fi-FI"
  | "fil-PH"
  | "fr-BE"
  | "fr-CA"
  | "fr-CH"
  | "fr-FR"
  | "ga-IE"
  | "gl-ES"
  | "gu-IN"
  | "he-IL"
  | "hi-IN"
  | "hr-HR"
  | "hu-HU"
  | "hy-AM"
  | "id-ID"
  | "is-IS"
  | "it-IT"
  | "ja-JP"
  | "jv-ID"
  | "ka-GE"
  | "kk-KZ"
  | "km-KH"
  | "kn-IN"
  | "ko-KR"
  | "lo-LA"
  | "lt-LT"
  | "lv-LV"
  | "mk-MK"
  | "ml-IN"
  | "mn-MN"
  | "mr-IN"
  | "ms-MY"
  | "mt-MT"
  | "multi-LINGUAL"
  | "my-MM"
  | "nb-NO"
  | "ne-NP"
  | "nl-BE"
  | "nl-NL"
  | "pl-PL"
  | "ps-AF"
  | "pt-BR"
  | "pt-PT"
  | "ro-RO"
  | "ru-RU"
  | "si-LK"
  | "sk-SK"
  | "sl-SI"
  | "so-SO"
  | "sq-AL"
  | "sr-RS"
  | "su-ID"
  | "sv-SE"
  | "sw-KE"
  | "ta-IN"
  | "te-IN"
  | "th-TH"
  | "tr-TR"
  | "uk-UA"
  | "ur-PK"
  | "uz-UZ"
  | "vi-VN"
  | "wuu-CN"
  | "yue-CN"
  | "zh-CN"
  | "zh-HK"
  | "zh-TW"
  | "zu-ZA";
