import { Language, normalizeLanguageCode } from "@/utils/language";

export type AccentDefinition = {
  code: string; // "mexican", "kuwaiti", "american"
  displayName: string; // "Mexican Spanish", "Kuwaiti Arabic"
  region: string; // "Latin America", "Gulf", "North America"
  isNeutral: boolean; // For synthetic voices (OpenAI)
  languageCode: Language; // Associated language
};

/**
 * 🔥 THE DRAGON'S WEAKNESS: Comprehensive accent registry
 * Critical for LATAM and MENA markets where accent authenticity matters
 */
// Updated accent registry for normalized language codes
export const ACCENT_REGISTRY: Record<string, AccentDefinition[]> = {
  // SPANISH - CRITICAL for LATAM pilot (now uses normalized "es")
  es: [
    {
      code: "castilian",
      displayName: "Castilian",
      region: "Europe",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "latin_american",
      displayName: "Latin American",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "mexican",
      displayName: "Mexican",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "argentinian",
      displayName: "Argentinian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "colombian",
      displayName: "Colombian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "chilean",
      displayName: "Chilean",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "peruvian",
      displayName: "Peruvian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "venezuelan",
      displayName: "Venezuelan",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "ecuadorian",
      displayName: "Ecuadorian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "guatemalan",
      displayName: "Guatemalan",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "costa_rican",
      displayName: "Costa Rican",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "panamanian",
      displayName: "Panamanian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "dominican",
      displayName: "Dominican",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "honduran",
      displayName: "Honduran",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "nicaraguan",
      displayName: "Nicaraguan",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "paraguayan",
      displayName: "Paraguayan",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "salvadoran",
      displayName: "Salvadoran",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "uruguayan",
      displayName: "Uruguayan",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "bolivian",
      displayName: "Bolivian",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "cuban",
      displayName: "Cuban",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
    {
      code: "puerto_rican",
      displayName: "Puerto Rican",
      region: "Latin America",
      isNeutral: false,
      languageCode: "es",
    },
  ],

  // ARABIC - CRITICAL for MENA markets (now uses normalized "ar")
  ar: [
    {
      code: "standard",
      displayName: "Modern Standard Arabic",
      region: "Pan-Arab",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "saudi",
      displayName: "Saudi",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "kuwaiti",
      displayName: "Kuwaiti",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "emirati",
      displayName: "Emirati",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "qatari",
      displayName: "Qatari",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "bahraini",
      displayName: "Bahraini",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "omani",
      displayName: "Omani",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "gulf",
      displayName: "Gulf",
      region: "Gulf",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "egyptian",
      displayName: "Egyptian",
      region: "North Africa",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "moroccan",
      displayName: "Moroccan",
      region: "Maghreb",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "algerian",
      displayName: "Algerian",
      region: "Maghreb",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "tunisian",
      displayName: "Tunisian",
      region: "Maghreb",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "libyan",
      displayName: "Libyan",
      region: "North Africa",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "jordanian",
      displayName: "Jordanian",
      region: "Levant",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "lebanese",
      displayName: "Lebanese",
      region: "Levant",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "syrian",
      displayName: "Syrian",
      region: "Levant",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "palestinian",
      displayName: "Palestinian",
      region: "Levant",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "iraqi",
      displayName: "Iraqi",
      region: "Mesopotamia",
      isNeutral: false,
      languageCode: "ar",
    },
    {
      code: "yemeni",
      displayName: "Yemeni",
      region: "Arabian Peninsula",
      isNeutral: false,
      languageCode: "ar",
    },
  ],

  // ENGLISH - Already working well (now uses normalized "en")
  en: [
    {
      code: "american",
      displayName: "American",
      region: "North America",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "british",
      displayName: "British",
      region: "British Isles",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "us_southern",
      displayName: "Southern US",
      region: "North America",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "scottish",
      displayName: "Scottish",
      region: "British Isles",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "irish",
      displayName: "Irish",
      region: "British Isles",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "australian",
      displayName: "Australian",
      region: "Oceania",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "canadian",
      displayName: "Canadian",
      region: "North America",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "south_african",
      displayName: "South African",
      region: "Africa",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "indian",
      displayName: "Indian",
      region: "South Asia",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "new_zealand",
      displayName: "New Zealand",
      region: "Oceania",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "singapore",
      displayName: "Singapore",
      region: "Southeast Asia",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "hong_kong",
      displayName: "Hong Kong",
      region: "East Asia",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "philippine",
      displayName: "Philippine",
      region: "Southeast Asia",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "kenyan",
      displayName: "Kenyan",
      region: "Africa",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "nigerian",
      displayName: "Nigerian",
      region: "Africa",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "ghanaian",
      displayName: "Ghanaian",
      region: "Africa",
      isNeutral: false,
      languageCode: "en",
    },
    {
      code: "tanzanian",
      displayName: "Tanzanian",
      region: "Africa",
      isNeutral: false,
      languageCode: "en",
    },
  ],

  // FRENCH (now uses normalized "fr")
  fr: [
    {
      code: "parisian",
      displayName: "Parisian French",
      region: "Europe",
      isNeutral: false,
      languageCode: "fr",
    },
    {
      code: "canadian",
      displayName: "Canadian French",
      region: "North America",
      isNeutral: false,
      languageCode: "fr",
    },
    {
      code: "belgian",
      displayName: "Belgian French",
      region: "Europe",
      isNeutral: false,
      languageCode: "fr",
    },
    {
      code: "swiss",
      displayName: "Swiss French",
      region: "Europe",
      isNeutral: false,
      languageCode: "fr",
    },
  ],

  // GERMAN (now uses normalized "de")
  de: [
    {
      code: "standard",
      displayName: "Standard German",
      region: "Europe",
      isNeutral: false,
      languageCode: "de",
    },
    {
      code: "austrian",
      displayName: "Austrian German",
      region: "Europe",
      isNeutral: false,
      languageCode: "de",
    },
    {
      code: "swiss",
      displayName: "Swiss German",
      region: "Europe",
      isNeutral: false,
      languageCode: "de",
    },
  ],

  // PORTUGUESE (now uses normalized "pt")
  pt: [
    {
      code: "brazilian",
      displayName: "Brazilian Portuguese",
      region: "South America",
      isNeutral: false,
      languageCode: "pt",
    },
    {
      code: "european",
      displayName: "European Portuguese",
      region: "Europe",
      isNeutral: false,
      languageCode: "pt",
    },
  ],

  // CHINESE (now uses normalized "zh")
  zh: [
    {
      code: "neutral",
      displayName: "Standard Chinese",
      region: "Mainland",
      isNeutral: true,
      languageCode: "zh",
    },
    {
      code: "mandarin",
      displayName: "Mandarin Chinese",
      region: "East Asia",
      isNeutral: false,
      languageCode: "zh",
    },
    {
      code: "beijing",
      displayName: "Beijing Dialect",
      region: "Mainland",
      isNeutral: false,
      languageCode: "zh",
    },
    {
      code: "shanghai",
      displayName: "Shanghai Dialect",
      region: "Regional",
      isNeutral: false,
      languageCode: "zh",
    },
    {
      code: "sichuan",
      displayName: "Sichuan Dialect",
      region: "Regional",
      isNeutral: false,
      languageCode: "zh",
    },
    {
      code: "cantonese",
      displayName: "Cantonese",
      region: "East Asia",
      isNeutral: false,
      languageCode: "zh",
    },
    {
      code: "taiwanese",
      displayName: "Taiwanese",
      region: "East Asia",
      isNeutral: false,
      languageCode: "zh",
    },
  ],

  // ITALIAN (now uses normalized "it")
  it: [
    {
      code: "standard",
      displayName: "Standard Italian",
      region: "Europe",
      isNeutral: false,
      languageCode: "it",
    },
    {
      code: "northern",
      displayName: "Northern Italian",
      region: "Europe",
      isNeutral: false,
      languageCode: "it",
    },
    {
      code: "southern",
      displayName: "Southern Italian",
      region: "Europe",
      isNeutral: false,
      languageCode: "it",
    },
  ],

  // POLISH (now uses normalized "pl")
  pl: [
    {
      code: "standard",
      displayName: "Standard Polish",
      region: "Europe",
      isNeutral: false,
      languageCode: "pl",
    },
    {
      code: "mazovian",
      displayName: "Mazovian Polish",
      region: "Europe",
      isNeutral: false,
      languageCode: "pl",
    },
  ],

  // SWEDISH (now uses normalized "sv")
  sv: [
    {
      code: "standard",
      displayName: "Standard Swedish",
      region: "Europe",
      isNeutral: false,
      languageCode: "sv",
    },
    {
      code: "swedish",
      displayName: "Swedish",
      region: "Europe",
      isNeutral: false,
      languageCode: "sv",
    },
  ],
};

/**
 * Get available accents for a normalized language code
 */
export function getAccentsForLanguage(
  language: Language
): { code: string; displayName: string }[] {
  // For normalized language codes, direct lookup
  const accents = ACCENT_REGISTRY[language];

  if (accents) {
    // Return simplified format for UI components
    return accents.map((accent) => ({
      code: accent.code,
      displayName: accent.displayName,
    }));
  }

  // Fallback: Create neutral accent
  return [
    {
      code: "neutral",
      displayName: `Neutral`,
    },
  ];
}

/**
 * Get default accent for a normalized language code
 */
export function getDefaultAccent(language: Language): string {
  // Language-specific defaults for normalized codes
  const defaults: Record<string, string> = {
    es: "castilian", // Spanish defaults to Castilian (most neutral)
    ar: "saudi", // Arabic defaults to Saudi (MSA-adjacent)
    en: "american", // English defaults to American
    fr: "parisian", // French defaults to Parisian
    de: "standard", // German defaults to Standard
    pt: "brazilian", // Portuguese defaults to Brazilian (larger market)
    zh: "mandarin", // Chinese defaults to Mandarin
  };

  const defaultCode = defaults[language];
  if (
    defaultCode &&
    ACCENT_REGISTRY[language]?.some((a) => a.code === defaultCode)
  ) {
    return defaultCode;
  }

  // Fallback to first available accent for the language
  const accents = ACCENT_REGISTRY[language];
  return accents?.[0]?.code || "neutral";
}

/**
 * Normalize accent code from provider data to our unified accent system
 * This handles the conversion from provider-specific accent names to our standardized ones
 */
export function normalizeAccent(
  providerAccent: string | undefined,
  originalLanguageCode?: string
): string {
  if (!providerAccent) return "neutral";

  const trimmed = providerAccent.trim();

  // Extract language and region hints from language code if provided
  let regionHint = "";
  if (originalLanguageCode) {
    const [, region] = originalLanguageCode.split("-");
    regionHint = region?.toLowerCase() || "";
  }

  const normalized = trimmed.toLowerCase();
  const baseLang = originalLanguageCode
    ? normalizeLanguageCode(originalLanguageCode).split("-")[0]
    : "";

  // Language-aware pre-normalization for Chinese
  if (baseLang === "zh") {
    if (
      normalized.includes("cantonese") ||
      normalized.includes("hong kong") ||
      normalized === "hong_kong" ||
      normalized === "hk"
    ) {
      return "cantonese";
    }
    if (
      normalized.includes("mandarin") ||
      normalized.includes("beijing") ||
      normalized.includes("putonghua")
    ) {
      return "mandarin";
    }
    if (normalized.includes("taiwan")) {
      return "taiwanese";
    }
    if (normalized === "yue") {
      return "cantonese";
    }
  }

  // Comprehensive mappings from provider data to our accent codes
  const mappings: Record<string, string> = {
    // ENGLISH MAPPINGS
    us: "american",
    "united states": "american",
    american: "american",
    "us-southern": "us_southern",
    us_southern: "us_southern",
    southern: "us_southern",
    gb: "british",
    uk: "british",
    british: "british",
    england: "british",
    au: "australian",
    australia: "australian",
    australian: "australian",
    ca: "canadian",
    canada: "canadian",
    canadian: "canadian",
    in: "indian",
    india: "indian",
    indian: "indian",
    ie: "irish",
    ireland: "irish",
    irish: "irish",
    scotland: "scottish",
    scottish: "scottish",
    za: "south_african",
    "south africa": "south_african",
    nz: "new_zealand",
    "new zealand": "new_zealand",
    sg: "singapore",
    singapore: "singapore",
    hk: "hong_kong",
    "hong kong": "hong_kong",
    ph: "philippine",
    philippines: "philippine",
    ke: "kenyan",
    kenya: "kenyan",
    ng: "nigerian",
    nigeria: "nigerian",
    gh: "ghanaian",
    ghana: "ghanaian",
    tz: "tanzanian",
    tanzania: "tanzanian",

    // SPANISH MAPPINGS
    spain: "castilian",
    es: "castilian",
    castilian: "castilian",
    peninsular: "castilian",
    spanish: "castilian", // Default Spanish to Castilian
    "latin american": "latin_american", // Preserve generic Latin American
    latin_american: "latin_american",
    mexico: "mexican",
    mx: "mexican",
    mexican: "mexican",
    argentina: "argentinian",
    argentine: "argentinian", // 🔥 ADDED: ElevenLabs uses "argentine" not "argentinian"
    ar: regionHint === "ar" ? "argentinian" : "saudi", // Context-sensitive

    // 🗡️ EXPLICIT REGION CODE MAPPINGS (for URL extraction)
    AR: "argentinian", // Argentina
    MX: "mexican", // Mexico
    SA: "saudi", // Saudi Arabia
    ES: "castilian", // Spain
    US: "american", // United States
    GB: "british", // Great Britain
    PR: "puerto_rican", // Puerto Rico
    EC: "ecuadorian", // Ecuador
    GT: "guatemalan", // Guatemala
    GQ: "equatorial_guinean", // Equatorial Guinea 🇬🇶
    CO: "colombian", // Colombia
    CL: "chilean", // Chile
    PE: "peruvian", // Peru
    VE: "venezuelan", // Venezuela
    DZ: "algerian", // Algeria
    MA: "moroccan", // Morocco
    TN: "tunisian", // Tunisia
    PS: "palestinian", // Palestine
    SY: "syrian", // Syria
    LY: "libyan", // Libya
    EG: "egyptian", // Egypt
    JO: "jordanian", // Jordan
    LB: "lebanese", // Lebanon
    IQ: "iraqi", // Iraq
    argentinian: "argentinian",
    colombia: "colombian",
    co: "colombian",
    colombian: "colombian",
    chile: "chilean",
    cl: "chilean",
    chilean: "chilean",
    peru: "peruvian",
    pe: "peruvian",
    peruvian: "peruvian",
    venezuela: "venezuelan",
    ve: "venezuelan",
    venezuelan: "venezuelan",
    ecuador: "ecuadorian",
    ec: "ecuadorian",
    guatemalan: "guatemalan",
    gt: "guatemalan",
    "costa rica": "costa_rican",
    cr: "costa_rican",
    panama: "panamanian",
    pa: "panamanian",
    dominican: "dominican",
    do: "dominican",
    honduras: "honduran",
    hn: "honduran",
    nicaragua: "nicaraguan",
    ni: "nicaraguan",
    NI: "nicaraguan", // URL code
    paraguay: "paraguayan",
    py: "paraguayan",
    PY: "paraguayan", // URL code
    "el salvador": "salvadoran",
    sv: "salvadoran",
    SV: "salvadoran", // URL code
    uruguay: "uruguayan",
    uy: "uruguayan",
    UY: "uruguayan", // URL code
    bolivia: "bolivian",
    bo: "bolivian",
    BO: "bolivian", // URL code
    cuba: "cuban",
    cu: "cuban",
    CU: "cuban", // URL code
    "puerto rico": "puerto_rican",
    pr: "puerto_rican",

    // ARABIC MAPPINGS
    "saudi arabia": "saudi",
    sa: regionHint === "sa" ? "saudi" : "south_african", // Context-sensitive
    saudi: "saudi",
    kuwait: "kuwaiti",
    kw: "kuwaiti",
    kuwaiti: "kuwaiti",
    uae: "emirati",
    ae: "emirati",
    emirates: "emirati",
    emirati: "emirati",
    qatar: "qatari",
    qa: "qatari",
    qatari: "qatari",
    bahrain: "bahraini",
    bh: "bahraini",
    bahraini: "bahraini",
    oman: "omani",
    om: "omani",
    omani: "omani",
    gulf: "gulf",
    "modern standard": "standard", // Modern Standard Arabic from ElevenLabs
    "modern standard arabic": "standard",
    modern: "standard", // Generic "modern" in Arabic context = MSA
    msa: "standard", // MSA abbreviation
    egypt: "egyptian",
    eg: "egyptian",
    egyptian: "egyptian",
    morocco: "moroccan",
    ma: "moroccan",
    moroccan: "moroccan",
    algeria: "algerian",
    dz: "algerian",
    algerian: "algerian",
    tunisia: "tunisian",
    tn: "tunisian",
    tunisian: "tunisian",
    libya: "libyan",
    ly: "libyan",
    libyan: "libyan",
    jordan: "jordanian",
    jo: "jordanian",
    jordanian: "jordanian",
    lebanon: "lebanese",
    lb: "lebanese",
    lebanese: "lebanese",
    syria: "syrian",
    sy: "syrian",
    syrian: "syrian",
    palestine: "palestinian",
    ps: "palestinian",
    palestinian: "palestinian",
    iraq: "iraqi",
    iq: "iraqi",
    iraqi: "iraqi",
    yemen: "yemeni",
    ye: "yemeni",
    yemeni: "yemeni",

    // FRENCH MAPPINGS
    france: "parisian",
    fr: "parisian",
    french: "parisian",
    parisian: "parisian",
    "canadian french": "canadian",
    quebec: "canadian",
    belgian: "belgian",
    be: "belgian",
    "swiss french": "swiss",
    switzerland: "swiss",
    ch: "swiss",

    // GERMAN MAPPINGS
    germany: "standard",
    de: "standard",
    german: "standard",
    standard: "standard",
    austria: "austrian",
    at: "austrian",
    austrian: "austrian",
    "swiss german": "swiss",

    // PORTUGUESE MAPPINGS
    brazil: "brazilian",
    br: "brazilian",
    brazilian: "brazilian",
    portugal: "european",
    pt: "european",
    european: "european",

    // CHINESE MAPPINGS
    china: "mandarin",
    cn: "mandarin",
    mandarin: "mandarin",
    beijing: "beijing", // Map beijing to beijing, not mandarin
    shanghai: "shanghai", // Shanghai dialect
    sichuan: "sichuan", // Sichuan dialect
    // TODO: "hong kong" duplicated - need language-specific mapping
    // "hong kong": "cantonese",
    // "hk": "cantonese", // Also duplicated above
    cantonese: "cantonese",
    taiwan: "taiwanese",
    tw: "taiwanese",
    taiwanese: "taiwanese",

    // POLISH MAPPINGS
    mazovian: "mazovian",
    mazowsze: "mazovian",
    warsaw: "mazovian",
    polish: "standard",

    // ITALIAN MAPPINGS
    italian: "standard",
    italy: "standard",
    it: "standard",
    romana: "standard",
    milano: "northern",
    napoli: "southern",

    // SWEDISH MAPPINGS
    swedish: "swedish",
    sverige: "swedish",
    stockholm: "standard",

    // COMMON FALLBACKS
    // NOTE: "standard" is language-specific, handled by context
    neutral: "neutral",
    none: "neutral",
    "": "neutral",
  };

  // 🗡️ CHECK UPPERCASE REGION CODES FIRST (from URL extraction)!
  if (trimmed.length === 2 && trimmed === trimmed.toUpperCase()) {
    // This looks like a region code (AR, MX, SA, etc.)
    const upperMapping = mappings[trimmed];
    if (upperMapping) {
      return upperMapping;
    }
  }

  // Special handling for "standard" which is language-specific
  if (normalized === "standard") {
    // Return "standard" as-is - it's valid for multiple languages
    // The language context will determine which standard (Italian, Polish, etc.)
    return "standard";
  }

  return mappings[normalized] || normalized;
}

/**
 * Check if accent is valid for a normalized language code
 */
export function isValidAccentForLanguage(
  language: Language,
  accent: string
): boolean {
  const availableAccents = ACCENT_REGISTRY[language] || [];
  return (
    availableAccents.some((a) => a.code === accent) || accent === "neutral"
  );
}
