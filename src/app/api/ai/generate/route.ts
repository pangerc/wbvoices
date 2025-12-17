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
import { runAgentLoop } from "@/lib/tool-calling";
import { getLanguageName } from "@/utils/language";
import { setAdMetadata, getAdMetadata } from "@/lib/redis/versions";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import { buildSystemPrompt, type KnowledgeContext } from "@/lib/knowledge";
import type { ProjectBrief } from "@/types";

/**
 * Extract brand name from client description for fallback ad title.
 * LLM should set title via set_ad_title tool, but this is a safety net.
 */
function extractBrandName(description: string): string {
  // Try common patterns: "for [Brand]", "[Brand] is", "Client: [Brand]"
  const patterns = [
    /(?:for|promoting|advertising)\s+([A-Z][a-zA-Z0-9\s&']+?)(?:\s+[-,.]|\s+is|\s+a\b)/i,
    /^(?:Client:\s*)?([A-Z][a-zA-Z0-9\s&']+?)(?:\s+[-,.]|\s+Brand|\s+is|\s+a\b)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1] && match[1].trim().length <= 30) {
      return match[1].trim();
    }
  }

  // Final fallback: first 2-3 words
  const firstWords = description.split(/\s+/).slice(0, 3).join(" ");
  return firstWords.length <= 25 ? firstWords : firstWords.slice(0, 22) + "...";
}

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

  // Calculate word count targets based on duration (~2.5 words/sec)
  const totalWords = Math.round(duration * 2.5);
  const wordsPerSpeaker = campaignFormat === "dialog" ? Math.round(totalWords / 2) : totalWords;

  return `Create a ${duration}-second ${campaignFormat} audio ad.

## Brief Details
- Ad ID: ${adId}
- Language: ${languageName}
- Voice Provider: ${voiceProvider} (REQUIRED - only search for voices from this provider)
- Client: ${clientDescription}
- Creative Direction: ${creativeBrief}${dialectNote}${pacingNote}${ctaNote}

## DURATION CONSTRAINT (CRITICAL)
- STRICT LIMIT: Script MUST fit within ${duration} seconds when read at natural pace
- Target word count: ~${totalWords} words total
${campaignFormat === "dialog" ? `- For dialogue: ~${wordsPerSpeaker} words per speaker (2-4 exchanges max)` : ""}
- Leave 2-3 seconds for pauses and transitions
- SHORTER IS BETTER - err on the side of brevity

Please search for suitable voices in ${languageName} from ${voiceProvider}, then create the voice tracks, music, and sound effects.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      adId,
      sessionId,
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

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    console.log(`[/api/ai/generate] Starting agentic generation for ad ${adId}`);
    console.log(`[/api/ai/generate] Voice Provider: ${voiceProvider}, Language: ${language}`);

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

    // Build system prompt with modular knowledge
    // LLM will call read_ad_state + search_voices as needed
    const systemPrompt = buildSystemPrompt(userMessage, knowledgeContext);
    console.log(`[/api/ai/generate] Built system prompt with knowledge modules`);

    // Run the agent loop
    const result = await runAgentLoop(systemPrompt, userMessage, {
      adId,
      reasoningEffort: "medium",
      maxIterations: 5,
    });

    console.log(`[/api/ai/generate] Agent completed with ${result.toolCallHistory.length} tool calls`);
    console.log(`[/api/ai/generate] Drafts created:`, result.drafts);

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
      selectedProvider: voiceProvider as "elevenlabs" | "openai" | "lovo",
    };

    // Ensure ad exists (lazy creation)
    const effectiveSessionId = sessionId || "default-session";
    await ensureAdExists(adId, effectiveSessionId, brief);

    // Check if LLM set a title via set_ad_title tool
    const currentMeta = await getAdMetadata(adId);
    const llmSetTitle = currentMeta?.name && currentMeta.name !== "Untitled Ad";

    // Use LLM-generated title or fallback to brand extraction
    const adTitle = llmSetTitle
      ? currentMeta.name
      : `${extractBrandName(clientDescription)} - ${languageName}`;

    // Update metadata with brief (and fallback title if needed)
    await setAdMetadata(adId, {
      name: adTitle,
      brief, // Persist brief for page reload!
      createdAt: currentMeta?.createdAt || Date.now(),
      lastModified: Date.now(),
      owner: currentMeta?.owner || effectiveSessionId,
    });
    console.log(`[/api/ai/generate] Updated ad - title: "${adTitle}" (LLM-generated: ${llmSetTitle})`);

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
