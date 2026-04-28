/**
 * OpenAI Voice Knowledge Module
 *
 * Extracted from OpenAIPromptStrategy.buildStyleInstructions()
 * Uses freeform voiceInstructions for each voice
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const openaiVoiceModule: KnowledgeModule = {
  id: "openai-voice",
  name: "OpenAI Voice Guidance",
  keywords: [
    "voice",
    "script",
    "openai",
    "voiceInstructions",
    "affect",
    "tone",
    "pacing",
    "pronunciation",
  ],

  getContent(context?: KnowledgeContext): string {
    const pacing = context?.pacing || "normal";
    const accent = context?.accent;
    const region = context?.region;
    const language = context?.language;
    const isArabicLanguage =
      language === "ar" || (language?.startsWith("ar-") ?? false);

    // Build pacing-specific guidance
    let pacingGuidance = "";
    if (pacing === "fast") {
      pacingGuidance =
        " REQUIRED: Use FAST pacing - rapid, energetic delivery with quick tempo and urgency.";
    }

    let arabicGuidance = "";
    if (isArabicLanguage && accent && accent !== "neutral") {
      const accentLower = accent.toLowerCase();
      const regionContext = region ? ` (${region})` : "";

      if (accentLower.includes("egyptian")) {
        arabicGuidance = `

### ARABIC PRONUNCIATION GUIDANCE FOR ${accent}${regionContext}
CRITICAL: In Pronunciation field, specify: "${accent}${regionContext} accent; clear, articulate; colloquial delivery"
- Use colloquial Egyptian Arabic pronunciation (Cairene dialect)
- Natural rhythm with softer consonants characteristic of Egyptian speech
- Articulate emphatic consonants clearly (ص، ض، ط، ظ)
- Friendly, conversational tone typical of Egyptian media`;
      } else if (
        accentLower.includes("gulf") ||
        accentLower.includes("saudi") ||
        accentLower.includes("kuwaiti") ||
        accentLower.includes("emirati")
      ) {
        arabicGuidance = `

### ARABIC PRONUNCIATION GUIDANCE FOR ${accent}${regionContext}
CRITICAL: In Pronunciation field, specify: "${accent}${regionContext} accent; clear, articulate; formal delivery"
- Use formal Gulf Arabic pronunciation with Standard Arabic influences
- Strong, precise consonant articulation typical of Gulf dialects
- Maintain dignified, authoritative tone
- Clear emphasis on emphatic consonants (ص، ض، ط، ظ)`;
      } else if (
        accentLower.includes("levantine") ||
        accentLower.includes("jordanian") ||
        accentLower.includes("syrian") ||
        accentLower.includes("lebanese")
      ) {
        arabicGuidance = `

### ARABIC PRONUNCIATION GUIDANCE FOR ${accent}${regionContext}
CRITICAL: In Pronunciation field, specify: "${accent}${regionContext} accent; clear, articulate; natural delivery"
- Use Levantine dialect with softer consonants and melodic intonation
- Natural, conversational rhythm characteristic of Levantine speech
- Gentle articulation while maintaining clarity
- Warm, approachable tone`;
      } else if (
        accentLower.includes("moroccan") ||
        accentLower.includes("maghrebi")
      ) {
        arabicGuidance = `

### ARABIC PRONUNCIATION GUIDANCE FOR ${accent}${regionContext}
CRITICAL: In Pronunciation field, specify: "${accent}${regionContext} accent; clear, articulate; distinctive delivery"
- Use Maghrebi Arabic pronunciation with French influences where appropriate
- Distinctive consonant articulation characteristic of North African dialects
- Natural, expressive intonation`;
      } else {
        arabicGuidance = `

### ARABIC PRONUNCIATION GUIDANCE FOR ${accent}${regionContext}
CRITICAL: In Pronunciation field, specify: "${accent}${regionContext} accent; clear, articulate"
- Use authentic regional Arabic pronunciation
- Clear articulation of emphatic consonants (ص، ض، ط، ظ)
- Natural rhythm and intonation patterns specific to ${accent} dialect`;
      }
    }

    let accentGuidance = "";
    if (accent && accent !== "neutral" && !isArabicLanguage) {
      accentGuidance = `

### Accent Guidance
Include accent in Pronunciation field: "${accent}${region ? ` (${region})` : ""} accent; clear, articulate"`;
    }

    return `## OpenAI TTS Voice Guidance

OpenAI TTS processes each track INDEPENDENTLY. Each track's voiceInstructions must be self-contained — describing only THAT track's delivery, not the overall ad concept.

### What makes an instruction land
The difference between flat ("Tone: enthusiastic, upbeat") and alive is character + situation + sonic detail.

✅ Alive — "Voice affect: a friend who just got back from the trip and can't wait to tell you about it. Energy leans forward, slightly out of breath on the verbs. Pronunciation: clear ${accent ? `${accent} ` : ""}accent."

✅ Alive — "Voice affect: a bartender at 1am who's seen everything. Weary amusement crackling under the recommendation. Pacing: unhurried, lands consonants. Trust earned by not trying."

✅ Alive — "Voice affect: the calmest person in the room during a small crisis. Low pitch, unhurried, doesn't raise volume to claim authority. Emphasis: lands hard on the call to action without telegraphing it."

❌ Flat — "Voice Affect: Energetic and enthusiastic; Tone: Excited, upbeat; Pacing: Quick, punchy" — generic, model-like, regresses to corporate-narrator-safe.

Pattern: name the character, place them in a situation, give one physical/sonic detail. The detail is what stops you regressing to "warm and engaging".

### Recommended structure (use what you need; not all 7 fields are required)
\`\`\`
Voice Affect: <character + situation + one sonic detail>
Tone: <emotional register>
Pacing: <natural speed for this character>${pacingGuidance}
Emotion: <what they feel about what they're saying>
Emphasis: <which words land hardest>
Pronunciation: <accent / articulation>
Pauses: <where breath beats matter>
\`\`\`

Skip fields that don't add signal. A two-line instruction that names the character precisely beats a seven-line one that lists generic adjectives.

### Hard rules

1. NO inline tags like [happy], [laughs], [excited] — these render as literal text in the audio. Put delivery cues in the voiceInstructions field, never in script text.
2. Each track is independent — no references to "other speaker" or "dialogue flow"; the model generating audio doesn't see the full ad.
3. Script text is plain text only.
4. Describe THIS track's delivery, not the brand or the campaign concept.${arabicGuidance}${accentGuidance}`;

  },
};
