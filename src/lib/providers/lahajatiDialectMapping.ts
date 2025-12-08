/**
 * Lahajati Dialect Mapping
 * Maps Arabic dialect display names from Lahajati API to our accent codes
 */

import { LahajatiDialect } from '@/services/voiceProviderService';

/**
 * Arabic country prefixes in display names → our accent codes
 * API returns Arabic-only names like "المصرية (القاهرية)" (Egyptian Cairo)
 */
const COUNTRY_PREFIX_MAP: Record<string, string> = {
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
};

/**
 * Maps a Lahajati dialect to our accent code
 * Returns null for non-Arabic dialects (IDs 73+)
 */
export function mapDialectToAccent(dialect: LahajatiDialect): string | null {
  const name = dialect.display_name;

  // Check for MSA first (special case)
  if (name.includes('الفصحى')) {
    return 'standard';
  }

  // Check country prefixes
  for (const [prefix, accent] of Object.entries(COUNTRY_PREFIX_MAP)) {
    if (name.startsWith(prefix) || name.includes(prefix)) {
      return accent;
    }
  }

  return null; // Non-Arabic dialect or unmapped
}

/**
 * Builds complete dialect mappings from API response
 * First match wins for each accent (primary/default dialect)
 */
export function buildDialectMappings(dialects: LahajatiDialect[]): {
  accentToDialectId: Record<string, number>;
  dialectIdToName: Record<number, string>;
  unmapped: LahajatiDialect[];
} {
  const accentToDialectId: Record<string, number> = {};
  const dialectIdToName: Record<number, string> = {};
  const unmapped: LahajatiDialect[] = [];

  for (const d of dialects) {
    // Store display name for all dialects (used in custom prompts)
    dialectIdToName[d.dialect_id] = d.display_name;

    // Map to accent code
    const accent = mapDialectToAccent(d);

    if (accent && !accentToDialectId[accent]) {
      // First match wins (primary dialect for each country)
      // e.g., Egyptian Cairo (7) before Egyptian Alexandria (8)
      accentToDialectId[accent] = d.dialect_id;
    } else if (!accent && d.dialect_id <= 72) {
      // Arabic dialect (ID ≤ 72) but unmapped - log for review
      unmapped.push(d);
    }
    // IDs > 72 are non-Arabic languages (Kurdish, Persian, etc.) - ignore
  }

  return { accentToDialectId, dialectIdToName, unmapped };
}
