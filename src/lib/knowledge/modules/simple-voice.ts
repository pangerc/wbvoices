/**
 * Simple Voice Knowledge Module
 *
 * For providers that don't need special formatting (Qwen, Lovo, ByteDance).
 * These providers use plain text scripts without emotional tags or voiceInstructions.
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const simpleVoiceModule: KnowledgeModule = {
  id: "simple-voice",
  name: "Simple Voice Guidance (Qwen/Lovo/ByteDance)",
  keywords: ["voice", "qwen", "lovo", "bytedance", "simple"],

  getContent(context?: KnowledgeContext): string {
    const provider = context?.voiceProvider || "this provider";

    return `## Voice Script Guidance (${provider})

This provider uses plain text scripts - NO special tags or formatting needed.

### Script Format
- Write natural dialogue text directly
- No emotional tags like [happy] or [excited]
- No voiceInstructions field needed
- No description/baseline tone field needed
- Just the spoken text in the target language

### Example Track
\`\`\`json
{
  "voiceId": "voice-id-here",
  "text": "Your script text goes here in the target language."
}
\`\`\`

### Key Points
1. Keep scripts natural and conversational
2. Write in the target language (not English unless specified)
3. No special markup - the TTS will handle natural prosody
4. Focus on clear, well-paced dialogue`;
  },
};
