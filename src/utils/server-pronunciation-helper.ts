import { getRedis } from '@/lib/redis';
import { PronunciationRule } from '@/types';

const PRONUNCIATION_RULES_KEY = 'pronunciation:global_rules';

/**
 * Fetch pronunciation rules from Redis (server-side)
 * This is safe to use in API routes and Edge runtime
 */
export async function getServerPronunciationRules(): Promise<PronunciationRule[]> {
  try {
    const redis = getRedis();
    const data = await redis.get<{ rules: PronunciationRule[]; dictionaryId: string; timestamp: number }>(
      PRONUNCIATION_RULES_KEY
    );

    if (!data || !data.rules) {
      console.log('🔍 No pronunciation rules found in Redis');
      return [];
    }

    console.log(`📖 Loaded ${data.rules.length} pronunciation rule(s) from Redis`);
    return data.rules;
  } catch (error) {
    console.error('❌ Failed to fetch pronunciation rules from Redis:', error);
    return [];
  }
}

/**
 * Inject pronunciation rules into voice instructions for matched strings
 * Only includes rules where stringToReplace is found in the script text
 *
 * This is a pure function (no side effects) that can be used anywhere
 */
export function injectPronunciationRules(
  scriptText: string,
  existingInstructions: string | undefined,
  rules: PronunciationRule[]
): string | undefined {
  if (rules.length === 0) return existingInstructions;

  // Find rules where stringToReplace exists in scriptText
  // Case-insensitive matching for better reliability
  const matchedRules = rules.filter(rule => {
    if (!rule.stringToReplace || !rule.alias) return false;
    return scriptText.toLowerCase().includes(rule.stringToReplace.toLowerCase());
  });

  if (matchedRules.length === 0) {
    console.log('🔍 No pronunciation rules matched in script');
    return existingInstructions;
  }

  // Build pronunciation instructions
  const pronunciationInstructions = matchedRules
    .map(r => `Pronounce "${r.stringToReplace}" as "${r.alias}"`)
    .join('. ') + '.';

  console.log(`🎯 Injected ${matchedRules.length} pronunciation rule(s): ${pronunciationInstructions}`);

  // Merge with existing instructions
  if (existingInstructions) {
    return `${existingInstructions} ${pronunciationInstructions}`;
  }

  return pronunciationInstructions;
}
