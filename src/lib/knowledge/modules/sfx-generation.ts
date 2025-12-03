/**
 * SFX Generation Knowledge Module
 *
 * Extracted from BasePromptStrategy lines 314-333
 * Short, concise sound effect descriptions
 */

import { KnowledgeModule } from "../types";

export const sfxGenerationModule: KnowledgeModule = {
  id: "sfx-generation",
  name: "SFX Generation Guidance",
  keywords: ["sfx", "sound effect", "sound fx", "effect", "noise", "audio"],

  getContent(): string {
    return `## Sound Effects (SFX) Guidance

### Core Rules
- Keep descriptions SHORT (under 10 words)
- Always in ENGLISH regardless of ad language
- Focus on the sound itself, not the context
- Most ads work WITHOUT SFX - use sparingly (0-1 effects max)
- CRITICAL: Sound effects must be very short (maximum 3 seconds)
- Do NOT include duration info in descriptions (use separate duration field)

### Examples by Theme

**Baby products:**
- "baby giggling"
- "baby crying softly"

**Automotive:**
- "car engine starting"
- "car door closing"

**Food/beverage:**
- "soda can opening"
- "sizzling pan"

**Technology:**
- "notification chime"
- "keyboard typing"

### Placement Guidelines

**Use placement type "beforeVoices" for SEQUENTIAL intro sounds** (SFX finishes completely, then voices begin):
- Dramatic whoosh before announcement
- Door opening before speaker enters
- Car engine starting
→ Creates anticipation and context BEFORE the voice speaks

**Use placement type "withFirstVoice" for CONCURRENT intro sounds** (SFX plays alongside first voice):
- Background ambience during narration
- Subtle chime with greeting
- Soft atmospheric bed
→ Creates atmosphere, less intrusive - sound plays WITH voice simultaneously

**Use placement type "end" for OUTRO sounds** (after all voices finish):
- Car door closing
- Satisfying click
- Cash register
→ Reinforces the message AFTER all voices finish

### When to Choose Each Intro Type
- **"beforeVoices"**: Dramatic impact, scene-setting, attention-grabbing - the sound THEN the voice
- **"withFirstVoice"**: Subtle enhancement, atmospheric, non-intrusive - sound WITH voice simultaneously

### Examples by Category

| Category | Sequential Intro (beforeVoices) | Concurrent Intro (withFirstVoice) | Outro (end) |
|----------|--------------------------------|-----------------------------------|-------------|
| Automotive | car engine starting | road ambience | car door closing |
| Tech | notification chime | subtle keyboard clicks | confirm sound |
| Food | pan sizzle | restaurant ambience | satisfying bite |
| Retail | door chime | store background | cash register |

### What NOT to Do
- Don't use long, descriptive prompts
- Don't include duration in description text
- Don't add context about the brand or scene
- Don't use the ad's language for SFX descriptions

**BAD:** "Opening a Coca-Cola can with neat sound followed by fizzing that blends into the music"
**GOOD:** "Soda can opening with fizz"`;
  },
};
