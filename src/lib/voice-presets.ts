/**
 * ElevenLabs Voice Preset Speeds
 *
 * Maps baseline tone descriptions to their configured speed multipliers.
 * These presets are used when the LLM selects a tone (e.g., "cheerful", "fast_read")
 * and the user hasn't manually overridden the speed.
 *
 * Source: ElevenLabsVoiceProvider.ts PRESETS table
 */

export const ELEVENLABS_PRESET_SPEEDS: Record<string, number> = {
  // Upbeat and bright - Creative (0.0 stability)
  cheerful: 1.08,
  happy: 1.08,
  excited: 1.1,

  // High energy promo reads - Creative (0.0)
  energetic: 1.12,
  dynamic: 1.12,

  // Calm and intimate - Robust (1.0 stability)
  calm: 0.96,
  gentle: 0.96,
  soothing: 0.95,

  // Credible, brand-safe - Robust (1.0)
  serious: 0.99,
  professional: 0.99,
  authoritative: 0.98,

  // Warm human read - Natural (0.5 stability)
  empathetic: 1.0,
  warm: 1.0,

  // Pacing controls
  fast_read: 1.15,
  slow_read: 0.9,

  // Default/neutral - Natural (0.5)
  neutral: 1.0,
  default: 1.0,
};

/**
 * Get the preset speed for an ElevenLabs voice description.
 * Normalizes the description to match preset keys (lowercase, underscores).
 *
 * @param description - The voice tone/style description (e.g., "Cheerful", "fast_read")
 * @returns The speed multiplier (0.9 - 1.15), defaults to 1.0 if not found
 */
export function getElevenLabsPresetSpeed(description?: string | null): number {
  if (!description || typeof description !== "string") {
    return 1.0;
  }

  // Normalize to match PRESETS keys: lowercase, underscores for spaces
  const normalized = description
    .toLowerCase()
    .replace(/[^a-z_\s-]/g, "")
    .replace(/\s+/g, "_");

  return ELEVENLABS_PRESET_SPEEDS[normalized] ?? 1.0;
}

/**
 * Get the speed range for a voice provider.
 * Different providers support different speed multiplier ranges.
 *
 * @param provider - The voice provider name
 * @returns Object with min and max speed multipliers
 */
export function getProviderSpeedRange(provider: string): { min: number; max: number } {
  switch (provider) {
    case "elevenlabs":
      // ElevenLabs V3 API valid range: 0.7 to 1.2
      // Values outside this range are ignored or clamped by the API
      return { min: 0.7, max: 1.2 };
    case "openai":
      // OpenAI API valid range: 0.25 to 4.0 (1.0 = normal speed)
      return { min: 0.25, max: 4.0 };
    default:
      // Conservative default for unknown providers
      return { min: 0.5, max: 2.0 };
  }
}
