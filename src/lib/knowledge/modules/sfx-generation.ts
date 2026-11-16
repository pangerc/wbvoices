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
- Most ads work WITHOUT SFX - use sparingly (0-2 effects max)
- Do NOT include duration info in descriptions (use separate duration field)

### Duration Guidelines
- **Stingers/hits** (whoosh, horn, chime): 1-2 seconds
- **Transitional effects** (door, footsteps): 2-4 seconds
- **Ambient beds** (background atmosphere): 5-10 seconds
- **Default**: 2-3 seconds if unsure
- **Range**: 0.5s minimum, 15s maximum

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

**Use placement type "beforeVoices" for OPENING HITS** (the sound starts at 0 s; the first voice also starts at 0 s, so the sound plays over its opening — sounds never delay or move a voice line):
- Dramatic whoosh at the top of the ad
- Door opening as the speaker starts
- Car engine starting
→ Grabs attention right at the start, over the first words

**Use placement type "withFirstVoice" for CONCURRENT intro sounds** (SFX plays alongside first voice):
- Background ambience during narration
- Subtle chime with greeting
- Soft atmospheric bed
→ Creates atmosphere, less intrusive - sound plays WITH voice simultaneously

**Use placement type "afterVoice" for sounds BETWEEN lines**, with a 0-based voice index (index 0 = after the first voice line). The sound starts when that line ends and plays under the start of the next line (the next line does not wait); several sounds at one spot play one after another:
- Cash register after the price is said
- Transition whoosh between two speakers
→ Punctuates a specific line

**Use placement type "end" for OUTRO sounds** (after all voices finish):
- Car door closing
- Satisfying click
- Cash register
→ Reinforces the message AFTER all voices finish

### When to Choose Each Intro Type
- **"beforeVoices"**: Dramatic impact, scene-setting, attention-grabbing - a short hit at 0 s, over the first words (the voice does not wait)
- **"withFirstVoice"**: Subtle enhancement, atmospheric, non-intrusive - sound WITH voice simultaneously

### Examples by Category

| Category | Opening Hit (beforeVoices) | Under First Voice (withFirstVoice) | Outro (end) |
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
