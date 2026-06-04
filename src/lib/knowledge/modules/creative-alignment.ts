/**
 * Creative Alignment Knowledge Module
 *
 * Cross-stream coherence guidance. Voice + music + SFX should reinforce
 * each other against the brief, not contradict.
 *
 * Note: this module used to end with six "guiding questions" the model was
 * told to ask itself before finalizing. That pattern was costing reasoning
 * tokens to no benefit (the model already does these checks implicitly with
 * GPT-5.5 reasoning). Replaced with three concrete success criteria.
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

Voice + music + SFX should reinforce each other against the brief, not compete.

### Energy alignment
- Energetic voice → upbeat, driving music. Calm voice → relaxed, gentle music. SFX punctuates the energy, never clashes.

### Duration awareness
- Voice scripts fit within the specified duration.
- Music duration matches or slightly exceeds voice duration; the music tail can fade.
- SFX is brief (1–3 seconds) — punctuation, not background.

### Language conventions
- Voice script text: target language with local idioms.
- Voice instructions / tags: ENGLISH (regardless of script language).
- Music prompts: ENGLISH.
- SFX descriptions: ENGLISH.

### When editing one stream during iteration
Changing voice tone? Music may need adjustment. Adding SFX? Make sure it fits the established mood. Don't silently modify a stream the user didn't ask about.

### Success criteria for the finished ad
1. The first sentence makes the listener pause — they don't reach for the skip button.
2. One specific detail (a price, a place, a time of day, a named object) makes the ad memorable after it ends.
3. The CTA is the natural conclusion of a small story, not a standalone command bolted on.`;
  },
};
