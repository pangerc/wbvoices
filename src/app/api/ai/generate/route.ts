/**
 * AI Creative Generation Endpoint (V3 Agentic Tool-Calling)
 *
 * Replaces the old JSON-parsing approach with agentic tool-calling.
 * The LLM now uses tools to:
 * 1. Search for voices from the database
 * 2. Create voice drafts directly in Redis
 * 3. Create music drafts directly in Redis
 * 4. Create SFX drafts directly in Redis
 *
 * No more JSON parsing errors - the LLM writes directly via tools.
 *
 * Uses modular knowledge architecture for provider-specific guidance:
 * - ElevenLabs: Emotional tags + baseline tones
 * - OpenAI: voiceInstructions format
 * - Music: Provider-specific prompts (elevenlabs, loudly, mubert)
 * - SFX: Short, English descriptions
 */

import { NextRequest, NextResponse } from "next/server";
import { runAgentLoop, type Provider } from "@/lib/tool-calling";
import { prefetchVoices } from "@/lib/tool-calling/voicePrefetch";
import { normalizeAIModel } from "@/utils/aiModelSelection";
import { getLanguageName } from "@/utils/language";
import { setAdMetadata } from "@/lib/redis/versions";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import { buildSystemPrompt, type KnowledgeContext } from "@/lib/knowledge";
import type { ProjectBrief, Language, Provider as VoiceProvider } from "@/types";

/**
 * Build the user message from the brief data
 */
function buildUserMessage(params: {
  language: string;
  languageName: string;
  clientDescription: string;
  creativeBrief: string;
  campaignFormat: string;
  duration: number;
  region?: string;
  accent?: string;
  cta?: string;
  pacing?: string;
  adId: string;
  voiceProvider: string;
}): string {
  const {
    languageName,
    clientDescription,
    creativeBrief,
    campaignFormat,
    duration,
    region,
    accent,
    cta,
    pacing,
    adId,
    voiceProvider,
  } = params;

  let dialectNote = "";
  if (accent && accent !== "neutral") {
    dialectNote = `\n- Dialect/Accent: ${accent}`;
    if (region) {
      dialectNote += ` (${region})`;
    }
  } else if (region) {
    dialectNote = `\n- Region: ${region} (use local expressions)`;
  }

  let pacingNote = "";
  if (pacing && pacing !== "normal") {
    pacingNote = `\n- Pacing: ${pacing}`;
  }

  let ctaNote = "";
  if (cta) {
    ctaNote = `\n- Call to Action: ${cta}`;
  }

  return `Create a ${duration}-second ${campaignFormat} audio ad.

## Brief Details
- Ad ID: ${adId}
- Language: ${languageName}
- Voice Provider: ${voiceProvider} (REQUIRED - only search for voices from this provider)
- Client: ${clientDescription}
- Creative Direction: ${creativeBrief}${dialectNote}${pacingNote}${ctaNote}

Please search for suitable voices in ${languageName} from ${voiceProvider}, then create the voice tracks, music, and sound effects.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      adId,
      sessionId,
      aiModel: rawAiModel,
      language,
      clientDescription,
      creativeBrief,
      campaignFormat,
      duration = 60,
      region,
      accent,
      cta,
      pacing,
      selectedProvider: rawSelectedProvider,
    } = body;

    // Voice provider - default to elevenlabs if not specified
    const voiceProvider = rawSelectedProvider || "elevenlabs";

    // Validate required fields
    if (!adId) {
      return NextResponse.json(
        { error: "adId is required for agentic generation" },
        { status: 400 }
      );
    }

    if (!language || !clientDescription || !creativeBrief || !campaignFormat) {
      return NextResponse.json(
        { error: "Missing required fields: language, clientDescription, creativeBrief, campaignFormat" },
        { status: 400 }
      );
    }

    // Normalize AI model to provider
    const provider = normalizeAIModel(rawAiModel || "openai") as Provider;

    // Check API key availability
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }
    if (provider === "moonshot" && !process.env.MOONSHOT_API_KEY) {
      return NextResponse.json(
        { error: "Moonshot API key not configured" },
        { status: 500 }
      );
    }
    if (provider === "qwen" && !process.env.QWEN_API_KEY) {
      return NextResponse.json(
        { error: "Qwen API key not configured" },
        { status: 500 }
      );
    }

    console.log(`[/api/ai/generate] Starting agentic generation for ad ${adId}`);
    console.log(`[/api/ai/generate] LLM Provider: ${provider}, Voice Provider: ${voiceProvider}, Language: ${language}`);

    // Build prompts with knowledge context
    const languageName = getLanguageName(language);
    const knowledgeContext: KnowledgeContext = {
      pacing: pacing === "fast" ? "fast" : "normal",
      accent: accent || undefined,
      region: region || undefined,
      language: language,
      voiceProvider: voiceProvider,
      campaignFormat: campaignFormat as "dialog" | "ad_read",
    };

    // Build user message first (used for intent detection in buildSystemPrompt)
    const userMessage = buildUserMessage({
      language,
      languageName,
      clientDescription,
      creativeBrief,
      campaignFormat,
      duration,
      region,
      accent,
      cta,
      pacing,
      adId,
      voiceProvider,
    });

    // Prefetch voices BEFORE LLM call to eliminate search_voices round-trip
    console.log(`[/api/ai/generate] Prefetching voices for ${voiceProvider}/${language}`);
    let prefetchedVoices = await prefetchVoices(
      voiceProvider as VoiceProvider,
      language as Language,
      accent || undefined
    );

    // Fallback: if accent is too specific and yields no voices, try without accent
    if (prefetchedVoices.totalCount === 0 && accent) {
      console.log(`[/api/ai/generate] No voices for accent "${accent}", retrying without accent filter`);
      prefetchedVoices = await prefetchVoices(
        voiceProvider as VoiceProvider,
        language as Language
      );
    }

    console.log(`[/api/ai/generate] Prefetched ${prefetchedVoices.totalCount} voices (${prefetchedVoices.maleVoices.length} male, ${prefetchedVoices.femaleVoices.length} female)`);

    // Build system prompt with modular knowledge AND prefetched voices
    const systemPrompt = buildSystemPrompt(userMessage, knowledgeContext, prefetchedVoices);
    console.log(`[/api/ai/generate] Built system prompt with knowledge modules + voice context`);

    // Run the agent loop with initial_generation tool set (no search_voices)
    const result = await runAgentLoop(systemPrompt, userMessage, {
      adId,
      provider,
      reasoningEffort: "medium", // Medium reasoning for quality creative output
      maxIterations: 5, // Reduced since we expect 1 iteration with prefetch
      continueConversation: false, // Fresh conversation for new generation
      toolSet: "initial_generation", // Excludes search_voices since voices are prefetched
    });

    console.log(`[/api/ai/generate] Agent completed with ${result.toolCallHistory.length} tool calls`);
    console.log(`[/api/ai/generate] Drafts created:`, result.drafts);

    // Generate a title from client description
    const adTitle = `${clientDescription.slice(0, 30)}${clientDescription.length > 30 ? '...' : ''} - ${languageName}`;

    // Build brief object from request params
    const brief: ProjectBrief = {
      clientDescription,
      creativeBrief,
      campaignFormat,
      adDuration: duration,
      selectedLanguage: language,
      selectedRegion: region || null,
      selectedAccent: accent || null,
      selectedPacing: pacing || null,
      selectedCTA: cta || null,
      selectedAiModel: rawAiModel || "openai",
      selectedProvider: voiceProvider as "elevenlabs" | "openai" | "lovo",
    };

    // Ensure ad exists (lazy creation) then update with title and brief
    const effectiveSessionId = sessionId || "default-session";
    const existingMeta = await ensureAdExists(adId, effectiveSessionId, brief);

    await setAdMetadata(adId, {
      ...existingMeta,
      name: adTitle,
      brief, // Persist brief for page reload!
      lastModified: Date.now(),
    });
    console.log(`[/api/ai/generate] Updated ad title and brief`);

    // Return the result
    return NextResponse.json({
      conversationId: result.conversationId,
      drafts: result.drafts,
      message: result.message,
      provider: result.provider,
      toolCalls: result.toolCallHistory.length,
      usage: result.totalUsage,
      adName: adTitle, // Return for frontend to update Header
    });
  } catch (error) {
    console.error("[/api/ai/generate] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate creative",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
