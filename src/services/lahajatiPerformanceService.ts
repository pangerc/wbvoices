/**
 * Lahajati Performance Style Service
 * Manages Redis cache for Lahajati performance style definitions
 * Fetched dynamically during voice cache refresh
 */

import { redis } from "@/lib/redis";
import { fetchLahajatiPerformances, LahajatiPerformance } from "@/services/voiceProviderService";

const REDIS_KEY = "lahajati_performances";

// Keywords indicating ad-related performance styles (Arabic)
const AD_KEYWORDS = [
  "إعلان",      // Advertisement
  "تجاري",      // Commercial
  "ترويج",      // Promotional
  "دعائي",      // Advertising
  "سيارة",      // Automotive
  "عقاري",      // Real estate
  "تسويق",      // Marketing
  "منتج",       // Product
  "عرض",        // Offer/presentation
];

// Common ad-related performance IDs we've identified (can be expanded)
const KNOWN_AD_PERFORMANCE_IDS = [
  1306,  // محايد ومعلوماتي (Neutral/Informative) - good default for ads
  1308,  // درامي ومثير (Dramatic) - documentary style
  1309,  // بهدوء ودفء (Calm and warm)
  1280,  // تكنولوجي متقدم (Tech/Advanced)
  1565,  // ثقة هادئة (Calm confidence)
];

type PerformanceCache = {
  all: LahajatiPerformance[];
  adRelated: LahajatiPerformance[];
  byId: Record<number, string>;  // performance_id → display_name
  lastUpdated: number;
};

/**
 * Check if a performance style is ad-related based on keywords
 */
function isAdRelated(displayName: string): boolean {
  return AD_KEYWORDS.some(keyword => displayName.includes(keyword));
}

class LahajatiPerformanceService {
  private cache: PerformanceCache | null = null;

  /**
   * Refresh performance cache from Lahajati API
   * Called during voice cache rebuild
   */
  async refresh(): Promise<{
    success: boolean;
    total: number;
    adRelated: number;
  }> {
    try {
      console.log("🔄 Refreshing Lahajati performances from API...");
      const performances = await fetchLahajatiPerformances();

      // Build lookup and filter ad-related
      const byId: Record<number, string> = {};
      const adRelated: LahajatiPerformance[] = [];

      for (const p of performances) {
        byId[p.performance_id] = p.display_name;

        // Include if matches keywords OR is a known good ad performance
        if (isAdRelated(p.display_name) || KNOWN_AD_PERFORMANCE_IDS.includes(p.performance_id)) {
          adRelated.push(p);
        }
      }

      // Build and store cache
      this.cache = {
        all: performances,
        adRelated,
        byId,
        lastUpdated: Date.now(),
      };

      await redis.set(REDIS_KEY, this.cache);

      console.log(
        `✅ Lahajati performances cached: ${performances.length} total, ${adRelated.length} ad-related`
      );

      return {
        success: true,
        total: performances.length,
        adRelated: adRelated.length,
      };
    } catch (error) {
      console.error("❌ Failed to refresh Lahajati performances:", error);
      return { success: false, total: 0, adRelated: 0 };
    }
  }

  /**
   * Get ad-related performance styles for UI dropdown
   */
  async getAdPerformances(): Promise<LahajatiPerformance[]> {
    const cache = await this.getCache();
    return cache.adRelated;
  }

  /**
   * Get all performance styles
   */
  async getAllPerformances(): Promise<LahajatiPerformance[]> {
    const cache = await this.getCache();
    return cache.all;
  }

  /**
   * Get display name for a performance ID
   */
  async getPerformanceName(performanceId: number): Promise<string> {
    const cache = await this.getCache();
    return cache.byId[performanceId] || "Unknown";
  }

  /**
   * Get cached performance data
   * Returns empty arrays if cache is empty
   */
  private async getCache(): Promise<PerformanceCache> {
    // Check local memory cache first
    if (this.cache) {
      return this.cache;
    }

    // Try Redis
    const cached = await redis.get<PerformanceCache>(REDIS_KEY);
    if (cached) {
      this.cache = cached;
      return cached;
    }

    // Return empty fallback data
    console.warn("⚠️ Lahajati: Using empty performance cache (not yet populated)");
    return {
      all: [],
      adRelated: [],
      byId: {},
      lastUpdated: 0,
    };
  }

  /**
   * Clear local memory cache (useful for testing)
   */
  clearLocalCache(): void {
    this.cache = null;
  }
}

// Singleton export
export const lahajatiPerformanceService = new LahajatiPerformanceService();
