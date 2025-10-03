import { Voice, Language, Provider, CampaignFormat } from "@/types";

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

Music examples by theme (don't parrot the examples, use your own words):
- Baby/parenting products: "gentle lullaby feel", "warm soft piano"
- Automotive: "bold guitar intro", "confident driving beat"
- Food/beverage: "fresh crisp rhythm", "light bubbly melody"
- Technology: "clean modern synth motif", "sleek minimal pulse"

Sound effect examples by theme (keep the description as short and concise, don't overdo it):
- Baby products: "baby giggling" (1-2s), "baby crying" (2-3s)
- Automotive: "car engine starting" (2s), "car door closing" (1s)
- Food/beverage: "soda can opening" (1s), "sizzling pan" (2s)
- Technology: "notification chime" (1s), "keyboard typing" (2s)`;
  }
}
