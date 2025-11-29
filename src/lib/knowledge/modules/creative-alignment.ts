/**
 * Creative Alignment Knowledge Module
 *
 * NEW module for V3 to ensure cross-stream coherence.
 * Keeps voice, music, and SFX aligned with the creative brief.
 */

import { KnowledgeModule } from "../types";

export const creativeAlignmentModule: KnowledgeModule = {
  id: "creative-alignment",
  name: "Creative Alignment",
  keywords: [
    "creative",
    "brief",
    "brand",
    "consistent",
    "coherent",
    "align",
    "match",
    "fit",
    "style",
  ],

  getContent(): string {
    return `## Creative Alignment - Cross-Stream Coherence

When creating or modifying any element (voice, music, SFX), ensure it aligns with:

### 1. The Brief as North Star
- Client description defines the brand personality
- Creative brief sets the emotional tone and messaging
- All elements should reinforce, not contradict, the brief

### 2. Energy Consistency
- If voice is energetic/excited → music should match (upbeat, driving)
- If voice is calm/soothing → music should complement (relaxed, gentle)
- SFX should punctuate, not clash with, the overall energy level

### 3. Duration Awareness
- Voice scripts should fit within the specified duration
- Music duration should match or slightly exceed voice duration
- SFX should be brief (1-3 seconds) - punctuation, not background

### 4. When Editing One Stream
Before making changes, consider the impact on other streams:
- Changing voice tone? Music may need adjustment
- Adding SFX? Ensure it fits the established mood
- Making music more upbeat? Voice delivery may need to match

### 5. Language Consistency
- Voice scripts: Use the target language with local idioms
- Voice instructions/tags: Always in ENGLISH
- Music prompts: Always in ENGLISH
- SFX descriptions: Always in ENGLISH

### 6. Provider-Aware Creation
When creating voice tracks:
- For ElevenLabs: Include "description" field (baseline tone) and emotional tags in text
- For OpenAI: Include "voiceInstructions" field with structured guidance

### Guiding Questions
Before finalizing any element, ask:
1. Does this support the brand personality from the brief?
2. Does the energy level match other elements?
3. Will this fit within the time constraints?
4. Is the language/format correct for this element type?`;
  },
};
