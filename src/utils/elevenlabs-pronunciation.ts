/**
 * ElevenLabs Pronunciation Dictionary API utilities
 * Documentation: https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries
 */

export type PronunciationRuleType = 'alias' | 'phoneme';
export type PhoneticAlphabet = 'ipa' | 'cmu' | 'x-sampa';

export type PronunciationRule = {
  string_to_replace: string;
  type: PronunciationRuleType;
  alias?: string;
  phoneme?: string;
  alphabet?: PhoneticAlphabet;
};

export type PronunciationDictionary = {
  id: string;
  version_id: string;
  name: string;
  description?: string;
  created_by?: string;
  creation_time_unix?: number;
};

export type DictionaryListResponse = {
  pronunciation_dictionaries: PronunciationDictionary[];
};

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Get ElevenLabs API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }
  return apiKey;
}

/**
 * Create a pronunciation dictionary from rules
 * @param name Dictionary name
 * @param rules Array of pronunciation rules
 * @param description Optional description
 * @returns Created dictionary with ID and version
 */
export async function createDictionary(
  name: string,
  rules: PronunciationRule[],
  description?: string
): Promise<PronunciationDictionary> {
  const apiKey = getApiKey();

  const requestBody: {
    name: string;
    rules: PronunciationRule[];
    description?: string;
  } = {
    name,
    rules,
  };

  if (description) {
    requestBody.description = description;
  }

  console.log('📖 Creating pronunciation dictionary:', { name, ruleCount: rules.length });

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/pronunciation-dictionaries/add-from-rules`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed to create dictionary:', errorText);
    throw new Error(`Failed to create pronunciation dictionary: ${response.status} ${errorText}`);
  }

  const dictionary = await response.json() as PronunciationDictionary;
  console.log('✅ Dictionary created:', dictionary.id);

  return dictionary;
}

/**
 * Get a specific pronunciation dictionary by ID
 * @param dictionaryId Dictionary ID
 * @returns Dictionary details
 */
export async function getDictionary(
  dictionaryId: string
): Promise<PronunciationDictionary> {
  const apiKey = getApiKey();

  console.log('📖 Fetching pronunciation dictionary:', dictionaryId);

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/pronunciation-dictionaries/${dictionaryId}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed to get dictionary:', errorText);
    throw new Error(`Failed to get pronunciation dictionary: ${response.status} ${errorText}`);
  }

  const dictionary = await response.json() as PronunciationDictionary;
  return dictionary;
}

/**
 * List all pronunciation dictionaries
 * @returns Array of dictionaries
 */
export async function listDictionaries(): Promise<PronunciationDictionary[]> {
  const apiKey = getApiKey();

  console.log('📖 Listing pronunciation dictionaries');

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/pronunciation-dictionaries`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed to list dictionaries:', errorText);
    throw new Error(`Failed to list pronunciation dictionaries: ${response.status} ${errorText}`);
  }

  const data = await response.json() as DictionaryListResponse;
  console.log(`✅ Found ${data.pronunciation_dictionaries.length} dictionaries`);

  return data.pronunciation_dictionaries;
}

/**
 * Delete a pronunciation dictionary
 * @param dictionaryId Dictionary ID to delete
 */
export async function deleteDictionary(dictionaryId: string): Promise<void> {
  const apiKey = getApiKey();

  console.log('📖 Deleting pronunciation dictionary:', dictionaryId);

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/pronunciation-dictionaries/${dictionaryId}`,
    {
      method: 'DELETE',
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed to delete dictionary:', errorText);
    throw new Error(`Failed to delete pronunciation dictionary: ${response.status} ${errorText}`);
  }

  console.log('✅ Dictionary deleted');
}

/**
 * Create a dictionary locator object for use in TTS requests
 * @param dictionaryId Dictionary ID
 * @param versionId Version ID (optional, uses latest if not provided)
 * @returns Dictionary locator object
 */
export function createDictionaryLocator(
  dictionaryId: string,
  versionId?: string
): { pronunciation_dictionary_id: string; version_id?: string } {
  return {
    pronunciation_dictionary_id: dictionaryId,
    ...(versionId && { version_id: versionId }),
  };
}

/**
 * Validate pronunciation rules
 * @param rules Rules to validate
 * @returns Validation result
 */
export function validateRules(rules: PronunciationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push('Rules must be a non-empty array');
    return { valid: false, errors };
  }

  rules.forEach((rule, index) => {
    if (!rule.string_to_replace || typeof rule.string_to_replace !== 'string') {
      errors.push(`Rule ${index}: string_to_replace is required and must be a string`);
    }

    if (!rule.type || !['alias', 'phoneme'].includes(rule.type)) {
      errors.push(`Rule ${index}: type must be 'alias' or 'phoneme'`);
    }

    if (rule.type === 'alias' && (!rule.alias || typeof rule.alias !== 'string')) {
      errors.push(`Rule ${index}: alias is required for type 'alias'`);
    }

    if (rule.type === 'phoneme' && (!rule.phoneme || typeof rule.phoneme !== 'string')) {
      errors.push(`Rule ${index}: phoneme is required for type 'phoneme'`);
    }

    if (rule.type === 'phoneme' && rule.alphabet && !['ipa', 'cmu', 'x-sampa'].includes(rule.alphabet)) {
      errors.push(`Rule ${index}: alphabet must be 'ipa', 'cmu', or 'x-sampa'`);
    }
  });

  return { valid: errors.length === 0, errors };
}