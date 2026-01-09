/**
 * ElevenLabs Voice Knowledge Module
 *
 * TWO-LAYER tag approach:
 * 1. Opening stack: Speed/energy/accent tags at the start (multiplicative hack)
 * 2. Dramatic tags throughout: [laughs], [sighs], [whispers] at emotional moments
 *
 * Based on ElevenLabs v3 best practices:
 * https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
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
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[excited][rapid-fire][fast][fast] You're gonna LOVE this! [laughs] Our new product just dropped! [whispers] And the price? [happy] Unbelievable!

**Professional voice:**
- Baseline tone: confident
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[confident][rapid-fire][fast][fast] Introducing our solution. [sighs] Finally, PROVEN results. [serious] Act now.

**Playful dialogue:**
- Baseline tone: playful
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[mischievously][rapid-fire][fast][fast] Okay okay okay... [laughs] you're NOT gonna believe this! [excited] It's SO good! [chuckles] Trust me.`
        : `
## EXAMPLES (Normal Pacing) - Notice BOTH layers

**Warm, Friendly voice:**
- Baseline tone: cheerful
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[laughs][happy] You won't BELIEVE this! [excited] Our new product is here. [whispers] And the price? [cheerful] Unbeatable.

**Professional voice:**
- Baseline tone: professional
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[confident] Introducing our latest solution. [sighs] Proven results... at last. [serious] Guaranteed satisfaction.

**Calm, Soothing voice:**
- Baseline tone: calm
- Script: ${
            accent && accent !== "neutral" ? `[${accent} accent]` : ""
          }[gentle] Take a moment for yourself... [sighs] You deserve this. [whispers] Pure relaxation.`;

    return `## ElevenLabs V3 Voice Guidance - TWO-LAYER Tag System

**IMPORTANT V3 NOTES:**
- V3 does NOT support SSML <break> tags - use punctuation and audio tags instead
- Character limit: 5,000 characters per voice segment
- Works best with prompts >250 characters
${pacingGuidance}

### BASELINE TONE (description field)
Choose ONE baseline tone for overall voice character. REQUIRED.
Options: cheerful | happy | excited | energetic | dynamic | calm | gentle | soothing | serious | professional | authoritative | empathetic | warm | fast_read | slow_read
${tagDensityGuidance}
${accentGuidance}

## LAYER 2: EMOTIONAL & NON-VERBAL TAGS THROUGHOUT (CRITICAL!)

After your opening stack, ADD emotional/non-verbal tags at dramatic moments in the text.

### TAG CATEGORIES

**Emotional Directions (mood/delivery):**
[happy], [sad], [excited], [angry], [annoyed], [sarcastic], [curious]
[surprised], [thoughtful], [appalled], [confident], [serious], [gentle]
[dramatically], [warmly], [impressed], [delighted], [amazed], [mischievously]

**Non-verbal Sounds (intersperse these!):**
[laughs], [chuckles], [giggles], [laughs harder], [starts laughing], [wheezing]
[sighs], [exhales], [exhales sharply], [inhales deeply]
[whispers], [gasps], [happy gasp], [snorts], [crying]
[clears throat], [swallows], [gulps]
[short pause], [long pause]

**Opening Stack Tags (start of line):**
Speed: [rapid-fire], [fast]
Mood: [excited], [happy], [confident], [serious], [gentle], [mischievously]
Accent: [French accent], [German accent], [strong X accent], etc.

## PUNCTUATION FOR EMPHASIS (V3 Feature!)

Use punctuation strategically - v3 is highly responsive to these:
- **Ellipses (...)** add pauses and weight: "It's just... difficult."
- **CAPITALIZATION** increases emphasis: "This is INCREDIBLE!"
- **Exclamation marks** add energy: "I can't believe it!"
- **Question marks** add natural inflection

**WRONG - All tags at start, nothing throughout:**
[excited][rapid-fire][fast][fast][happy] You're gonna love this! Our new product is here. And the price? Unbeatable!

**CORRECT - Opening stack PLUS emotional tags + punctuation throughout:**
[excited][rapid-fire][fast][fast] You're gonna LOVE this! [laughs] Our new product is here... [whispers] And the price? [happy] Unbeatable!

### VOICE PERSONALITY → TAG MATCHING

**Warm, Friendly voices:** ✅ [laughs], [chuckles], [happy], [excited], [delighted] ❌ [serious], [stern]
**Professional voices:** ✅ [confident], [sighs], [thoughtful], [impressed] ❌ [giggles], [silly]
**Playful voices:** ✅ [laughs], [mischievously], [excited], [surprised] ❌ [monotone], [serious]
**Calm voices:** ✅ [sighs], [whispers], [gentle], [inhales deeply] ❌ [excited], [shouting]
**Dramatic voices:** ✅ [dramatically], [gasps], [amazed], [appalled] ❌ [casual], [flat]
${examples}

### KEY PRINCIPLES

1. **TWO LAYERS**: Opening stack (speed/mood) + emotional tags throughout (non-verbal + directions)
2. **Opening stack** sets the pace and energy for the whole line
3. **Emotional tags** create texture and natural delivery - sprinkle them at beats!
4. **Use CAPS and ellipses** for emphasis and pauses (v3 responds well to these)
5. **Tags in ENGLISH** regardless of script language
6. **Match personality** - playful voices get [laughs], professional get [sighs]
7. **Vary your tags** - don't just use [laughs], try [chuckles], [giggles], [happy gasp]`;
  },
};
