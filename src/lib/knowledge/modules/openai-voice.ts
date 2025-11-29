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

For OpenAI voices, provide detailed "voiceInstructions" string using this structure (in English):

### voiceInstructions Format
\`\`\`
Voice Affect: <detailed description of overall voice character and personality>
Tone: <specific emotional tone with context and nuance>
Pacing: <precise speed description with tempo changes and rhythm details>${pacingGuidance}
Emotion: <emotional delivery style with specific feelings and expressions>
Emphasis: <specific words/phrases to highlight and exact delivery method>
Pronunciation: <articulation style, clarity level, and speech characteristics>
Pauses: <exact placement and duration of pauses with purpose>
\`\`\`

### Example voiceInstructions
"Voice Affect: Calm, composed, and reassuring; Tone: Sincere, empathetic, and gently authoritative; Pacing: Steady and moderate; unhurried yet professional; Emotion: Genuine empathy and understanding; Emphasis: Clear emphasis on key reassurances and benefits; Pronunciation: Clear and precise, emphasizing important words; Pauses: Brief pauses after offering assistance, highlighting willingness to listen."

Consider commercial pacing needs - fast for urgency, moderate for all other contexts.
${arabicGuidance}${accentGuidance}

### Key Principles
1. voiceInstructions field is REQUIRED for OpenAI voices
2. Keep it concise but complete - all fields should be addressed
3. Match affect and tone to the brand personality
4. Specify pacing explicitly based on ad requirements
5. Pronunciation field should include any accent/dialect requirements`;
  },
};
