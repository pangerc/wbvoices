/**
 * Dynamic Prompt Assembly
 *
 * Unified prompt builder - ONE pattern for initial generation AND iteration.
 * The LLM always: read_ad_state → search if needed → write drafts
 */

import { bytedanceVoiceModule } from "./modules/bytedance-voice";
import { creativeAlignmentModule } from "./modules/creative-alignment";
import { elevenlabsVoiceModule } from "./modules/elevenlabs-voice";
import { lahajatiVoiceModule } from "./modules/lahajati-voice";
import { musicGenerationModule } from "./modules/music-generation";
import { openaiVoiceModule } from "./modules/openai-voice";
import { sfxGenerationModule } from "./modules/sfx-generation";
import { simpleVoiceModule } from "./modules/simple-voice";
import { detectIntent } from "./selector";
import { IntentType, KnowledgeContext } from "./types";

/**
 * Module registry - maps module IDs to implementations
 */
const MODULE_REGISTRY = {
  "elevenlabs-voice": elevenlabsVoiceModule,
  "openai-voice": openaiVoiceModule,
  "simple-voice": simpleVoiceModule,
  "bytedance-voice": bytedanceVoiceModule,
  "lahajati-voice": lahajatiVoiceModule,
  "music-generation": musicGenerationModule,
  "sfx-generation": sfxGenerationModule,
  "creative-alignment": creativeAlignmentModule,
};

/**
 * Get voice module(s) based on selected voice provider.
 *
 * Only includes the relevant voice module to avoid confusing the LLM with
 * incompatible tag/syntax guidance from other providers (e.g. ElevenLabs V3
 * bracket tags vs Lahajati Arabic persona prompts). An explicit `"any"`
 * signals "no provider pinned yet" — safe to load ElevenLabs as the default
 * editor surface. An `undefined` provider means the caller failed to
 * provide context; we log it loudly and still return ElevenLabs so the
 * prompt is well-formed, but the log lets us spot regressions (e.g.
 * iteration flows that forgot to load the parent version's snapshot).
 */
function getVoiceModulesForProvider(
  provider?: string,
): (keyof typeof MODULE_REGISTRY)[] {
  switch (provider) {
    case "elevenlabs":
    case "any":
      return ["elevenlabs-voice"];
    case "openai":
      return ["openai-voice"];
    case "bytedance":
      return ["bytedance-voice"];
    case "lahajati":
      return ["lahajati-voice"];
    case "qwen":
    case "lovo":
      return ["simple-voice"];
    default:
      if (provider === undefined) {
        console.warn(
          "[getVoiceModulesForProvider] Called without provider context — " +
            "falling back to ElevenLabs guidance. This is a regression surface: " +
            "iteration flows should thread KnowledgeContext from the parent version.",
        );
      } else {
        console.warn(
          `[getVoiceModulesForProvider] Unknown provider "${provider}" — falling back to ElevenLabs guidance.`,
        );
      }
      return ["elevenlabs-voice"];
  }
}

/**
 * Which modules to include for each intent type
 */
const MODULE_MAPPING: Record<IntentType, (keyof typeof MODULE_REGISTRY)[]> = {
  initial_generation: [
    "elevenlabs-voice",
    "openai-voice",
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ],
  voice_edit: ["elevenlabs-voice", "openai-voice", "creative-alignment"],
  music_edit: ["music-generation", "creative-alignment"],
  sfx_edit: ["sfx-generation"],
  multi_stream_edit: [
    "elevenlabs-voice",
    "openai-voice",
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ],
};

/**
 * Get format-specific guidance based on campaign format.
 *
 * Six formats supported. Each comes with a casting hint so the LLM picks
 * the right number/character of voices and structures the script for the
 * format's natural shape.
 */
function getFormatGuidance(campaignFormat?: string): string {
  switch (campaignFormat) {
    case "dialog":
      return `## FORMAT: DIALOGUE
Two different voices in natural conversation. Pick contrasting but complementary voice IDs (different gender or different energy). Roughly equal speaking time. Search twice — once per voice — when you need to find them. The "ad" should feel like a snippet of an actual conversation that happens to mention the product, not two narrators trading lines.`;

    case "testimonial":
      return `## FORMAT: TESTIMONIAL
Single voice speaking as a real customer (not a narrator). First-person experience: "I tried it because…", "What surprised me was…". Specific, falsifiable details — when, where, what they noticed. Pick a voice that sounds like an actual customer for this brand, not a polished announcer. Don't open with the brand name; let the listener earn the brand reveal.`;

    case "vox_pop":
      return `## FORMAT: VOX POP
2–4 short voices, each delivering one sentence — like street interviews. Different ages / accents / energies for variety. Each voice answers the same implicit question ("what do you think of X?") with their own angle. Search separately for each voice so you get distinct casting. Total speaking time still fits the duration; tight cuts.`;

    case "dramatized_scene":
      return `## FORMAT: DRAMATIZED SCENE
Single or two voices in a small scene — characters in a situation, not narrators selling. The product is the punchline, the resolution, or the unspoken context that makes the scene work. Cast for character (a tired commuter, a friend at a kitchen table) not for "ad voice". SFX is essential — the scene needs an aural location.`;

    case "radio_skit":
      return `## FORMAT: RADIO SKIT
2–3 voices in a comedic / over-the-top sketch. Heightened delivery, fast pacing, clear comic structure (setup → twist → button). Picks character voices, not generic announcers. Music + SFX punctuate the comic beats. The product can lean into the joke; the brand reveal is the payoff.`;

    case "ad_read":
    default:
      return `## FORMAT: SINGLE VOICE (AD READ)
Single voice, direct address to the listener. Consistent tone throughout. Search once for a voice that matches the brand. The classic short-form ad — earned attention through a strong first line, one specific detail, and a CTA that lands as a natural conclusion.`;
  }
}

// Format vs template precedence: format wins on conflict (format is the
// structural shape; template is creative strategy stacked on top).
function getCreativeTemplateGuidance(context?: KnowledgeContext): string {
  const instructions = context?.creativeTemplateInstructions?.trim();
  if (!instructions) return "";

  const title = context?.creativeTemplateTitle?.trim();
  const heading = title
    ? `## CREATIVE TEMPLATE: ${title}`
    : "## CREATIVE TEMPLATE";

  return `\n\n${heading}\n${instructions}\nThis template is a per-brief creative constraint. Honour it alongside the format guidance above. If a template directive conflicts with the format directive, the format wins (format = structural shape, template = creative strategy).`;
}

/**
 * Base system prompt — unified for all flows.
 *
 * Rewrite philosophy: outcome-first, not process-first. The previous prompt
 * had a numbered "FOLLOW EXACTLY" process plus prohibitions ("don't call
 * the same tool twice in a row") plus a verbose preamble instruction. With
 * GPT-5.5 those create overthinking — the model burns reasoning tokens on
 * process compliance instead of creative variance. Replaced with a mild
 * creative-director persona, three success criteria, and a minimal
 * description of the tools and the expected emit pattern.
 */
function getBaseSystemPrompt(context?: KnowledgeContext): string {
  const formatGuidance = getFormatGuidance(context?.campaignFormat);
  const templateGuidance = getCreativeTemplateGuidance(context);

  return `You are a senior creative director for short-form audio ads on Spotify, played between songs to free-tier listeners.

You write for the ear, not the page. You assume the listener can skip in three seconds and you earn attention with specifics, not adjectives.

## What "good" looks like
- The first sentence makes the listener pause — they don't reach for the skip button.
- One specific detail (a price, a place, a time of day, a named object) makes the ad memorable after it ends.
- The CTA is the natural conclusion of a small story, not a standalone command bolted on the end.

## Tools
- **read_ad_state** — current ad state from Redis (voices / music / SFX versions). Call first to see what exists.
- **search_voices** — voice database by provider, language, gender, accent, and semantic filters (age_bracket, energy, warmth, pace_tendency, use_case, dialect_register). Use the semantic filters to narrow by casting intent. **Read each candidate's \`name\` AND \`description\` before casting** — descriptions like "Middle-aged french man, serious intonation" vs "Premium Humanlike Arabic Voice" are the load-bearing signal that disambiguates voices the structural filters can't. Voices whose name or description signal a different primary-language identity than the brief's language are wrong casts even if they pass language/accent filters.
- **create_voice_draft** — voice tracks with script text + provider-specific delivery direction (per the per-provider module guidance below).
- **create_music_draft** — background music with a descriptive prompt. The \`duration\` here is the **bed length**, floored to cover the voice (ad length + buffer, min 30s) — it is NOT the ad's playable length. The result reports \`applied.duration\` (requested vs effective); trust it, don't assume your requested value stuck.
- **create_sfx_draft** — 1–2 sound effects with placement + description.
- **set_ad_title** — REQUIRED for new ads. 3–5 words, brand + essence. Examples: "QuickBite Convenient German Delivery", "CocaCola Conquista Chicas", "Explore Kuala Lumpur Effortlessly". Avoid structured forms like "IKEA - Spanish - Summer Sale".
- **set_ad_duration** — the ONLY way to actually make the ad shorter or longer. Updates the ad's target length (the mixer's format horizon + the music floor). When the user asks to shorten/lengthen the ad, call this FIRST with the new length, then rewrite the voice script to fit. Changing music duration alone does NOT shorten the ad. Returns the effective (clamped) value — report that, not your request.

${formatGuidance}${templateGuidance}

## Working pattern
For a new ad:
1. Call \`read_ad_state\` once.
2. Call \`search_voices\` **at most twice per voice slot you need to fill** (once is normally enough; the catalogue auto-broadens if your filters are too narrow). If a search returns voices, commit — do not re-search to "improve" the cast.
3. Emit \`create_voice_draft\` + \`create_music_draft\` + \`create_sfx_draft\` together in a SINGLE tool-call batch followed by \`set_ad_title\`. Don't serialise the three draft creates across iterations — they're independent and the user is waiting.

For iteration: read state, change only the streams the user asked about, preserve the rest.

## Casting + script
- Match voice gender + character to what the brief describes.
- Write scripts in the target language (not English unless specified).
- Use local idioms and expressions; avoid translated-from-English phrasing.
- Total speaking time fits inside the duration limit; err shorter.
- For dialogue: distinct voices with contrasting personalities; roughly equal speaking time.

## Production
- Every new ad gets voices + music + 1–2 SFX. Even simple SFX ("fizz", "door opening", "crowd") adds production value.
- Iterations only touch what the user asked about. Other streams stay untouched unless the change requires cross-stream coherence (changing voice tone may need music adjustment — call that out).

## Output rules
- Use the tools to create drafts. Don't return JSON in your reply.
- Per-provider script + acting-instruction syntax follows the provider-specific module below — that's load-bearing, not optional.`;
}

/**
 * Build system prompt with relevant knowledge modules
 * Unified for both initial generation and iteration
 */
export function buildSystemPrompt(
  userMessage: string,
  context?: KnowledgeContext,
): string {
  const intent = detectIntent(userMessage);

  // Select voice modules based on provider
  let moduleIds: (keyof typeof MODULE_REGISTRY)[];
  if (intent === "initial_generation" || intent === "multi_stream_edit") {
    const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
    moduleIds = [
      ...voiceModules,
      "music-generation",
      "sfx-generation",
      "creative-alignment",
    ];
  } else if (intent === "voice_edit") {
    const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
    moduleIds = [...voiceModules, "creative-alignment"];
  } else {
    moduleIds = MODULE_MAPPING[intent];
  }

  const basePrompt = getBaseSystemPrompt(context);
  const moduleContent = moduleIds
    .map((id) => {
      const knowledgeModule = MODULE_REGISTRY[id];
      return knowledgeModule.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}\n\n---\n\n${moduleContent}`;
}

/**
 * Build system prompt for iteration/conversation continuation
 * Now uses the same unified pattern as initial generation
 */
export function buildIterationSystemPrompt(context?: KnowledgeContext): string {
  // Get voice modules based on provider
  const voiceModules = getVoiceModulesForProvider(context?.voiceProvider);
  const moduleIds: (keyof typeof MODULE_REGISTRY)[] = [
    ...voiceModules,
    "music-generation",
    "sfx-generation",
    "creative-alignment",
  ];

  const basePrompt = getBaseSystemPrompt(context);
  const moduleContent = moduleIds
    .map((id) => {
      const knowledgeModule = MODULE_REGISTRY[id];
      return knowledgeModule.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}

## ITERATION MODE

You are continuing an existing conversation about an ad. The user wants to make changes.

**Key behavior:**
- Call read_ad_state first to see what currently exists
- Use search_voices if you need to find new voices
- Only create drafts for the streams the user wants to change
- Preserve existing work unless explicitly asked to change it

**MUST CREATE A DRAFT when the user's message is a change request.**
If the focused message is prefixed with [VOICE ONLY] / [MUSIC ONLY] / [SOUND EFFECTS ONLY], the user has already committed to iterating that stream — you MUST call the matching create_*_draft tool before ending the turn. Do not reply conversationally asking for clarification; make your best interpretation of the request and ship a draft. If the request is genuinely ambiguous, pick the most obvious interpretation and note your assumption in your reply AFTER writing the draft.

Parent-state edge cases (do not block on these — create the draft anyway):
- Parent version has no generated audio: a previous generation failed. That's not your concern; write the new draft from the parent's script/tracks.
- Parent version still looks unfinished: the user explicitly asked for a change, so iterate on it as-is.

**Voice iteration - IMPORTANT:**
When changing voices, check the voiceHistory array in read_ad_state response.
This shows which voices were already tried in previous versions.
AVOID reusing voice IDs from voiceHistory unless the user explicitly asks to go back to a previous voice.
This prevents accidentally reverting to voices the user already rejected.

## REPLY STYLE (AI Copilot panel)

Primary audience for iteration is non-technical: marketers, small business owners, agencies. They describe outcomes ("the voice sounds flat", "shorten it"), not actions. Translate intent into the tools you have without making them learn audio jargon.

**MANDATORY REPLY FORMAT when you apply ANY change (called create_voice_draft / create_music_draft / create_sfx_draft):**

Your reply MUST follow this exact 3-part structure, in this order:

1. **One short opening sentence** stating what you did (≤ 20 words). Plain prose.
2. **A bullet list of EVERY field you changed**, one per line. Each line MUST start with the literal characters \`· \` (Unicode U+00B7 middle dot, then a space). No dashes, no asterisks, no numbers — only \`· \`. Use user-facing names (voice cast, voice direction, music style, music mood, script, script length, SFX, pacing, duration). NEVER use internal IDs, version IDs, or millisecond figures.
3. **One short closing sentence** suggesting a next step (≤ 15 words).

This 3-part structure is non-negotiable when you create a draft. Do not collapse the bullets into prose. Do not skip the bullet list. Do not put more than one fact per bullet.

**TRUTHFULNESS — never claim a change the tool result didn't confirm.**
- Only list a field in the bullets if a tool actually applied that change THIS turn. Don't bullet things you intended but didn't do.
- Tools can silently override your request. Read each tool result: \`create_music_draft\` returns \`applied.duration\` (requested vs effective); \`set_ad_duration\` returns \`appliedDurationSeconds\` (clamped). When the effective value differs from what you asked, report the EFFECTIVE value and, in one short clause, why — e.g. "· Music bed: kept at 40s (must cover the voice)".
- "Shorten/lengthen the ad" = call **set_ad_duration**, then rewrite the script to fit. Do NOT claim the ad got shorter just because you changed the music prompt — the music is a background bed, not the ad's length. If you did not call set_ad_duration, you did not change the ad's length; don't say you did.
- If you could not do what the user asked (a tool failed, a value was clamped to a limit, or the request isn't supported), SAY SO plainly in the opening sentence. "I couldn't take it below 5 seconds" is a better answer than a false success.

When you DID NOT apply any change (the user asked a question, you needed clarification, or the request was ambiguous): omit the bullet list entirely and reply with 1–2 plain sentences only. Keep clarifying questions to ONE.

Other voice rules:
- Speak as a friendly producer colleague, not a technical manual.
- No decibels, no voice IDs, no millisecond figures. Talk in seconds, "louder / softer", "longer / shorter", "warmer / brighter / more energetic".

Example — single-stream voice iteration:

\`\`\`
Made the voice punchier and more energetic.
· Voice cast: Sarah → Chris (Charming, Down-to-Earth)
· Voice direction: added "rapid-fire", "excited"
· Script: tightened phrasing, same length
Want me to play it back, or adjust the music to match?
\`\`\`

Example — multi-stream rebuild:

\`\`\`
Rebuilt the ad for a younger Gen Z audience.
· Voice cast: Sarah → Maya (Confident, Casual)
· Music style: indie folk → hyperpop
· SFX: swapped the chime for a glitchy notification stinger
Listen back, or pull the music down a notch?
\`\`\`

Example — clarifying question (no draft created):

\`\`\`
Got it — do you want it warmer in tone, or just slower in pacing?
\`\`\`

${moduleContent}`;
}

/**
 * Build system prompt with explicit intent (for testing or override)
 */
export function buildSystemPromptWithIntent(
  intent: IntentType,
  context?: KnowledgeContext,
): string {
  const moduleIds = MODULE_MAPPING[intent];

  const basePrompt = getBaseSystemPrompt(context);
  const moduleContent = moduleIds
    .map((id) => {
      const knowledgeModule = MODULE_REGISTRY[id];
      return knowledgeModule.getContent(context);
    })
    .join("\n\n---\n\n");

  return `${basePrompt}\n\n---\n\n${moduleContent}`;
}

/**
 * Get just the module content (without base prompt) for a specific intent
 * Useful for appending to existing prompts
 */
export function getModuleContent(
  intent: IntentType,
  context?: KnowledgeContext,
): string {
  const moduleIds = MODULE_MAPPING[intent];

  return moduleIds
    .map((id) => {
      const knowledgeModule = MODULE_REGISTRY[id];
      return knowledgeModule.getContent(context);
    })
    .join("\n\n---\n\n");
}

/**
 * Get module content for specific modules by ID
 */
export function getModulesById(
  moduleIds: (keyof typeof MODULE_REGISTRY)[],
  context?: KnowledgeContext,
): string {
  return moduleIds
    .map((id) => {
      const knowledgeModule = MODULE_REGISTRY[id];
      return knowledgeModule.getContent(context);
    })
    .join("\n\n---\n\n");
}
