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

OpenAI TTS processes each track INDEPENDENTLY. Each track's voiceInstructions must be self-contained - describing only THAT track's delivery, not the overall ad concept.

### voiceInstructions Format (required for each track)
\`\`\`
Voice Affect: <this track's voice character>
Tone: <this track's emotional tone>
Pacing: <this track's speed>${pacingGuidance}
Emotion: <this track's emotional delivery>
Emphasis: <words to highlight in this track>
Pronunciation: <articulation style, accent if needed>
Pauses: <pause placement for this track>
\`\`\`

### Good vs Bad Examples

✅ CORRECT - Track-specific, self-contained:
"Voice Affect: Energetic and enthusiastic; Tone: Excited, upbeat; Pacing: Quick, punchy; Emotion: Genuine excitement; Emphasis: 'amazing' and 'today'; Pronunciation: Clear, crisp; Pauses: Brief pause before the reveal."

❌ WRONG - Contains ad-wide creative direction:
"Voice Affect: The first speaker in this energetic dialogue about summer drinks, setting up the playful banter..."

❌ WRONG - Contains inline tags (will appear as literal text):
"[excited]Check out our amazing sale!"
→ Use voiceInstructions field instead: "Emotion: excited and enthusiastic"
${arabicGuidance}${accentGuidance}

### Key Rules
1. voiceInstructions is REQUIRED - no plain text style control
2. Each track is independent - no references to "other speaker" or "dialogue flow"
3. NO inline tags like [happy], [laughs], [excited] - these render as literal text
4. Script text should be PLAIN TEXT only
5. Match affect/tone to the brand, but describe only this track's delivery`;

  },
};
