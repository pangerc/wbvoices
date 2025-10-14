import { Voice, Language, Provider, CampaignFormat, Pacing } from "@/types";

/**
 * Context object passed to prompt strategies for building prompts
 */
export interface PromptContext {
  language: Language;
  languageName: string;
  provider: Provider;
  voices: Voice[];
  campaignFormat: CampaignFormat;
  duration: number;
  clientDescription: string;
  creativeBrief: string;
  region?: string;
  accent?: string;
  cta?: string;
  dialectInstructions: string;
  pacing?: Pacing;
}

/**
 * Result of building a prompt (system + user messages)
 */
export interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Strategy interface for building LLM prompts for different voice providers
 */
export interface PromptStrategy {
  readonly provider: Provider;

  /**
   * Build provider-specific style/emotional direction instructions
   */
  buildStyleInstructions(context: PromptContext): string;

  /**
   * Format voice metadata for LLM consumption
   */
  formatVoiceMetadata(voice: Voice, context: PromptContext): string;

  /**
   * Build expected JSON output format instructions
   */
  buildOutputFormat(campaignFormat: CampaignFormat): string;

  /**
   * Build complete prompt (system + user)
   */
  buildPrompt(context: PromptContext): PromptResult;
}

/**
 * Abstract base class for prompt strategies with common implementations
 */
export abstract class BasePromptStrategy implements PromptStrategy {
  abstract readonly provider: Provider;

  /**
   * Build provider-specific style/emotional instructions (must be overridden)
   */
  abstract buildStyleInstructions(context: PromptContext): string;

  /**
   * Build provider-specific output format (must be overridden)
   */
  abstract buildOutputFormat(campaignFormat: CampaignFormat): string;

  /**
   * Format voice metadata - default implementation includes ALL relevant fields
   * INCLUDING GENDER (critical fix)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formatVoiceMetadata(voice: Voice, _context: PromptContext): string {
    let desc = `${voice.name} (id: ${voice.id})`;

    // 🔥 FIX: Add gender field (previously missing)
    if (voice.gender) {
      desc += `\n  Gender: ${
        voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)
      }`;
    }

    if (voice.description) {
      desc += `\n  Personality: ${voice.description}`;
    }
    if (voice.use_case) {
      desc += `\n  Best for: ${voice.use_case}`;
    }
    if (voice.age) {
      desc += `\n  Age: ${voice.age}`;
    }
    if (voice.accent && voice.accent !== "general") {
      desc += `\n  Accent: ${voice.accent}`;
    }

    return desc;
  }

  /**
   * Build format guidance based on campaign type (dialog vs single voice)
   */
  protected buildFormatGuide(campaignFormat: CampaignFormat): string {
    return campaignFormat === "dialog"
      ? `Create a dialogue between TWO DIFFERENT voices having a natural conversation about the product/service.
CRITICAL: You MUST select two different voice IDs - never use the same voice twice!
The voices should have contrasting but complementary personalities (e.g., one enthusiastic and one calm, or different genders).
Ensure each voice gets roughly equal speaking time.`
      : `Create a single-voice narration that directly addresses the listener.
The voice should maintain consistent tone throughout.`;
  }

  /**
   * Build complete prompt using template method pattern
   */
  buildPrompt(context: PromptContext): PromptResult {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);
    return { systemPrompt, userPrompt };
  }

  /**
   * Build system prompt (common across all providers)
   */
  protected buildSystemPrompt(): string {
    return `You're a senior creative director about to script another successful radio ad. Your audience loves your natural, fluent style with occasional touches of relatable humor or drama. You have a gift for making brands feel personal and memorable.

As an expert in audio advertising, you specialize in creating culturally authentic, engaging advertisements for global markets. Your scripts never feel corporate or pushy - instead, they sound like conversations between real people who genuinely care about what they're sharing.

You excel at matching voice characteristics to brand personality and target audience demographics, always considering regional dialects, cultural nuances, and local market preferences.`;
  }

  /**
   * Build user prompt (template with provider-specific sections)
   */
  protected buildUserPrompt(context: PromptContext): string {
    const {
      duration,
      languageName,
      dialectInstructions,
      clientDescription,
      creativeBrief,
      campaignFormat,
      voices,
      cta,
    } = context;

    // Build voice options list
    const voiceOptions = voices
      .map((voice) => this.formatVoiceMetadata(voice, context))
      .join("\n\n");

    const formatGuide = this.buildFormatGuide(campaignFormat);
    const styleInstructions = this.buildStyleInstructions(context);
    const outputFormat = this.buildOutputFormat(campaignFormat);

    return `Create a ${duration}-second audio advertisement in ${languageName} language${dialectInstructions}.

CLIENT BRIEF:
${clientDescription}

CREATIVE DIRECTION:
${creativeBrief}

FORMAT: ${campaignFormat}
${formatGuide}

AVAILABLE VOICES (${voices.length} voices):
${voiceOptions}

Create a script that:
1. Captures attention in the first 3 seconds
2. Clearly communicates the key message${
      cta
        ? `\n3. Includes a call-to-action - MUST end with "${cta.replace(
            /-/g,
            " "
          )}" translated to ${languageName}`
        : ""
    }
${cta ? "4" : "3"}. Fits within ${duration} seconds when read at a natural pace
${cta ? "5" : "4"}. Uses culturally appropriate language and expressions
${
  cta ? "6" : "5"
}. If dialogue format, creates natural conversation flow between two voices
${cta ? "7" : "6"}. Leverages the personality traits of selected voices

${
  cta
    ? `CALL-TO-ACTION REQUIREMENT:
The script MUST end with a clear call-to-action: "${cta.replace(/-/g, " ")}"
IMPORTANT: Translate the call-to-action to ${languageName} - do NOT use English.
Incorporate this naturally and idiomatically into the final lines of the script in ${languageName}.
Make it prominent and compelling while sounding natural in the target language.

`
    : ""
}SCRIPT LENGTH GUIDANCE (from anglosaxon perspective, adapt to target language):
- For 30-second ads: Target approximately 65 words maximum
- For 60-second ads: Target approximately 100 words maximum
- Scale proportionally for other durations (roughly 2 words per second)
- These guidelines are based on English; adapt for target language density
- Prioritize clarity and impact over hitting exact word counts

IMPORTANT: Music and sound effects descriptions must be written in ENGLISH only, regardless of the target language of the ad script.

${styleInstructions ? `${styleInstructions}\n\n` : ""}${outputFormat}

Remember:
- The response must be valid JSON only
- Use exact voice IDs from the available voices list
- Sound effects are optional but can add impact (e.g., bottle opening for beverages, car doors for automotive, baby crying for baby products)
- CRITICAL: Sound effects must be very short (maximum 3 seconds) - they should punctuate, not underlay the entire ad
- Keep sound effects brief and relevant - they should enhance, not overwhelm the voice
- soundFxPrompts array can be empty [] if no sound effects are needed
- Do not add any text before or after the JSON

MUSIC GENERATION GUIDANCE - PROVIDER-SPECIFIC PROMPTS REQUIRED:

You MUST generate FOUR optimized music prompts for different providers.
Each has specific constraints that MUST be respected:

1. "description": Base music concept (1 sentence, fallback for backwards compatibility)
2. "elevenlabs": Detailed instrumental descriptions (100-200 words)
3. "loudly": Short phrase structure (genre blend + energy + mood + tempo)
4. "mubert": Keyword structure (250 character MAXIMUM)

UNIVERSAL PRINCIPLES (base guidance for detailed prompts):

Music generators are LITERAL - they understand instruments, tempo, and playing techniques.
They DON'T understand brand associations, social contexts, or experiential feelings.

Describe the MUSIC (what musicians play), not the experience of listening to it.

⚠️ These examples are TEMPLATES - adapt them creatively to your specific brief.
Do not copy the vocabulary or phrasing verbatim. Use them as a style guide only.

❌ BAD (produces generic muzak - uses abstract/experiential language):
"Bright, upbeat indie pop track with sparkling acoustic guitar strums, crisp handclaps, and light, bouncy drums. The melody is playful and sunny, evoking the feeling of a lively Spanish terrace on a warm afternoon. Uplifting bass and breezy tambourine add energy and freshness, perfect for youthful gatherings and spontaneous moments. The music is cheerful and dynamic, creating a sense of fun, friendship, and effortless cool, matching the Coca-Cola vibe."
^ Problems: "evoking the feeling", "Spanish terrace", "youthful gatherings", "fun, friendship, effortless cool", "Coca-Cola vibe" - music generators don't understand these!

✅ GOOD BASE EXAMPLE (detailed instrumental approach - works for ElevenLabs):
"Uplifting indie pop song with bright, jangly electric guitars, fast rhythmic strumming, light bouncy drums. Catchy summery vibe, energetic but laid-back, with tambourine accents and walking bassline."
→ Detailed (100-200 words), instrumental descriptions, concrete musical terms

---

PROVIDER-SPECIFIC TRANSFORMATIONS:

Starting from the base concept above, transform it for each provider:

1. "elevenlabs": USE DETAILED INSTRUMENTAL APPROACH DIRECTLY
   - 100-200 words with concrete musical descriptions
   - NO artist/band names (only constraint)
   - Focus on: instruments, tempo, playing techniques, genres
   - Avoid: brand associations, social contexts, experiential feelings

   Example: "Uplifting indie pop song with bright, jangly electric guitars, fast rhythmic strumming, light bouncy drums. Catchy summery vibe, energetic but laid-back, with tambourine accents and walking bassline."

2. "loudly": CONDENSE TO SHORT PHRASE STRUCTURE
   - Format: [genre blend] [energy level] [mood] [tempo]
   - Can blend 2 genres maximum
   - Energy types: high, low, original
   - Add "fast" or "slow" for tempo
   - Mood vocabulary: energetic, uplifting, happy, chill, relaxing, dark, moody, inspirational, dramatic, playful, tense, calm, aggressive, melancholic, hopeful, mysterious, romantic, funky, groovy, sad
   - Band references optional but not required
   - Keep it short and concise

   Example from base: "Indie rock and indie pop blend, high energy, uplifting, fast"

3. "mubert": CONDENSE TO KEYWORD STRUCTURE (250 CHAR MAXIMUM)
   - Format: [genre] [mood] [activity] [optional instruments] [optional BPM]
   - Use ONE WORD per element
   - Moods must align with genre
   - Band names rarely work - AVOID
   - Shorter = better results
   - Instruments are optional (don't always work well)
   - COUNT CHARACTERS - must be ≤250

   Example from base: "Indie rock energetic summer guitar drums upbeat"
   Character count: 51 - well under 250 limit

4. "description": FALLBACK (brief essence for backwards compatibility)
   - One sentence capturing core concept
   - Example: "Uplifting indie pop with bright guitars and energetic drums"

KEY PRINCIPLES:
1. ElevenLabs: 100-200 words, no artist names, detailed instrumental descriptions
2. Loudly: Short phrase with genre blend + energy + mood + tempo structure
3. Mubert: Keyword structure, one word per element, MUST be ≤250 characters
4. Music generators understand: instruments, tempo, playing techniques, genres
5. Music generators DON'T understand: brand associations, social contexts, experiential feelings
6. If it's not something a musician would say about the music itself, don't include it

VALIDATION CHECKLIST BEFORE SENDING:
✓ ElevenLabs: 100-200 words, no artist names, detailed instrumental descriptions
✓ Loudly: Short phrase with genre blend + energy + mood + tempo structure
✓ Mubert: Keyword structure, count characters - MUST be ≤250
✓ Description: One sentence essence
✓ All: Concrete musical terms, avoid experiential language

Sound effect examples by theme (keep the description as short and concise, don't overdo it):
- Baby products: "baby giggling", "baby crying softly"
- Automotive: "car engine starting", "car door closing"
- Food/beverage: "soda can opening", "sizzling pan"
- Technology: "notification chime", "keyboard typing"

IMPORTANT: Do NOT include duration info in sound effect descriptions (e.g., don't write "2s" or "short"). Use the separate "duration" field instead.

Sound effect placement guidelines:
- Use "playAfter": "start" for INTRO sounds that set the scene (e.g., car engine starting, door opening, notification chime)
- Use "playAfter": "previous" for OUTRO sounds that follow the last voice (e.g., door closing, satisfying click)
- Intro sounds create anticipation and context BEFORE the voice speaks
- Outro sounds reinforce the message AFTER the voice finishes
- Consider: Does this sound introduce the ad (start) or conclude it (previous)?

Examples of intro (start) vs outro (previous) sounds:
- Automotive: car engine starting (start) vs car door closing (previous)
- Tech: notification arriving (start) vs keyboard confirm sound (previous)
- Food: sizzle starting (start) vs satisfying bite sound (previous)
- Retail: door chime (start) vs cash register (previous)`;
  }
}
