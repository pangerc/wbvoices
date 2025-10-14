import { MusicPrompts } from "@/types";

/**
 * Character limits for music providers
 */
export const MUSIC_PROVIDER_LIMITS = {
  mubert: 250,
  loudly: Infinity, // No limit
  elevenlabs: Infinity, // No limit but no artist names
} as const;

/**
 * Validates Mubert prompt length
 */
export function validateMubertLength(prompt: string): {
  isValid: boolean;
  length: number;
  limit: number;
} {
  const length = prompt.length;
  const limit = MUSIC_PROVIDER_LIMITS.mubert;

  return {
    isValid: length <= limit,
    length,
    limit,
  };
}

/**
 * Smart truncation for Mubert prompts (250 char limit)
 * Tries to preserve core musical elements
 */
export function truncateMubertPrompt(prompt: string): string {
  const limit = MUSIC_PROVIDER_LIMITS.mubert;

  if (prompt.length <= limit) {
    return prompt;
  }

  // Try to truncate at sentence boundaries first
  const sentences = prompt.split(/[.!?]\s+/);
  let truncated = "";

  for (const sentence of sentences) {
    const withSentence = truncated + (truncated ? ". " : "") + sentence;
    if (withSentence.length <= limit) {
      truncated = withSentence;
    } else {
      break;
    }
  }

  // If we got something reasonable, use it
  if (truncated.length > limit * 0.5) {
    return truncated;
  }

  // Otherwise, just hard truncate at word boundary
  const words = prompt.split(/\s+/);
  truncated = "";

  for (const word of words) {
    const withWord = truncated + (truncated ? " " : "") + word;
    if (withWord.length <= limit) {
      truncated = withWord;
    } else {
      break;
    }
  }

  return truncated || prompt.substring(0, limit).trim();
}

/**
 * Checks if a prompt contains artist/band names (basic heuristic)
 * This is a simple check - looks for common patterns like "like X", "inspired by X", etc.
 */
export function containsArtistReferences(prompt: string): boolean {
  const artistPatterns = [
    /\b(?:like|similar to|inspired by|reminiscent of|style of)\s+[A-Z]/i,
    /\b(?:by|from)\s+[A-Z][a-z]+\s+[A-Z]/i, // "by Artist Name"
  ];

  return artistPatterns.some((pattern) => pattern.test(prompt));
}

/**
 * Removes artist references from a prompt (for ElevenLabs)
 * Basic implementation - removes common reference patterns
 */
export function removeArtistReferences(prompt: string): string {
  // Remove phrases like "inspired by Artist Name", "similar to Band Name", etc.
  let cleaned = prompt.replace(
    /,?\s*(?:like|similar to|inspired by|reminiscent of|in the style of)\s+[^,.]+(,|\.|$)/gi,
    "$1"
  );

  // Clean up any double commas or spaces
  cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();

  return cleaned;
}

/**
 * Generates provider-specific prompts from a base description
 * Uses smart transformations based on provider constraints
 */
export function generatePromptsFromDescription(
  description: string
): MusicPrompts {
  // For Loudly: Use description as-is (no limit, can have artist refs)
  const loudly = description;

  // For Mubert: Truncate to 250 chars
  const mubert = truncateMubertPrompt(description);

  // For ElevenLabs: Remove artist references if present
  const elevenlabs = containsArtistReferences(description)
    ? removeArtistReferences(description)
    : description;

  return {
    loudly,
    mubert,
    elevenlabs,
  };
}

/**
 * Validates and fixes music prompts object
 * Ensures all fields are present and meet provider constraints
 */
export function validateMusicPrompts(
  prompts: Partial<MusicPrompts> | null,
  fallbackDescription?: string
): MusicPrompts {
  // If we have no prompts, generate from fallback description
  if (!prompts) {
    if (fallbackDescription) {
      return generatePromptsFromDescription(fallbackDescription);
    }
    return {
      loudly: "",
      mubert: "",
      elevenlabs: "",
    };
  }

  // Validate and fix each field
  const validated: MusicPrompts = {
    loudly: prompts.loudly || fallbackDescription || "",
    mubert: prompts.mubert || fallbackDescription || "",
    elevenlabs: prompts.elevenlabs || fallbackDescription || "",
  };

  // Ensure Mubert is within character limit
  if (validated.mubert.length > MUSIC_PROVIDER_LIMITS.mubert) {
    console.warn(
      `Mubert prompt exceeds ${MUSIC_PROVIDER_LIMITS.mubert} chars (${validated.mubert.length}), truncating...`
    );
    validated.mubert = truncateMubertPrompt(validated.mubert);
  }

  // Warn if ElevenLabs has artist references (but don't auto-fix to preserve user intent)
  if (containsArtistReferences(validated.elevenlabs)) {
    console.warn(
      "ElevenLabs prompt appears to contain artist references. This may not work well."
    );
  }

  return validated;
}

/**
 * Migration helper: converts old single musicPrompt to new musicPrompts structure
 */
export function migrateMusicPrompt(oldPrompt: string): MusicPrompts {
  return generatePromptsFromDescription(oldPrompt);
}
