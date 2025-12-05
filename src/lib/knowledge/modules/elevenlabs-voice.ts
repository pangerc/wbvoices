/**
 * ElevenLabs Voice Knowledge Module
 *
 * TWO-LAYER tag approach:
 * 1. Opening stack: Speed/energy/accent tags at the start (multiplicative hack)
 * 2. Dramatic tags throughout: [laughs], [sighs], [whispers] at emotional moments
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const elevenlabsVoiceModule: KnowledgeModule = {
  id: "elevenlabs-voice",
  name: "ElevenLabs Voice Guidance",
  keywords: [
    "voice",
    "script",
    "elevenlabs",
    "emotional",
    "tag",
    "laughs",
    "happy",
    "excited",
    "tone",
    "description",
    "baseline",
  ],

  getContent(context?: KnowledgeContext): string {
    const pacing = context?.pacing || "normal";
    const accent = context?.accent;
    const region = context?.region;

    // Build pacing guidance if specified
    let pacingGuidance = "";
    if (pacing === "fast") {
      pacingGuidance = `
## FAST PACING MODE
Create fast-paced, energetic delivery with urgency and excitement.
RECOMMENDED baseline tones: fast_read, energetic, dynamic, excited
Use [rapid-fire] and [fast] tags in your OPENING STACK - they save 2-4 seconds per ad.
Use shorter sentences and action-oriented language.`;
    }

    let accentGuidance = "";
    if (accent && accent !== "neutral") {
      accentGuidance = `
## ACCENT TAG
This ad requires: [${accent} accent]${region ? ` (${region})` : ""}
Place accent tag at the START of the opening stack.
Example: [${accent} accent][excited][rapid-fire][fast][fast] Your text starts here...`;
    }

    const tagDensityGuidance =
      pacing === "fast"
        ? `
## OPENING STACK (fast pacing)
Stack speed/energy tags at the START of each voice line:
- Include [rapid-fire] + 2-3 [fast] tags for multiplicative speed effect
- Add mood tag ([excited], [happy], [confident])
- Target 4-6 tags in the opening stack

Example: [French accent][excited][rapid-fire][fast][fast][happy] Your text starts here...`
        : `
## OPENING STACK (normal pacing)
Start each voice line with 2-3 mood/delivery tags:
- Choose tags matching voice personality
- Don't overstack - 2-3 tags is enough

Example: [happy][excited] Your text starts here...`;

    const examples =
      pacing === "fast"
        ? `
## EXAMPLES (Fast Pacing) - Notice BOTH layers

**Warm, Friendly voice:**
- Baseline tone: energetic
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[excited][rapid-fire][fast][fast] You're gonna LOVE this! [laughs] Our new product just dropped! [whispers] And the price? [happy] Unbelievable!

**Professional voice:**
- Baseline tone: confident
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[confident][rapid-fire][fast][fast] Introducing our solution. [sighs] Finally, proven results. [serious] Act now.

**Playful dialogue:**
- Baseline tone: playful
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[mischievously][rapid-fire][fast][fast] Okay okay okay... [laughs] you're NOT gonna believe this! [excited] It's SO good! [chuckles] Trust me.`
        : `
## EXAMPLES (Normal Pacing) - Notice BOTH layers

**Warm, Friendly voice:**
- Baseline tone: cheerful
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[laughs][happy] You won't believe this! [excited] Our new product is here. [whispers] And the price? [cheerful] Unbeatable.

**Professional voice:**
- Baseline tone: professional
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[confident] Introducing our latest solution. [sighs] Proven results at last. [serious] Guaranteed satisfaction.

**Calm, Soothing voice:**
- Baseline tone: calm
- Script: ${accent && accent !== "neutral" ? `[${accent} accent]` : ""}[gentle] Take a moment for yourself... [sighs] You deserve this. [whispers] Pure relaxation.`;

    return `## ElevenLabs V3 Voice Guidance - TWO-LAYER Tag System
${pacingGuidance}

### BASELINE TONE (description field)
Choose ONE baseline tone for overall voice character. REQUIRED.
Options: cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read
${tagDensityGuidance}
${accentGuidance}

## LAYER 2: DRAMATIC TAGS THROUGHOUT (CRITICAL!)

After your opening stack, ADD dramatic/non-verbal tags at emotional moments in the text:

**Non-verbal sounds to intersperse:**
[laughs], [chuckles], [sighs], [whispers], [exhales], [giggles], [snorts]

**Placement:** Insert these at natural dramatic beats - pauses, reveals, punchlines, emotional shifts.

**WRONG - All tags at start, nothing throughout:**
[excited][rapid-fire][fast][fast][happy] You're gonna love this! Our new product is here. And the price? Unbeatable!

**CORRECT - Opening stack PLUS dramatic tags throughout:**
[excited][rapid-fire][fast][fast] You're gonna love this! [laughs] Our new product is here. [whispers] And the price? [happy] Unbeatable!

### TAG CATEGORIES

**Opening Stack Tags (start of line):**
Speed: [rapid-fire], [fast]
Mood: [excited], [happy], [confident], [serious], [gentle], [mischievously]
Accent: [French accent], [German accent], etc.

**Dramatic Tags (throughout text):**
[laughs], [chuckles], [sighs], [whispers], [exhales], [giggles], [snorts], [gasps]

### VOICE PERSONALITY → TAG MATCHING

**Warm, Friendly voices:** ✅ [laughs], [chuckles], [happy], [excited] ❌ [serious], [stern]
**Professional voices:** ✅ [confident], [sighs], [thoughtful] ❌ [giggles], [silly]
**Playful voices:** ✅ [laughs], [mischievously], [excited] ❌ [monotone], [serious]
**Calm voices:** ✅ [sighs], [whispers], [gentle] ❌ [excited], [shouting]
${examples}

### KEY PRINCIPLES

1. **TWO LAYERS**: Opening stack (speed/mood) + dramatic tags throughout (non-verbal)
2. **Opening stack** sets the pace and energy for the whole line
3. **Dramatic tags** create emotional texture and natural delivery
4. **Tags in ENGLISH** regardless of script language
5. **Match personality** - playful voices get [laughs], professional get [sighs]

Character limit: 3,000 characters per voice segment`;
  },
};
