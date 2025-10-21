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
 * Normalizes a language code for unified voice database
 * Converts provider-specific codes to unified base languages while preserving accents
 *
 * Examples:
 * - Lovo: "es-AR" → "es" (Argentinian preserved in accent)
 * - ElevenLabs: "es-ES" → "es" (Castilian preserved in accent)
 * - OpenAI: "es" → "es" (neutral preserved in accent)
 */
export const normalizeLanguageCode = (locale: string): string => {
  // Type guard: ensure locale is a string
  if (typeof locale !== 'string' || !locale) {
    return "en"; // Default fallback for non-string or empty values
  }

  // Handle completely malformed codes with regex
  if (!locale.match(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,3})?/)) {
    return "es"; // Default to Spanish for completely invalid codes
  }

  // Handle codes with more than one hyphen (like en-US-EN-US)
  if (locale.split("-").length > 2) {
    const parts = locale.split("-");
    // Take just the first two parts (language-region)
    locale = `${parts[0]}-${parts[1]}`;
  }

  // Split the locale into language and region
  const [lang, region] = locale.split("-");

  // For unified voice database, we normalize to base language only
  // The region/country info is preserved in the accent field instead

  // Special cases for languages with complex variations
  const languageMapping: Record<string, string> = {
    // Chinese variants all normalize to "zh"
    "zh-CN": "zh",
    "zh-TW": "zh",
    "zh-HK": "zh",
    "yue-CN": "zh", // Cantonese → Chinese
    "wuu-CN": "zh", // Wu → Chinese

    // Arabic variants all normalize to "ar"
    "ar-SA": "ar",
    "ar-EG": "ar",
    "ar-DZ": "ar",
    "ar-AR": "ar",
    "ar-JO": "ar",
    "ar-AE": "ar",
    "ar-BH": "ar",
    "ar-IQ": "ar",
    "ar-KW": "ar",
    "ar-LB": "ar",

    // Spanish variants all normalize to "es"
    "es-ES": "es",
    "es-MX": "es",
    "es-AR": "es",
    "es-CO": "es",
    "es-CL": "es",
    "es-PE": "es",
    "es-US": "es",
    "es-VE": "es",
    "es-EC": "es",
    "es-GT": "es",
    "es-CR": "es",
    "es-PA": "es",
    "es-DO": "es",
    "es-HN": "es",
    "es-NI": "es",
    "es-PY": "es",
    "es-SV": "es",
    "es-UY": "es",
    "es-BO": "es",
    "es-CU": "es",
    "es-GQ": "es",
    "es-PR": "es",

    // English variants all normalize to "en"
    "en-US": "en",
    "en-GB": "en",
    "en-AU": "en",
    "en-CA": "en",
    "en-IE": "en",
    "en-IN": "en",
    "en-NZ": "en",
    "en-ZA": "en",
    "en-SG": "en",
    "en-PH": "en",
    "en-HK": "en",
    "en-KE": "en",
    "en-NG": "en",
    "en-GH": "en",
    "en-TZ": "en",

    // French variants all normalize to "fr"
    "fr-FR": "fr",
    "fr-CA": "fr",
    "fr-BE": "fr",
    "fr-CH": "fr",

    // Portuguese variants all normalize to "pt"
    "pt-PT": "pt",
    "pt-BR": "pt",

    // German variants all normalize to "de"
    "de-DE": "de",
    "de-AT": "de",
    "de-CH": "de",

    // Special cases
    "multi-LINGUAL": "multi",
    "nb-NO": "no", // Norwegian Bokmål → Norwegian
  };

  // Check for exact mapping first
  if (languageMapping[locale]) {
    return languageMapping[locale];
  }

  // If we have a region, check if there's a mapping for the full code
  const fullCode = region
    ? `${lang.toLowerCase()}-${region.toUpperCase()}`
    : locale;
  if (languageMapping[fullCode]) {
    return languageMapping[fullCode];
  }

  // Otherwise, just return the base language code
  return lang.toLowerCase();
};

// Languages that have multiple regional accents and should be unified
// These correspond to the major world languages with significant regional variations
export const unifiedDisplayLanguages = [
  "ar", // Arabic (Saudi, Egyptian, Gulf, Maghrebi, Levantine, etc.)
  "en", // English (American, British, Australian, Canadian, Indian, etc.)
  "es", // Spanish (Castilian, Mexican, Argentinian, Colombian, etc.)
  "fr", // French (Parisian, Canadian, Belgian, Swiss, etc.)
  "de", // German (Standard, Austrian, Swiss, Bavarian, etc.)
  "pt", // Portuguese (European, Brazilian, etc.)
  "zh", // Chinese (Mandarin, Cantonese, Taiwanese, etc.)
];

/**
 * Get display name for a language based on its code
 * Works with both original provider codes and normalized codes
 */
export const getLanguageName = (code: string): string => {
  // For display purposes, we sometimes want the original code's region info
  // but for the voice system, we work with normalized codes
  const [lang, region] = code.split("-");

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
    nb: "Norwegian",
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
    tl: "Tagalog",
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
    be: "Belarusian",
    mi: "Maori",
    multi: "Multilingual",
  };

  // Special handling for multilingual
  if (code === "multi-LINGUAL" || code === "multi") {
    return "Multilingual";
  }

  // For normalized codes (no region), return base language name
  if (!region) {
    return baseLanguageNames[lang.toLowerCase()] || lang;
  }

  // For unified display languages, show base name only (region info in accent)
  if (unifiedDisplayLanguages.includes(lang)) {
    return baseLanguageNames[lang.toLowerCase()] || lang;
  }

  // Region names for non-unified languages that still show regions
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
    NL: "Netherlands",
    SE: "Sweden",
    FI: "Finland",
    DK: "Denmark",
    NO: "Norway",
    PL: "Poland",
    TR: "Turkey",
    CZ: "Czech Republic",
    HU: "Hungary",
    TH: "Thailand",
    VN: "Vietnam",
    ID: "Indonesia",
    MY: "Malaysia",
    PH: "Philippines",
    IL: "Israel",
    RO: "Romania",
    UA: "Ukraine",
    GR: "Greece",
    BG: "Bulgaria",
    HR: "Croatia",
    RS: "Serbia",
    SK: "Slovakia",
    SI: "Slovenia",
    EE: "Estonia",
    LV: "Latvia",
    LT: "Lithuania",
    ZA: "South Africa",
    IS: "Iceland",
    IR: "Iran",
    PK: "Pakistan",
    BD: "Bangladesh",
    MM: "Myanmar",
    KH: "Cambodia",
    LA: "Laos",
    ET: "Ethiopia",
    KE: "Kenya",
    SO: "Somalia",
    LK: "Sri Lanka",
    MN: "Mongolia",
    AM: "Armenia",
    GE: "Georgia",
    AZ: "Azerbaijan",
    KZ: "Kazakhstan",
    UZ: "Uzbekistan",
    AF: "Afghanistan",
    NP: "Nepal",
    BA: "Bosnia and Herzegovina",
    MK: "North Macedonia",
    AL: "Albania",
    MT: "Malta",
    BY: "Belarus",
    NZ: "New Zealand",
  };

  // Get base language name
  const baseName = baseLanguageNames[lang.toLowerCase()] || lang;

  // Add region for detailed language variants
  const regionName = regionNames[region?.toUpperCase()];
  return regionName ? `${baseName} (${regionName})` : baseName;
};

/**
 * Get the flag code for a language
 * Uses appropriate flags for normalized language codes
 */
export const getFlagCode = (languageCode: string): string => {
  // For normalized language codes (no region), use representative flags
  const flagMapping: Record<string, string> = {
    // Major languages
    en: "us", // English → US flag (most common)
    es: "es", // Spanish → Spain flag
    fr: "fr", // French → France flag
    de: "de", // German → Germany flag
    it: "it", // Italian → Italy flag
    pt: "pt", // Portuguese → Portugal flag
    ar: "sa", // Arabic → Saudi Arabia flag (most common)
    zh: "cn", // Chinese → China flag
    ja: "jp", // Japanese → Japan flag
    ko: "kr", // Korean → South Korea flag
    ru: "ru", // Russian → Russia flag
    multi: "un", // Multilingual → UN flag
    "multi-LINGUAL": "un", // Alternative multilingual → UN flag

    // European languages
    sl: "si", // Slovenian → Slovenia flag
    hr: "hr", // Croatian → Croatia flag
    cs: "cz", // Czech → Czech Republic flag
    sk: "sk", // Slovak → Slovakia flag
    pl: "pl", // Polish → Poland flag
    hu: "hu", // Hungarian → Hungary flag
    ro: "ro", // Romanian → Romania flag
    bg: "bg", // Bulgarian → Bulgaria flag
    sr: "rs", // Serbian → Serbia flag
    bs: "ba", // Bosnian → Bosnia and Herzegovina flag
    mk: "mk", // Macedonian → North Macedonia flag
    sq: "al", // Albanian → Albania flag
    et: "ee", // Estonian → Estonia flag
    lv: "lv", // Latvian → Latvia flag
    lt: "lt", // Lithuanian → Lithuania flag
    fi: "fi", // Finnish → Finland flag
    sv: "se", // Swedish → Sweden flag
    no: "no", // Norwegian → Norway flag
    da: "dk", // Danish → Denmark flag
    is: "is", // Icelandic → Iceland flag
    nl: "nl", // Dutch → Netherlands flag
    el: "gr", // Greek → Greece flag
    mt: "mt", // Maltese → Malta flag
    ga: "ie", // Irish → Ireland flag
    cy: "gb", // Welsh → Great Britain flag (Wales part of UK)
    uk: "ua", // Ukrainian → Ukraine flag
    be: "by", // Belarusian → Belarus flag

    // Asian languages
    hi: "in", // Hindi → India flag
    bn: "bd", // Bengali → Bangladesh flag (most speakers)
    ur: "pk", // Urdu → Pakistan flag
    ta: "in", // Tamil → India flag (most speakers)
    te: "in", // Telugu → India flag
    mr: "in", // Marathi → India flag
    gu: "in", // Gujarati → India flag
    kn: "in", // Kannada → India flag
    ml: "in", // Malayalam → India flag
    pa: "in", // Punjabi → India flag (most speakers)
    ne: "np", // Nepali → Nepal flag
    si: "lk", // Sinhala → Sri Lanka flag
    my: "mm", // Myanmar → Myanmar flag
    km: "kh", // Khmer → Cambodia flag
    lo: "la", // Lao → Laos flag
    th: "th", // Thai → Thailand flag
    vi: "vn", // Vietnamese → Vietnam flag
    id: "id", // Indonesian → Indonesia flag
    ms: "my", // Malay → Malaysia flag
    tl: "ph", // Filipino/Tagalog → Philippines flag
    jv: "id", // Javanese → Indonesia flag
    su: "id", // Sundanese → Indonesia flag

    // Middle Eastern and African languages
    he: "il", // Hebrew → Israel flag
    fa: "ir", // Persian → Iran flag
    tr: "tr", // Turkish → Turkey flag
    az: "az", // Azerbaijani → Azerbaijan flag
    ka: "ge", // Georgian → Georgia flag
    hy: "am", // Armenian → Armenia flag
    kk: "kz", // Kazakh → Kazakhstan flag
    ky: "kg", // Kyrgyz → Kyrgyzstan flag
    uz: "uz", // Uzbek → Uzbekistan flag
    mn: "mn", // Mongolian → Mongolia flag
    af: "za", // Afrikaans → South Africa flag
    zu: "za", // Zulu → South Africa flag
    sw: "ke", // Swahili → Kenya flag (major usage)
    so: "so", // Somali → Somalia flag
    am: "et", // Amharic → Ethiopia flag
    ha: "ng", // Hausa → Nigeria flag
    yo: "ng", // Yoruba → Nigeria flag
    ig: "ng", // Igbo → Nigeria flag

    // Other languages
    eu: "es", // Basque → Spain flag (largest population)
    ca: "es", // Catalan → Spain flag (largest population)
    gl: "es", // Galician → Spain flag
    br: "fr", // Breton → France flag
    co: "fr", // Corsican → France flag
    rm: "ch", // Romansh → Switzerland flag
    lb: "lu", // Luxembourgish → Luxembourg flag
  };

  // Handle special cases first
  if (flagMapping[languageCode]) {
    return flagMapping[languageCode];
  }

  // For codes with regions, extract region
  const [lang, region] = languageCode.split("-");

  if (region) {
    // Special region mappings
    const specialCases: Record<string, string> = {
      "en-GB": "gb", // British English
      "zh-TW": "tw", // Traditional Chinese
      "zh-HK": "hk", // Hong Kong Chinese
    };

    if (specialCases[languageCode]) {
      return specialCases[languageCode];
    }

    // Convert region code to lowercase for flag icons
    return region.toLowerCase();
  }

  // For base language codes, use the mapping or default to the language code
  return flagMapping[lang] || lang;
};

// Regional groupings for accents - groups accents by geographic regions
export const accentRegions: Record<string, Record<string, string[]>> = {
  en: {
    north_america: ["american", "canadian"],
    europe: ["british", "irish", "scottish"],
    oceania: ["australian"],
    asia: ["indian"],
  },
  es: {
    europe: ["castilian", "peninsular", "spanish"],
    latin_america: [
      "latin_american",
      "mexican",
      "argentinian",
      "colombian",
      "chilean",
      "peruvian",
      "venezuelan",
      "ecuadorian",
      "cuban",
      "puerto_rican",
    ],
    africa: ["equatorial_guinean"],
  },
  ar: {
    middle_east: [
      "standard", // Modern Standard Arabic (MSA)
      "saudi",
      "gulf",
      "kuwaiti",
      "bahraini",
      "jordanian",
      "lebanese",
      "iraqi",
      "syrian",
      "palestinian",
    ],
    africa: [
      "egyptian",
      "maghrebi",
      "algerian",
      "moroccan",
      "tunisian",
      "libyan",
    ],
  },
  fr: {
    europe: ["parisian", "belgian", "swiss"],
    north_america: ["canadian"],
    africa: ["southern"],
  },
  pt: {
    europe: ["european"],
    south_america: ["brazilian"],
  },
  zh: {
    mainland: ["neutral", "mandarin", "beijing"],
    regional_dialects: ["shanghai", "sichuan"],
    hong_kong: ["cantonese"],
    taiwan: ["taiwanese"],
  },
};

// Region display names
export const regionDisplayNames: Record<string, string> = {
  north_america: "North America",
  south_america: "South America",
  latin_america: "Latin America",
  europe: "Europe",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
  middle_east: "Middle East",
  mainland: "Mainland China",
  regional_dialects: "Regional Dialects",
  hong_kong: "Hong Kong",
  taiwan: "Taiwan",
};

/**
 * Check if a language has regional variations
 */
export const hasRegionalAccents = (languageCode: string): boolean => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const [lang] = normalizedCode.split("-");
  return !!(accentRegions[lang] && Object.keys(accentRegions[lang]).length > 1);
};

/**
 * Get available regions for a language
 */
export const getLanguageRegions = (
  languageCode: string
): Array<{ code: string; displayName: string }> => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const [lang] = normalizedCode.split("-");

  if (!accentRegions[lang]) return [];

  return Object.keys(accentRegions[lang]).map((regionCode) => ({
    code: regionCode,
    displayName: regionDisplayNames[regionCode] || regionCode,
  }));
};

/**
 * Get accents for a specific language and region
 */
export const getRegionalAccents = (
  languageCode: string,
  regionCode: string
): string[] => {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const [lang] = normalizedCode.split("-");

  if (!accentRegions[lang] || !accentRegions[lang][regionCode]) {
    return ["standard"];
  }

  return ["none", ...accentRegions[lang][regionCode]];
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

// Normalized Language Type - base languages only (no regions)
// This matches the normalized codes from normalizeLanguageCode()
export type Language =
  | "af" // Afrikaans
  | "am" // Amharic
  | "ar" // Arabic (unified)
  | "az" // Azerbaijani
  | "bg" // Bulgarian
  | "bn" // Bengali
  | "bs" // Bosnian
  | "ca" // Catalan
  | "cs" // Czech
  | "cy" // Welsh
  | "da" // Danish
  | "de" // German (unified)
  | "el" // Greek
  | "en" // English (unified)
  | "es" // Spanish (unified)
  | "et" // Estonian
  | "eu" // Basque
  | "fa" // Persian
  | "fi" // Finnish
  | "fil" // Filipino
  | "fr" // French (unified)
  | "ga" // Irish
  | "gl" // Galician
  | "gu" // Gujarati
  | "he" // Hebrew
  | "hi" // Hindi
  | "hr" // Croatian
  | "hu" // Hungarian
  | "hy" // Armenian
  | "id" // Indonesian
  | "is" // Icelandic
  | "it" // Italian
  | "ja" // Japanese
  | "jv" // Javanese
  | "ka" // Georgian
  | "kk" // Kazakh
  | "km" // Khmer
  | "kn" // Kannada
  | "ko" // Korean
  | "lo" // Lao
  | "lt" // Lithuanian
  | "lv" // Latvian
  | "mk" // Macedonian
  | "ml" // Malayalam
  | "mn" // Mongolian
  | "mr" // Marathi
  | "ms" // Malay
  | "mt" // Maltese
  | "multi" // Multilingual
  | "my" // Burmese
  | "nb" // Norwegian Bokmål
  | "ne" // Nepali
  | "nl" // Dutch
  | "no" // Norwegian (normalized from nb)
  | "pl" // Polish
  | "ps" // Pashto
  | "pt" // Portuguese (unified)
  | "ro" // Romanian
  | "ru" // Russian
  | "si" // Sinhala
  | "sk" // Slovak
  | "sl" // Slovenian
  | "so" // Somali
  | "sq" // Albanian
  | "sr" // Serbian
  | "su" // Sundanese
  | "sv" // Swedish
  | "sw" // Swahili
  | "ta" // Tamil
  | "te" // Telugu
  | "th" // Thai
  | "tl" // Tagalog
  | "tr" // Turkish
  | "uk" // Ukrainian
  | "ur" // Urdu
  | "uz" // Uzbek
  | "vi" // Vietnamese
  | "zh" // Chinese (unified)
  | "zu"; // Zulu
