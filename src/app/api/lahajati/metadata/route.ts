/**
 * Lahajati Metadata API
 * Returns dialects and performance styles for UI dropdowns and LLM context
 */

import { NextResponse } from "next/server";
import { lahajatiDialectService, ArabicDialect } from "@/services/lahajatiDialectService";
import { lahajatiPerformanceService } from "@/services/lahajatiPerformanceService";
import { LahajatiPerformance } from "@/services/voiceProviderService";

// English translations for common Arabic dialect suffixes
const DIALECT_EN_MAP: Record<string, string> = {
  'القاهرية': 'Cairo',
  'القاهرة': 'Cairo',
  'إسكندرية': 'Alexandria',
  'الإسكندرية': 'Alexandria',
  'الصعيد': 'Upper Egypt',
  'صعيدي': 'Upper Egypt',
  'بورسعيد': 'Port Said',
  'دمشق': 'Damascus',
  'حلب': 'Aleppo',
  'بيروت': 'Beirut',
  'طرابلس': 'Tripoli',
  'نجدية': 'Najdi',
  'حجازية': 'Hijazi',
  'جنوبية': 'Southern',
  'شمالية': 'Northern',
  'الفصحى': 'Modern Standard',
  'شامية': 'Levantine',
  'خليجية': 'Gulf',
};

// English translations for performance style keywords
const PERFORMANCE_EN_MAP: Record<string, string> = {
  'إعلان سيارة': 'Automotive ad',
  'إعلان عقاري': 'Real estate ad',
  'إعلان تجاري': 'Commercial ad',
  'محايد ومعلوماتي': 'Neutral/Informative',
  'درامي ومثير': 'Dramatic/Documentary',
  'بهدوء ودفء': 'Calm and warm',
  'تكنولوجي متقدم': 'Tech/Advanced',
  'ثقة هادئة': 'Calm confidence',
  'أخبار': 'News',
  'إخباري': 'News',
  'قصة': 'Storytelling',
  'سردي': 'Narrative',
  'حماسي': 'Enthusiastic',
  'رسمي': 'Formal',
  'ودي': 'Friendly',
};

/**
 * Generate English name from Arabic display name
 */
function getEnglishDialectName(dialect: ArabicDialect): string {
  // Try to find matching suffix
  for (const [arabic, english] of Object.entries(DIALECT_EN_MAP)) {
    if (dialect.display_name.includes(arabic)) {
      // Capitalize country and add city/region
      const countryName = dialect.country.charAt(0).toUpperCase() + dialect.country.slice(1);
      return `${countryName} (${english})`;
    }
  }
  // Fallback: just use country name
  return dialect.country.charAt(0).toUpperCase() + dialect.country.slice(1);
}

/**
 * Generate English name from Arabic performance name
 */
function getEnglishPerformanceName(performance: LahajatiPerformance): string {
  // Try exact match first
  if (PERFORMANCE_EN_MAP[performance.display_name]) {
    return PERFORMANCE_EN_MAP[performance.display_name];
  }
  // Try partial match
  for (const [arabic, english] of Object.entries(PERFORMANCE_EN_MAP)) {
    if (performance.display_name.includes(arabic)) {
      return english;
    }
  }
  // Fallback: return Arabic name
  return performance.display_name;
}

export async function GET() {
  try {
    // Fetch dialects and performances from cache
    const [arabicDialects, adPerformances] = await Promise.all([
      lahajatiDialectService.getArabicDialects(),
      lahajatiPerformanceService.getAdPerformances(),
    ]);

    // Transform dialects with English names
    const dialects = arabicDialects.map(d => ({
      id: d.dialect_id,
      name: d.display_name,
      nameEn: getEnglishDialectName(d),
      country: d.country,
    }));

    // Transform performances with English names
    const performances = adPerformances.map(p => ({
      id: p.performance_id,
      name: p.display_name,
      nameEn: getEnglishPerformanceName(p),
    }));

    return NextResponse.json({
      dialects,
      adPerformances: performances,
      counts: {
        dialects: dialects.length,
        adPerformances: performances.length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch Lahajati metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch Lahajati metadata" },
      { status: 500 }
    );
  }
}
