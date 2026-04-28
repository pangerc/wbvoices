/**
 * ElevenLabs Voice Knowledge Module — agent-facing prompt.
 *
 * **Pass 2 is hidden from the agent.** A separate server-side post-
 * processor (`src/lib/tools/validation/tag-weaver.ts`) runs inside
 * `createVoiceDraft` and weaves V3 emotional + non-verbal tags into
 * each ElevenLabs line using the cast voice's metadata. The agent has
 * no awareness of it — exposing the pass-1/pass-2 split caused the
 * agent to over-coordinate ("I had better find a voice with the right
 * metadata so pass 2 has something to work with") and burn iterations
 * on speculative searches without committing.
 *
 * The agent's job is now simple: write a clean script in the target
 * language, cast voices, set the baseline-tone `description` field.
 * Tags appear in the persisted track text; the agent doesn't write
 * them, the agent doesn't need to know they will appear.
 */

import { KnowledgeModule, KnowledgeContext } from "../types";

export const elevenlabsVoiceModule: KnowledgeModule = {
  id: "elevenlabs-voice",
  name: "ElevenLabs Voice Guidance",
  keywords: [
    "voice",
    "script",
    "elevenlabs",
    "tone",
    "description",
    "baseline",
  ],

  getContent(context?: KnowledgeContext): string {
    const pacing = context?.pacing || "normal";

    const pacingGuidance =
      pacing === "fast"
        ? `

### Fast pacing
The brief calls for an urgent, energetic delivery. Use shorter sentences, action-oriented language, and lean toward baseline tones like \`fast_read\` / \`energetic\` / \`dynamic\` / \`excited\`.`
        : "";

    return `## ElevenLabs V3 voice tracks

### Script
- Write in the target language as **clean prose** — no inline bracket tags.
- Use punctuation as performance direction:
  - **Ellipses (…)** → pause and weight: "It's just… difficult."
  - **CAPITALIZATION** → emphasis: "This is INCREDIBLE!"
  - Exclamation / question marks land naturally.
- Use local idioms; don't translate from English.

### Casting
- Match voice gender + character + accent to the brief.
- For dialog: pick contrasting but complementary voices (different gender or different energy).

### Baseline tone (\`description\` field, REQUIRED on every track)
Pick ONE that matches the line's intent: \`cheerful\` | \`happy\` | \`excited\` | \`energetic\` | \`dynamic\` | \`calm\` | \`gentle\` | \`soothing\` | \`serious\` | \`professional\` | \`authoritative\` | \`empathetic\` | \`warm\` | \`fast_read\` | \`slow_read\`.

### V3 mechanics
- No SSML \`<break>\` tags — punctuation handles pause/weight.
- 5,000 characters per voice segment.${pacingGuidance}`;
  },
};
