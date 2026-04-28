/**
 * Lahajati Voice Knowledge Module
 *
 * Lahajati is a dialect-specialised Arabic TTS. Two delivery modes exist:
 *
 *   - input_mode "0" (structured): use a preset performance_id + dialect_id.
 *     Limited expressive range; defaults are wooden.
 *   - input_mode "1" (custom prompt): pass a free-text Arabic persona as
 *     `voiceInstructions`. The provider joins it with the dialect name into
 *     a single role direction sent to Lahajati. This is where the
 *     character work lives.
 *
 * See `src/lib/providers/LahajatiVoiceProvider.ts:170-197` — the provider
 * picks input_mode "1" automatically whenever `voiceInstructions` is
 * non-empty. The previous prompt routed Lahajati to `simple-voice` and
 * told the LLM "no voiceInstructions field needed", which forced every
 * Arabic ad into the wooden structured mode. This module fixes that.
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const lahajatiVoiceModule: KnowledgeModule = {
  id: "lahajati-voice",
  name: "Lahajati Arabic Voice Guidance",
  keywords: [
    "voice",
    "lahajati",
    "arabic",
    "persona",
    "dialect",
    "msa",
    "khaleeji",
    "egyptian",
    "levantine",
    "maghrebi",
  ],

  getContent(context?: KnowledgeContext): string {
    const accent = context?.accent;
    const region = context?.region;

    let dialectGuidance = "";
    if (accent && accent !== "neutral" && accent !== "standard") {
      dialectGuidance = `

### Dialect for this brief
The brief specifies **${accent}**${region ? ` (${region})` : ""} dialect. Use the matching \`dialectId\` (the per-track \`dialectId\` parameter on \`create_voice_draft\`) — Lahajati's TTS prepends the dialect name to your persona prompt automatically, so the persona itself can be written without naming the dialect. Common mappings: Cairo Egyptian → 7 or 8 (Cairo slang), Riyadh Saudi → ~10 (Khaleeji), Beirut Lebanese → ~14 (Levantine), Casablanca Moroccan → ~20 (Maghrebi). Use \`search_voices\` results to confirm the exact dialect_id when you need it.`;
    }

    return `## Lahajati Arabic Voice Guidance

Lahajati specialises in dialect-rich Arabic TTS. The acting direction lives in the **\`voiceInstructions\`** field — a free-text Arabic persona/role written as if directing a human voice actor. Without a persona prompt, Lahajati falls back to a structured preset that sounds wooden.

### What to put in \`voiceInstructions\`
A single sentence in Arabic naming the character + situation + delivery cue. The provider prepends "Speak in {dialect} dialect." automatically, so don't repeat the dialect name in your persona.

**Strong personas (drop these patterns into your acting direction):**
- \`اقرأ بصوت واثق وحماسي كأنك مذيع رياضي\` — read confidently and enthusiastically, like a sports announcer
- \`اقرأ النص بصوت عالٍ وواضح، كأنك تقدم نشرة إخبارية عاجلة\` — read loudly and clearly, like presenting urgent breaking news
- \`تحدث بهدوء ودفء كأنك تروي قصة لطفل\` — speak calmly and warmly, like telling a story to a child
- \`بصوت ثقة هادئة كمستشار مالي محترف\` — with calm confidence, like a professional financial advisor

### What makes a Lahajati persona land
Same rule as the other providers: character + situation + one sonic detail.

✅ Alive — \`اقرأ بصوت متعب لكنه دافئ، كأنك صديق يصف لي رحلته للتو، الكلمات تتدفق بحماس خفيف\` ("read in a tired but warm voice, like a friend just describing his trip to me, words flowing with gentle excitement")

✅ Alive — \`بصوت ساخر هادئ، كأنك تعرف نهاية القصة قبل أن تبدأ\` ("with calm sarcasm, like you know how the story ends before it starts")

❌ Flat — \`بصوت ودي\` ("in a friendly voice") — too generic, no character, no situation.

### When to skip the persona prompt
For utility / regulatory reads (terms-and-conditions disclaimers, station IDs, short factual stings) the structured mode is fine. Set \`voiceInstructions\` to empty/undefined and pass \`dialectId\` + optionally \`performanceId\` — the provider will use input_mode "0".

For everything else (the actual creative read), write a persona. Every ad benefits.

### Hard rules
1. **Persona is in Arabic.** Tags or English direction in this field will degrade the read.
2. **Do not include English emotional tags** like \`[laughs]\` or \`[excited]\` in the script text — Lahajati renders them as literal text. Acting direction goes in \`voiceInstructions\`, not in the script.
3. **Script text is Arabic prose** in the dialect being voiced (or MSA if the persona indicates formal register).
4. **One persona per track.** Different tracks in a dialogue can have different personas — that's expected.${dialectGuidance}`;
  },
};
