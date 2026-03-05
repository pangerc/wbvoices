/**
 * ByteDance TTS 2.0 Voice Knowledge Module
 *
 * ByteDance voices support emotion control via:
 * - emotion tags (happy, sad, angry, etc.)
 * - voiceInstructions mapped to context_texts (free-text style direction)
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const bytedanceVoiceModule: KnowledgeModule = {
  id: "bytedance-voice",
  name: "ByteDance TTS 2.0 Voice Guidance",
  keywords: ["voice", "bytedance", "emotion", "tts2"],

  getContent(_context?: KnowledgeContext): string {
    return `## ByteDance TTS 2.0 Voice Guidance

ByteDance voices support emotion control and style instructions.

### Emotion & Style Controls

1. **emotion** (optional): Set a keyword emotion for the entire track
   - Options: \`happy\`, \`sad\`, \`angry\`, \`excited\`, \`warm\`, \`neutral\`, \`fear\`, \`surprised\`
   - Pick ONE emotion that matches the ad's tone

2. **voiceInstructions** (optional): Free-text style direction describing HOW to speak
   - This is a natural language instruction, not a structured format
   - Examples:
     - "Speak cheerfully and energetically, like announcing exciting news"
     - "Use a warm, intimate tone as if talking to a close friend"
     - "Confident and professional, steady pace with clear enunciation"
     - "Playful and teasing, with a smile in the voice"

### Script Format
- Write scripts in the target language
- NO inline emotional tags like [happy] or [excited] — emotion is controlled via the emotion field
- NO special markup — keep script text as plain spoken dialogue
- Keep dialogue natural and conversational

### Example Track
- Voice ID: \`zh_female_vv_uranus_bigtts\` (Vivi)
- emotion: "excited"
- voiceInstructions: "Speak with genuine excitement, like discovering something amazing"
- Script: The spoken text in the target language`;
  },
};
