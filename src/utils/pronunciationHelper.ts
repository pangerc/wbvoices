import { PronunciationRule } from '@/types';

const STORAGE_KEY = 'pronunciation_rules';

/**
 * Inject pronunciation rules into voice instructions for matched strings
 * Only includes rules where stringToReplace is found in the script text
 */
export function injectPronunciationRules(
  scriptText: string,
  existingInstructions: string | undefined
): string | undefined {
  // Load rules from localStorage (same key as PronunciationEditor)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return existingInstructions;

  let rules: PronunciationRule[] = [];
  try {
    const data = JSON.parse(stored);
    rules = data.rules || [];
  } catch (error) {
    console.error('Failed to parse pronunciation rules:', error);
    return existingInstructions;
  }

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
