export type Language =
  | "af-ZA"
  | "ar-DZ"
  | "ar-EG"
  | "ar-SA"
  | "bg-BG"
  | "bn-BD"
  | "ca-ES"
  | "cs-CZ"
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
  | "fa-IR"
  | "fi-FI"
  | "fr-BE"
  | "fr-CA"
  | "fr-CH"
  | "fr-FR"
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
  | "ml-IN"
  | "mr-IN"
  | "ms-MY"
  | "mt-MT"
  | "my-MM"
  | "nb-NO"
  | "nl-BE"
  | "nl-NL"
  | "pl-PL"
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
  | "zh-CN"
  | "zh-HK"
  | "zh-TW";

export const getFlagCode = (languageCode: string): string => {
  const mapping: Record<string, string> = {
    // English variants
    "en-US": "us",
    "en-GB": "gb",
    "en-AU": "au",
    "en-IE": "ie",
    "en-IN": "in",
    // German variants
    "de-DE": "de",
    "de-AT": "at",
    "de-CH": "ch",
    // French variants
    "fr-FR": "fr",
    "fr-BE": "be",
    "fr-CA": "ca",
    "fr-CH": "ch",
    // Spanish variants
    "es-ES": "es",
    "es-MX": "mx",
    // Other languages
    "it-IT": "it",
    "sv-SE": "se",
    "sl-SI": "si",
    "hr-HR": "hr",
    "lt-LT": "lt",
    "bs-BA": "ba",
    "cy-GB": "gb",
    "bn-IN": "in",
    "ar-DZ": "dz",
    "ar-EG": "eg",
    "ar-SA": "sa",
    "bg-BG": "bg",
    "ca-ES": "es",
    "cs-CZ": "cz",
    "da-DK": "dk",
    "el-GR": "gr",
    "et-EE": "ee",
    "fa-IR": "ir",
    "fi-FI": "fi",
    "gl-ES": "es",
    "gu-IN": "in",
    "he-IL": "il",
    "hi-IN": "in",
    "hu-HU": "hu",
    "hy-AM": "am",
    "id-ID": "id",
    "is-IS": "is",
    "ja-JP": "jp",
    "jv-ID": "id",
    "ka-GE": "ge",
    "kk-KZ": "kz",
    "km-KH": "kh",
    "kn-IN": "in",
    "ko-KR": "kr",
    "lo-LA": "la",
    "lv-LV": "lv",
    "ml-IN": "in",
    "mr-IN": "in",
    "ms-MY": "my",
    "mt-MT": "mt",
    "my-MM": "mm",
    "nb-NO": "no",
    "nl-BE": "be",
    "nl-NL": "nl",
    "pl-PL": "pl",
    "pt-BR": "br",
    "pt-PT": "pt",
    "ro-RO": "ro",
    "ru-RU": "ru",
    "si-LK": "lk",
    "sk-SK": "sk",
    "so-SO": "so",
    "sq-AL": "al",
    "sr-RS": "rs",
    "su-ID": "id",
    "sw-KE": "ke",
    "ta-IN": "in",
    "te-IN": "in",
    "th-TH": "th",
    "tr-TR": "tr",
    "uk-UA": "ua",
    "ur-PK": "pk",
    "uz-UZ": "uz",
    "vi-VN": "vn",
    "zh-CN": "cn",
    "zh-HK": "hk",
    "zh-TW": "tw",
  };
  return mapping[languageCode] || languageCode.split("-")[1].toLowerCase();
};

export const getLanguageName = (code: string): string => {
  const mapping = {
    // English variants
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "en-AU": "English (Australia)",
    "en-IE": "English (Ireland)",
    "en-IN": "English (India)",
    // German variants
    "de-DE": "German",
    "de-AT": "German (Austria)",
    "de-CH": "German (Switzerland)",
    // French variants
    "fr-FR": "French",
    "fr-BE": "French (Belgium)",
    "fr-CA": "French (Canada)",
    "fr-CH": "French (Switzerland)",
    // Spanish variants
    "es-ES": "Spanish (Spain)",
    "es-MX": "Spanish (Mexico)",
    // Arabic variants
    "ar-AE": "Arabic (UAE)",
    "ar-BH": "Arabic (Bahrain)",
    "ar-DZ": "Arabic (Algeria)",
    "ar-EG": "Arabic (Egypt)",
    "ar-SA": "Arabic (Saudi Arabia)",
    // Asian languages
    "zh-CN": "Chinese (Simplified)",
    "zh-HK": "Chinese (Hong Kong)",
    "zh-TW": "Chinese (Traditional)",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    // Indian languages
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "ml-IN": "Malayalam",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "mr-IN": "Marathi",
    // Other languages
    "af-ZA": "Afrikaans",
    "am-ET": "Amharic",
    "hy-AM": "Armenian",
    "az-AZ": "Azerbaijani",
    "eu-ES": "Basque",
    "be-BY": "Belarusian",
    "bg-BG": "Bulgarian",
    "my-MM": "Burmese",
    "ca-ES": "Catalan",
    "hr-HR": "Croatian",
    "cs-CZ": "Czech",
    "da-DK": "Danish",
    "nl-BE": "Dutch (Belgium)",
    "nl-NL": "Dutch",
    "et-EE": "Estonian",
    "fi-FI": "Finnish",
    "ka-GE": "Georgian",
    "el-GR": "Greek",
    "he-IL": "Hebrew",
    "hu-HU": "Hungarian",
    "is-IS": "Icelandic",
    "id-ID": "Indonesian",
    "it-IT": "Italian",
    "kk-KZ": "Kazakh",
    "km-KH": "Khmer",
    "lo-LA": "Lao",
    "lv-LV": "Latvian",
    "lt-LT": "Lithuanian",
    "mk-MK": "Macedonian",
    "ms-MY": "Malay",
    "mn-MN": "Mongolian",
    "ne-NP": "Nepali",
    "nb-NO": "Norwegian",
    "fa-IR": "Persian",
    "pl-PL": "Polish",
    "pt-BR": "Portuguese (Brazil)",
    "pt-PT": "Portuguese",
    "ro-RO": "Romanian",
    "ru-RU": "Russian",
    "sr-RS": "Serbian",
    "si-LK": "Sinhala",
    "sk-SK": "Slovak",
    "sl-SI": "Slovenian",
    "so-SO": "Somali",
    "sw-KE": "Swahili",
    "sv-SE": "Swedish",
    "tl-PH": "Tagalog",
    "th-TH": "Thai",
    "tr-TR": "Turkish",
    "uk-UA": "Ukrainian",
    "ur-PK": "Urdu",
    "uz-UZ": "Uzbek",
    "vi-VN": "Vietnamese",
    "cy-GB": "Welsh",
  } as const;
  return mapping[code as keyof typeof mapping] || code;
};
