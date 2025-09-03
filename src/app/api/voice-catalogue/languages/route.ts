import { NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { getLanguageName } from '@/utils/language';
import { Language } from '@/types';

// 🔥 CRITICAL: This API must return normalized language codes that match the voice towers!

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

// Languages that should be unified (show as single option)
const unifiedDisplayLanguages = ["en", "es", "ar", "zh", "pt", "fr"];

/**
 * Get all available languages from the voice catalogue
 * with proper deduplication and organization
 */
export async function GET() {
  try {
    // Get the voice data tower to extract all languages
    const stats = await voiceCatalogue.getCacheStats();
    
    if (stats.totalVoices === 0) {
      return NextResponse.json({ languages: [] });
    }
    
    // Get all voices to extract languages
    // This is a bit heavy but we need to do it once to get all languages
    
    // We'll need to get voices from each provider to build the full list
    // For now, let's get from a predefined comprehensive list
    // that matches what the providers actually have
    
    // This would ideally come from the tower, but for now we'll use
    // the actual language codes that exist in the data
    const knownLanguages = [
      "af-ZA", "sq-AL", "am-ET", "ar-DZ", "ar-BH", "ar-EG", "ar-IQ", 
      "ar-JO", "ar-KW", "ar-LB", "ar-LY", "ar-MA", "ar-OM", "ar-QA",
      "ar-SA", "ar-SY", "ar-TN", "ar-AE", "ar-YE", "hy-AM", "az-AZ",
      "eu-ES", "bn-BD", "bn-IN", "bs-BA", "bg-BG", "my-MM", "ca-ES",
      "zh-CN", "zh-HK", "zh-TW", "hr-HR", "cs-CZ", "da-DK", "nl-BE",
      "nl-NL", "en-AU", "en-CA", "en-GH", "en-HK", "en-IN", "en-IE",
      "en-KE", "en-NZ", "en-NG", "en-PH", "en-SG", "en-ZA", "en-TZ",
      "en-GB", "en-US", "et-EE", "fil-PH", "fi-FI", "fr-BE", "fr-CA",
      "fr-FR", "fr-CH", "gl-ES", "ka-GE", "de-AT", "de-DE", "de-CH",
      "el-GR", "gu-IN", "he-IL", "hi-IN", "hu-HU", "is-IS", "id-ID",
      "ga-IE", "it-IT", "ja-JP", "jv-ID", "kn-IN", "kk-KZ", "km-KH",
      "ko-KR", "lo-LA", "lv-LV", "lt-LT", "mk-MK", "ms-MY", "ml-IN",
      "mt-MT", "mr-IN", "mn-MN", "ne-NP", "nb-NO", "ps-AF", "fa-IR",
      "pl-PL", "pt-BR", "pt-PT", "pa-IN", "ro-RO", "ru-RU", "sr-RS",
      "si-LK", "sk-SK", "sl-SI", "so-SO", "es-AR", "es-BO", "es-CL",
      "es-CO", "es-CR", "es-CU", "es-DO", "es-EC", "es-SV", "es-GQ",
      "es-GT", "es-HN", "es-MX", "es-NI", "es-PA", "es-PY", "es-PE",
      "es-PR", "es-ES", "es-UY", "es-US", "es-VE", "su-ID", "sw-KE",
      "sw-TZ", "sv-SE", "ta-IN", "ta-MY", "ta-SG", "ta-LK", "te-IN",
      "th-TH", "tr-TR", "uk-UA", "ur-IN", "ur-PK", "uz-UZ", "vi-VN",
      "cy-GB", "zu-ZA"
    ];
    
    // Process languages with deduplication
    const languageGroups: Record<string, Set<string>> = {};
    
    for (const langCode of knownLanguages) {
      const baseLang = langCode.split("-")[0];
      if (!languageGroups[baseLang]) {
        languageGroups[baseLang] = new Set();
      }
      languageGroups[baseLang].add(langCode);
    }
    
    // Build the final language list with deduplication
    const languages: { code: Language; name: string }[] = [];
    
    for (const [baseLang, variants] of Object.entries(languageGroups)) {
      if (unifiedDisplayLanguages.includes(baseLang)) {
        // For unified languages, use the NORMALIZED base language code
        // This matches what's actually stored in our Redis voice towers
        const code = baseLang; // Use normalized code directly (en, es, ar, etc.)
        const name = getLanguageName(code);
        
        // Remove region from name for unified languages
        const simplifiedName = name.split(" (")[0];
        
        languages.push({
          code: code as Language,
          name: simplifiedName
        });
      } else {
        // For non-unified languages, normalize to base language too!
        // This ensures consistency across all APIs
        const normalizedCode = baseLang; // Use base language
        const displayName = getLanguageName(Array.from(variants)[0]); // Use first variant for display name
        
        // Remove region from name for ALL languages - we show flags instead!
        const simplifiedName = displayName.split(" (")[0];
        
        languages.push({
          code: normalizedCode as Language,
          name: simplifiedName
        });
      }
    }
    
    // Sort alphabetically by name
    languages.sort((a, b) => a.name.localeCompare(b.name));
    
    return NextResponse.json({ languages });
    
  } catch (error) {
    console.error('Failed to get languages:', error);
    return NextResponse.json({ 
      error: 'Failed to get languages',
      languages: [] 
    }, { status: 500 });
  }
}