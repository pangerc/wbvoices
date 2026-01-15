/**
 * Lahajati Dialect Service
 * Manages Redis cache for Lahajati dialect definitions
 * Fetched dynamically during voice cache refresh
 */

import { redis } from "@/lib/redis";
import { fetchLahajatiDialects, LahajatiDialect } from "@/services/voiceProviderService";
import { buildDialectMappings } from "@/lib/providers/lahajatiDialectMapping";

const REDIS_KEY = "lahajati_dialects";

// Fallback mappings (current hardcoded values from LahajatiVoiceProvider)
// Used when cache is empty or API unavailable
const FALLBACK_ACCENT_TO_DIALECT: Record<string, number> = {
  standard: 1,
  neutral: 1,
  saudi: 2,
  egyptian: 7,
  syrian: 12,
  lebanese: 17,
  jordanian: 22,
  palestinian: 26,
  algerian: 30,
  moroccan: 35,
  tunisian: 40,
  iraqi: 44,
  yemeni: 48,
  sudanese: 53,
  libyan: 57,
  omani: 60,
  kuwaiti: 64,
  bahraini: 67,
  qatari: 69,
  emirati: 70,
  mauritanian: 72,
  gulf: 2, // Gulf → Saudi Najdi as default
  maghrebi: 35, // Maghrebi → Moroccan as default
};

// Arabic country prefixes for grouping dialects in UI
const ARABIC_COUNTRY_MAP: Record<string, string> = {
  'المصرية': 'egyptian',
  'السعودية': 'saudi',
  'السورية': 'syrian',
  'اللبنانية': 'lebanese',
  'الأردنية': 'jordanian',
  'الفلسطينية': 'palestinian',
  'الجزائرية': 'algerian',
  'المغربية': 'moroccan',
  'التونسية': 'tunisian',
  'العراقية': 'iraqi',
  'اليمنية': 'yemeni',
  'السودانية': 'sudanese',
  'الليبية': 'libyan',
  'العمانية': 'omani',
  'الكويتية': 'kuwaiti',
  'البحرينية': 'bahraini',
  'القطرية': 'qatari',
  'الإماراتية': 'emirati',
  'الموريتانية': 'mauritanian',
  'الفصحى': 'standard',  // Modern Standard Arabic
};

export type ArabicDialect = {
  dialect_id: number;
  display_name: string;  // Arabic name (e.g., "المصرية (القاهرية)")
  country: string;       // English country code for grouping (e.g., "egyptian")
};

type DialectCache = {
  accentToDialectId: Record<string, number>;
  dialectIdToName: Record<number, string>;
  allArabicDialects: ArabicDialect[];  // All Arabic dialects for UI
  lastUpdated: number;
};

class LahajatiDialectService {
  private cache: DialectCache | null = null;

  /**
   * Extract country code from Arabic display name
   */
  private getCountryFromName(displayName: string): string {
    for (const [arabicPrefix, countryCode] of Object.entries(ARABIC_COUNTRY_MAP)) {
      if (displayName.includes(arabicPrefix)) {
        return countryCode;
      }
    }
    return 'other';
  }

  /**
   * Refresh dialect cache from Lahajati API
   * Called during voice cache rebuild
   */
  async refresh(): Promise<{
    success: boolean;
    count: number;
    mapped: number;
    unmapped: number;
    arabicDialects: number;
  }> {
    try {
      console.log("🔄 Refreshing Lahajati dialects from API...");
      const dialects = await fetchLahajatiDialects();

      const { accentToDialectId, dialectIdToName, unmapped } =
        buildDialectMappings(dialects);

      // Build all Arabic dialects list (IDs 1-72)
      const allArabicDialects: ArabicDialect[] = dialects
        .filter(d => d.dialect_id <= 72)
        .map(d => ({
          dialect_id: d.dialect_id,
          display_name: d.display_name,
          country: this.getCountryFromName(d.display_name),
        }));

      // Log unmapped Arabic dialects for review
      if (unmapped.length > 0) {
        console.warn(
          `⚠️ Lahajati: ${unmapped.length} unmapped Arabic dialects:`
        );
        for (const d of unmapped) {
          console.warn(`   - ID ${d.dialect_id}: ${d.display_name}`);
        }
      }

      // Build and store cache
      this.cache = {
        accentToDialectId,
        dialectIdToName,
        allArabicDialects,
        lastUpdated: Date.now(),
      };

      await redis.set(REDIS_KEY, this.cache);

      console.log(
        `✅ Lahajati dialects cached: ${dialects.length} total, ${allArabicDialects.length} Arabic, ${
          Object.keys(accentToDialectId).length
        } accent mappings`
      );

      return {
        success: true,
        count: dialects.length,
        mapped: Object.keys(accentToDialectId).length,
        unmapped: unmapped.length,
        arabicDialects: allArabicDialects.length,
      };
    } catch (error) {
      console.error("❌ Failed to refresh Lahajati dialects:", error);
      return { success: false, count: 0, mapped: 0, unmapped: 0, arabicDialects: 0 };
    }
  }

  /**
   * Resolve accent code to dialect ID
   * Primary method for TTS requests
   */
  async resolveDialectId(accent?: string): Promise<number> {
    if (!accent) return 1; // MSA default

    const cache = await this.getCache();
    const accentLower = accent.toLowerCase();

    // Try cached mapping first
    if (cache.accentToDialectId[accentLower]) {
      return cache.accentToDialectId[accentLower];
    }

    // Fall back to hardcoded
    if (FALLBACK_ACCENT_TO_DIALECT[accentLower]) {
      return FALLBACK_ACCENT_TO_DIALECT[accentLower];
    }

    console.warn(
      `⚠️ Lahajati: Unknown accent "${accent}", defaulting to MSA (1)`
    );
    return 1;
  }

  /**
   * Get display name for a dialect ID (Arabic text)
   * Used in custom prompt mode
   */
  async getDialectName(dialectId: number): Promise<string> {
    const cache = await this.getCache();
    return cache.dialectIdToName[dialectId] || "Arabic";
  }

  /**
   * Get cached dialect data
   * Falls back to hardcoded values if cache is empty
   */
  private async getCache(): Promise<DialectCache> {
    // Check local memory cache first
    if (this.cache) {
      return this.cache;
    }

    // Try Redis
    const cached = await redis.get<DialectCache>(REDIS_KEY);
    if (cached) {
      this.cache = cached;
      return cached;
    }

    // Return fallback data
    console.warn("⚠️ Lahajati: Using fallback dialect mappings (cache empty)");
    return {
      accentToDialectId: FALLBACK_ACCENT_TO_DIALECT,
      dialectIdToName: {},
      allArabicDialects: [],
      lastUpdated: 0,
    };
  }

  /**
   * Get available accent codes for UI population
   * Returns the keys from accentToDialectId mapping
   */
  async getAvailableAccents(): Promise<string[]> {
    const cache = await this.getCache();
    return Object.keys(cache.accentToDialectId);
  }

  /**
   * Get all Arabic dialects for UI dropdown
   * Returns dialects grouped by country for easier navigation
   */
  async getArabicDialects(): Promise<ArabicDialect[]> {
    const cache = await this.getCache();
    return cache.allArabicDialects;
  }

  /**
   * Clear local memory cache (useful for testing)
   */
  clearLocalCache(): void {
    this.cache = null;
  }
}

// Singleton export
export const lahajatiDialectService = new LahajatiDialectService();

// Also export fallback for backward compatibility
export { FALLBACK_ACCENT_TO_DIALECT };
