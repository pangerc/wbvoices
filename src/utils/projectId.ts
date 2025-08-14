/**
 * Generates a short, readable project ID
 * Format: adjective-noun-3digits (e.g., "bright-forest-847")
 */
export function generateProjectId(): string {
  const adjectives = [
    'bright', 'quick', 'bold', 'smooth', 'sharp', 'clean', 'fresh', 'smart',
    'cool', 'warm', 'deep', 'light', 'fast', 'strong', 'calm', 'pure',
    'rich', 'soft', 'wild', 'free', 'live', 'real', 'true', 'new'
  ];
  
  const nouns = [
    'forest', 'river', 'mountain', 'ocean', 'valley', 'meadow', 'garden', 'lake',
    'bridge', 'castle', 'tower', 'harbor', 'island', 'canyon', 'desert', 'glacier',
    'thunder', 'storm', 'breeze', 'sunrise', 'sunset', 'star', 'moon', 'cloud'
  ];
  
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 900) + 100; // 100-999
  
  return `${adjective}-${noun}-${number}`;
}

/**
 * Validates if a string looks like a project ID
 */
export function isValidProjectId(id: string): boolean {
  // Accept both old UUIDs and new format for backward compatibility
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const shortIdRegex = /^[a-z]+-[a-z]+-\d{3}$/;
  
  return uuidRegex.test(id) || shortIdRegex.test(id);
}