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

**Use "playAfter": "start" for INTRO sounds** that set the scene:
- Car engine starting
- Door opening
- Notification chime
→ Creates anticipation and context BEFORE the voice speaks

**Use "playAfter": "previous" for OUTRO sounds** that follow the last voice:
- Car door closing
- Satisfying click
- Cash register
→ Reinforces the message AFTER the voice finishes

### Examples: Intro vs Outro

| Category | Intro (start) | Outro (previous) |
|----------|---------------|------------------|
| Automotive | car engine starting | car door closing |
| Tech | notification arriving | keyboard confirm sound |
| Food | sizzle starting | satisfying bite sound |
| Retail | door chime | cash register |

### What NOT to Do
- Don't use long, descriptive prompts
- Don't include duration in description text
- Don't add context about the brand or scene
- Don't use the ad's language for SFX descriptions

**BAD:** "Opening a Coca-Cola can with neat sound followed by fizzing that blends into the music"
**GOOD:** "Soda can opening with fizz"`;
  },
};
