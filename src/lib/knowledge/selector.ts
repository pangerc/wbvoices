/**
 * Intent Detection for Knowledge Module Selection
 *
 * Keyword-based classification to determine which knowledge modules are relevant.
 * Defaults to full context when unsure.
 */

import { IntentType, IntentScores } from "./types";

const INTENT_KEYWORDS: Record<keyof IntentScores, string[]> = {
  voice_edit: [
    "voice",
    "script",
    "line",
    "dialogue",
    "tag",
    "emotional",
    "elevenlabs",
    "openai",
    "speaker",
    "actor",
    "tone",
    "description",
    "voiceinstructions",
    "laughs",
    "happy",
    "excited",
    "calm",
    "professional",
    "whisper",
    "shorten",
    "longer",
    "rewrite",
  ],
  music_edit: [
    "music",
    "background",
    "track",
    "drums",
    "guitar",
    "beat",
    "tempo",
    "genre",
    "upbeat",
    "chill",
    "energy",
    "loudly",
    "mubert",
    "instrumental",
    "bass",
    "synth",
    "piano",
    "acoustic",
    "electronic",
  ],
  sfx_edit: [
    "sfx",
    "sound effect",
    "sound fx",
    "effect",
    "noise",
    "sound",
    "intro sound",
    "outro sound",
  ],
};

/**
 * Calculate keyword match scores for each intent category
 */
function calculateKeywordScores(message: string): IntentScores {
  const lower = message.toLowerCase();

  const scores: IntentScores = {
    voice_edit: 0,
    music_edit: 0,
    sfx_edit: 0,
  };

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        scores[intent as keyof IntentScores]++;
      }
    }
  }

  return scores;
}

/**
 * Count how many categories have non-zero scores
 */
function countNonZeroScores(scores: IntentScores): number {
  return Object.values(scores).filter((score) => score > 0).length;
}

/**
 * Get the intent with the highest score
 */
function getHighestScoringIntent(
  scores: IntentScores
): keyof IntentScores | null {
  const entries = Object.entries(scores) as [keyof IntentScores, number][];
  const nonZero = entries.filter(([, score]) => score > 0);

  if (nonZero.length === 0) {
    return null;
  }

  nonZero.sort((a, b) => b[1] - a[1]);
  return nonZero[0][0];
}

/**
 * Detect intent from user message
 *
 * Returns the type of operation being requested:
 * - initial_generation: Creating a new ad from scratch
 * - voice_edit: Modifying voice/script only
 * - music_edit: Modifying music only
 * - sfx_edit: Modifying sound effects only
 * - multi_stream_edit: Changes across multiple streams
 */
export function detectIntent(userMessage: string): IntentType {
  const lower = userMessage.toLowerCase();

  // Check for initial generation patterns
  const isInitialGeneration =
    (lower.includes("create") && lower.includes("ad")) ||
    (lower.includes("generate") && lower.includes("ad")) ||
    lower.includes("new ad") ||
    lower.includes("make an ad") ||
    lower.includes("build an ad");

  if (isInitialGeneration) {
    return "initial_generation";
  }

  // Calculate keyword scores
  const scores = calculateKeywordScores(lower);
  const nonZeroCount = countNonZeroScores(scores);

  // If no keywords matched, default to full generation (safest)
  if (nonZeroCount === 0) {
    return "initial_generation";
  }

  // If multiple categories matched, it's a multi-stream edit
  if (nonZeroCount > 1) {
    return "multi_stream_edit";
  }

  // Single category matched - return specific intent
  const highest = getHighestScoringIntent(scores);

  if (highest === "voice_edit") {
    return "voice_edit";
  } else if (highest === "music_edit") {
    return "music_edit";
  } else if (highest === "sfx_edit") {
    return "sfx_edit";
  }

  // Fallback to full generation
  return "initial_generation";
}

/**
 * Get human-readable description of intent
 */
export function describeIntent(intent: IntentType): string {
  switch (intent) {
    case "initial_generation":
      return "Full ad generation (all streams)";
    case "voice_edit":
      return "Voice/script modification";
    case "music_edit":
      return "Music modification";
    case "sfx_edit":
      return "Sound effects modification";
    case "multi_stream_edit":
      return "Multiple stream modification";
  }
}
