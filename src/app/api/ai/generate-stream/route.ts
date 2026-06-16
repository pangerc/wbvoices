/**
 * AI Creative Generation Endpoint with SSE Streaming
 *
 * Auto-generation flow:
 * 1. Run LLM agent loop to create drafts (voices, music, sfx)
 * 2. Stream events as each draft is created
 * 3. Auto-generate audio for each draft
 * 4. Stream progress events as audio completes
 *
 * This avoids Vercel timeout (300s) by streaming responses.
 * Redis remains source of truth - events are notifications, not state.
 */

import {
  prefetchBriefEnrichments,
  renderEnrichmentSections,
} from "@/lib/brief-enrichment";
import { buildSystemPrompt, type KnowledgeContext } from "@/lib/knowledge";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import {
  releaseGenerationLock,
  tryAcquireGenerationLock,
} from "@/lib/redis/adLock";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import {
  getAdMetadata,
  getVersion,
  setActiveVersion,
  setAdMetadata,
} from "@/lib/redis/versions";
import { runAgentLoop } from "@/lib/tool-calling";
import { instructionTemplatesService } from "@/services/instructionTemplatesService";
import type { ProjectBrief } from "@/types";
import type { MusicVersion, SfxVersion, VoiceVersion } from "@/types/versions";
import { internalFetch } from "@/utils/internal-fetch";
import { getLanguageName } from "@/utils/language";
import { NextRequest, NextResponse } from "next/server";

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

// Required for streaming
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

// Event types for SSE stream
type StreamEvent =
  | { type: "llm-thinking" } // LLM agent loop starting
  | { type: "status"; message: string }
  // Stage-5 streaming events: per-token model output + per-tool-call markers
  // for perceived-latency. The user sees the model thinking out loud and
  // composing tool arguments instead of staring at a "Thinking…" spinner.
  | { type: "model-text-delta"; text: string }
  | { type: "model-tool-call-start"; name: string; callId: string }
  | { type: "model-tool-call-args-delta"; callId: string; delta: string }
  | {
      type: "drafts-created";
      drafts: { voices?: string; music?: string; sfx?: string };
      adName: string;
    }
  | {
      type: "voice-generating";
      index: number;
      total: number;
      versionId: string;
    }
  | { type: "voice-ready"; index: number; url: string }
  | { type: "voice-failed"; index: number; error: string }
  | { type: "music-generating" }
  | { type: "music-ready"; url: string }
  | { type: "music-failed"; error: string }
  | { type: "sfx-generating"; index: number; total: number }
  | { type: "sfx-ready"; index: number; url: string }
  | { type: "sfx-failed"; index: number; error: string }
  | { type: "complete"; success: boolean }
  | { type: "error"; message: string };

/**
 * Build the user message from the brief data.
 * Mirrors the helper in /api/ai/generate/route.ts — kept in sync so
 * streaming and non-streaming paths see identical user messages.
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
  voiceInstructions?: string;
  adId: string;
  voiceProvider: string;
  referenceUrls?: string[];
  forbiddenWords?: string;
  providedScript?: string;
  creativeAngle?: string;
  /** Pre-rendered SF + URL + brand-voice sections from
   *  brief-enrichment.renderEnrichmentSections. Empty string when no
   *  enrichments were configured or all of them dropped. */
  enrichmentSections?: string;
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
    voiceInstructions,
    adId,
    voiceProvider,
    referenceUrls,
    forbiddenWords,
    providedScript,
    creativeAngle,
    enrichmentSections,
  } = params;

  let dialectNote = "";
  if (accent && accent !== "neutral") {
    dialectNote = `\n- Dialect/Accent: ${accent}`;
    if (region) dialectNote += ` (${region})`;
  } else if (region) {
    dialectNote = `\n- Region: ${region} (use local expressions)`;
  }

  const pacingNote =
    pacing && pacing !== "normal" ? `\n- Pacing: ${pacing}` : "";
  const ctaNote = cta ? `\n- Call to Action: ${cta}` : "";
  const voiceInstructionsNote =
    voiceInstructions && voiceInstructions.trim()
      ? `\n- Voice delivery instructions: ${voiceInstructions.trim()}`
      : "";
  const referenceSection =
    referenceUrls && referenceUrls.length
      ? `\n\n## Reference URLs\n${referenceUrls.map((u) => `- ${u}`).join("\n")}`
      : "";
  const forbiddenSection =
    forbiddenWords && forbiddenWords.trim()
      ? `\n\n## Forbidden words / phrases (do NOT use)\n${forbiddenWords.trim()}`
      : "";
  const providedScriptSection =
    providedScript && providedScript.trim()
      ? `\n\n## Provided Script (USE VERBATIM)\nThe user has supplied the script text below. Use it exactly as written; only write acting instructions, music, and SFX around it. Do not edit, translate, or paraphrase.\n\n\`\`\`\n${providedScript.trim()}\n\`\`\``
      : "";

  const creativeAngleSection =
    creativeAngle && creativeAngle.trim()
      ? `\n\n## Creative angle (THIS spot only)\n${creativeAngle.trim()}\nThis is the variance — what makes THIS ad different from every other ad for this brand. Brand voice is the constant; treat the angle as load-bearing.`
      : "";

  const totalWords = Math.round(duration * 2.5);
  const wordsPerSpeaker =
    campaignFormat === "dialog" ? Math.round(totalWords / 2) : totalWords;

  return `Create a ${duration}-second ${campaignFormat} audio ad.

## Brief Details
- Ad ID: ${adId}
- Language: ${languageName}
- Voice Provider: ${voiceProvider} (REQUIRED - only search for voices from this provider)
- Client: ${clientDescription}
- Creative Direction: ${creativeBrief}${dialectNote}${pacingNote}${ctaNote}${voiceInstructionsNote}${referenceSection}${forbiddenSection}${providedScriptSection}${creativeAngleSection}${enrichmentSections || ""}

## DURATION CONSTRAINT (CRITICAL)
- STRICT LIMIT: Script MUST fit within ${duration} seconds when read at natural pace
- Target word count: ~${totalWords} words total
${campaignFormat === "dialog" ? `- For dialogue: ~${wordsPerSpeaker} words per speaker (2-4 exchanges max)` : ""}
- Leave 2-3 seconds for pauses and transitions
- SHORTER IS BETTER - err on the side of brevity

Please search for suitable voices in ${languageName} from ${voiceProvider}, then create the voice tracks, music, and sound effects.`;
}

/**
 * Voice endpoint mapping
 */
const VOICE_ENDPOINTS: Record<string, string> = {
  elevenlabs: "/api/voice/elevenlabs-v2",
  openai: "/api/voice/openai-v2",
  lovo: "/api/voice/lovo-v2",
  qwen: "/api/voice/qwen-v2",
  bytedance: "/api/voice/bytedance-v2",
  lahajati: "/api/voice/lahajati-v2",
};

export async function POST(req: NextRequest) {
  const cookie = req.headers.get("cookie");
  const body = await req.json();
  const {
    adId,
    language,
    clientDescription,
    creativeBrief,
    campaignFormat,
    duration = 60,
    region,
    accent,
    cta,
    pacing,
    tone: rawTone,
    voiceInstructions: rawVoiceInstructions,
    selectedTemplateId: rawSelectedTemplateId,
    selectedProvider: rawSelectedProvider,
    autoGenerateAudio = true,
    // Stage-3 brief expansion fields (all optional)
    referenceUrls,
    forbiddenWords,
    providedScript,
    // Stage C — alaric/SFDC integration (all optional)
    salesforceAccountId,
    creativeAngle,
    // v2 Stage H — unified brand reference. brand.salesforceAccountId
    // wins over the top-level field when both are set.
    brand,
  } = body;

  // Same precedence rule as /api/ai/generate. Keep the two routes in lockstep.
  const effectiveSfAccountId: string | null =
    (brand &&
    typeof brand === "object" &&
    typeof (brand as Record<string, unknown>).salesforceAccountId === "string"
      ? (brand as { salesforceAccountId: string }).salesforceAccountId
      : null) ||
    (typeof salesforceAccountId === "string" ? salesforceAccountId : null);

  // selectedTone is the preset id (UI state — the user picked "Professional");
  // voiceInstructions is the resolved TTS-delivery prose seeded from the
  // preset's template and editable. The LLM only sees voiceInstructions; the
  // preset id is persisted to the brief but never injected into the prompt.
  const tonePreset: string | null = rawTone || null;
  const voiceInstructionsText: string | null =
    typeof rawVoiceInstructions === "string" && rawVoiceInstructions.trim()
      ? rawVoiceInstructions.trim()
      : null;
  const selectedTemplateId: string | null =
    typeof rawSelectedTemplateId === "string" && rawSelectedTemplateId.trim()
      ? rawSelectedTemplateId.trim()
      : null;

  // Validate required fields
  if (!adId) {
    return NextResponse.json({ error: "adId is required" }, { status: 400 });
  }

  // `clientDescription` is optional — it derives from `brand?.name` in the
  // brief panel and stays empty for ads where the user just types a creative
  // brief without picking a brand. The LLM has `creativeBrief` for context,
  // so requiring both would block the simplest happy path.
  const missing: string[] = [];
  if (!language) missing.push("language");
  if (!creativeBrief) missing.push("creativeBrief");
  if (!campaignFormat) missing.push("campaignFormat");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const generationLockToken = await tryAcquireGenerationLock(adId);
  if (generationLockToken === null) {
    return NextResponse.json(
      {
        error:
          "A generation is already in progress for this ad. Wait for it to finish.",
        code: "GENERATION_IN_PROGRESS",
      },
      { status: 409 },
    );
  }

  const voiceProvider = rawSelectedProvider || "elevenlabs";

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to send SSE event
  const sendEvent = async (event: StreamEvent) => {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    await writer.write(encoder.encode(payload));
  };

  // Run generation in background, streaming events
  (async () => {
    try {
      console.log(`[generate-stream] Starting for ad ${adId}`);

      // Phase 1: LLM creates drafts
      await sendEvent({ type: "llm-thinking" }); // Signal LLM is starting
      await sendEvent({ type: "status", message: "Creating creative..." });

      const languageName = getLanguageName(language);

      // Inactive templates are honoured here even if hidden from the picker —
      // the user already committed when the brief was saved. defaultMusicStyle
      // folds into the instructions because there's no music UI field.
      let creativeTemplateTitle: string | undefined;
      let creativeTemplateInstructions: string | undefined;
      if (selectedTemplateId) {
        try {
          const template =
            await instructionTemplatesService.getById(selectedTemplateId);
          if (template) {
            creativeTemplateTitle = template.title;
            const musicStyle = template.defaultMusicStyle?.trim();
            creativeTemplateInstructions = musicStyle
              ? `${template.systemInstructions}\nMusic style: ${musicStyle}`
              : template.systemInstructions;
          } else {
            console.warn(
              `[generate-stream] selectedTemplateId ${selectedTemplateId} not found — proceeding without template`,
            );
          }
        } catch (err) {
          console.warn(
            `[generate-stream] template fetch failed for ${selectedTemplateId} — proceeding without template:`,
            err,
          );
        }
      }

      const knowledgeContext: KnowledgeContext = {
        pacing: pacing === "fast" ? "fast" : "normal",
        accent: accent || undefined,
        region: region || undefined,
        language: language,
        voiceProvider: voiceProvider,
        campaignFormat: campaignFormat as KnowledgeContext["campaignFormat"],
        hasProvidedScript: !!(
          providedScript &&
          typeof providedScript === "string" &&
          providedScript.trim()
        ),
        creativeTemplateTitle,
        creativeTemplateInstructions,
      };

      // Pre-fetch enrichments before building the user message — same
      // pattern as the non-streaming /api/ai/generate route.
      const enrichments = await prefetchBriefEnrichments({
        adId,
        salesforceAccountId: effectiveSfAccountId,
        referenceUrls: Array.isArray(referenceUrls) ? referenceUrls : undefined,
      });
      const enrichmentSections = renderEnrichmentSections(enrichments);

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
        voiceInstructions: voiceInstructionsText || undefined,
        adId,
        voiceProvider,
        referenceUrls,
        forbiddenWords,
        providedScript,
        creativeAngle:
          typeof creativeAngle === "string" ? creativeAngle : undefined,
        enrichmentSections,
      });

      const systemPrompt = buildSystemPrompt(userMessage, knowledgeContext);

      // Forward model stream events as SSE so the UI can render tokens as
      // they arrive. Errors in the SSE write are swallowed — the agent
      // loop must keep going even if the client disconnected.
      const forwardModelEvent = (
        event: { type: string } & Record<string, unknown>,
      ) => {
        try {
          if (event.type === "text_delta") {
            void sendEvent({
              type: "model-text-delta",
              text: event.text as string,
            });
          } else if (event.type === "tool_call_start") {
            void sendEvent({
              type: "model-tool-call-start",
              name: event.name as string,
              callId: event.callId as string,
            });
          } else if (event.type === "tool_call_args_delta") {
            void sendEvent({
              type: "model-tool-call-args-delta",
              callId: event.callId as string,
              delta: event.delta as string,
            });
          }
        } catch {
          // SSE write failures are non-fatal during streaming.
        }
      };

      const result = await runAgentLoop(systemPrompt, userMessage, {
        adId,
        reasoningEffort: "medium",
        maxIterations: 5,
        knowledgeContext,
        onModelEvent: forwardModelEvent,
      });

      console.log(`[generate-stream] Agent completed, drafts:`, result.drafts);

      // Build brief and ensure ad exists
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
        selectedTone: tonePreset,
        voiceInstructions: voiceInstructionsText,
        selectedTemplateId,
        selectedProvider: voiceProvider as "elevenlabs" | "openai" | "lovo",
        ...(Array.isArray(referenceUrls) && referenceUrls.length
          ? { referenceUrls }
          : {}),
        ...(forbiddenWords &&
        typeof forbiddenWords === "string" &&
        forbiddenWords.trim()
          ? { forbiddenWords: forbiddenWords.trim() }
          : {}),
        ...(providedScript &&
        typeof providedScript === "string" &&
        providedScript.trim()
          ? { providedScript: providedScript.trim() }
          : {}),
        ...(effectiveSfAccountId
          ? { salesforceAccountId: effectiveSfAccountId }
          : {}),
        ...(typeof creativeAngle === "string" && creativeAngle.trim()
          ? { creativeAngle: creativeAngle.trim() }
          : {}),
        ...(brand && typeof brand === "object"
          ? { brand: brand as ProjectBrief["brand"] }
          : {}),
      };

      const { requireAuth } = await import("@/lib/auth-helpers");
      const { email: ownerEmail } = await requireAuth();
      await ensureAdExists(adId, ownerEmail, brief);

      // Get ad title (LLM may have set it via set_ad_title tool)
      const currentMeta = await getAdMetadata(adId);
      const llmSetTitle =
        currentMeta?.name && currentMeta.name !== "Untitled Ad";
      const adTitle = llmSetTitle
        ? currentMeta.name
        : `${extractBrandName(clientDescription)} - ${languageName}`;

      // Update metadata
      await setAdMetadata(adId, {
        name: adTitle,
        brief,
        createdAt: currentMeta?.createdAt || Date.now(),
        lastModified: Date.now(),
        owner: currentMeta?.owner || ownerEmail,
      });

      // Notify client that drafts are ready
      await sendEvent({
        type: "drafts-created",
        drafts: result.drafts,
        adName: adTitle,
      });

      if (!autoGenerateAudio) {
        await sendEvent({ type: "complete", success: true });
        await writer.close();
        return;
      }

      // ============ PARALLEL AUDIO GENERATION ============
      // All streams generate concurrently - voices, music, and SFX start together
      // Individual tracks within each stream also run in parallel

      const generationPromises: Promise<void>[] = [];

      // Voice tracks - ALL in parallel
      if (result.drafts.voices) {
        const voiceVersion = (await getVersion(
          adId,
          "voices",
          result.drafts.voices,
        )) as VoiceVersion | null;

        if (voiceVersion?.voiceTracks?.length) {
          const tracks = [...voiceVersion.voiceTracks]; // Copy for safe mutation
          const versionId = result.drafts.voices;

          // Create array to track generated URLs for final persist
          const generatedResults: Array<{
            index: number;
            url: string;
            duration: number;
          } | null> = new Array(tracks.length).fill(null);

          const voicePromises = tracks.map(async (track, i) => {
            if (!track.voice?.id || !track.text?.trim()) return;

            const provider =
              track.voice?.provider || track.trackProvider || voiceProvider;
            const endpoint =
              VOICE_ENDPOINTS[provider] || VOICE_ENDPOINTS.elevenlabs;

            await sendEvent({
              type: "voice-generating",
              index: i,
              total: tracks.length,
              versionId,
            });

            try {
              const voiceRes = await internalFetch(
                endpoint,
                {
                  method: "POST",
                  body: JSON.stringify({
                    text: track.text,
                    voiceId: track.voice.id,
                    style: track.style,
                    useCase: track.useCase,
                    voiceInstructions: track.voiceInstructions,
                    speed: track.speed,
                  }),
                },
                cookie,
              );

              if (!voiceRes.ok) {
                const errData = await voiceRes.json().catch(() => ({}));
                throw new Error(
                  errData.error ||
                    `Voice generation failed: ${voiceRes.status}`,
                );
              }

              const voiceData = await voiceRes.json();
              const audioUrl = voiceData.audio_url;

              if (!audioUrl) {
                throw new Error("No audio URL returned");
              }

              generatedResults[i] = {
                index: i,
                url: audioUrl,
                duration: voiceData.duration || 0,
              };
              await sendEvent({ type: "voice-ready", index: i, url: audioUrl });
            } catch (error) {
              console.error(
                `[generate-stream] Voice track ${i} failed:`,
                error,
              );
              await sendEvent({
                type: "voice-failed",
                index: i,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          });

          // Wait for all voice tracks and persist at the end
          generationPromises.push(
            Promise.all(voicePromises).then(async () => {
              // Build updated tracks array with all results
              const updatedTracks = tracks.map((t, idx) => {
                const result = generatedResults[idx];
                if (result) {
                  return {
                    ...t,
                    generatedUrl: result.url,
                    generatedDuration: result.duration,
                  };
                }
                return t;
              });

              // Single PATCH to persist all voice URLs
              await internalFetch(
                `/api/ads/${adId}/voices/${versionId}`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ voiceTracks: updatedTracks }),
                },
                cookie,
              );
            }),
          );
        }
      }

      // Music - starts immediately (parallel with voices)
      if (result.drafts.music) {
        const musicVersionId = result.drafts.music; // Capture for closure
        generationPromises.push(
          (async () => {
            const musicVersion = (await getVersion(
              adId,
              "music",
              musicVersionId,
            )) as MusicVersion | null;
            if (!musicVersion) return;

            await sendEvent({ type: "music-generating" });

            try {
              const musicProvider = musicVersion.provider || "loudly";
              const musicDuration = musicVersion.duration || duration + 15;
              const adjustedDuration =
                musicProvider === "loudly"
                  ? Math.ceil(musicDuration / 15) * 15
                  : musicDuration;

              const musicRes = await internalFetch(
                `/api/music/${musicProvider}`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    prompt:
                      musicVersion.musicPrompts?.[musicProvider] ||
                      musicVersion.musicPrompt,
                    duration: adjustedDuration,
                    projectId: adId,
                  }),
                },
                cookie,
              );

              if (!musicRes.ok) {
                const errData = await musicRes.json().catch(() => ({}));
                throw new Error(
                  errData.error ||
                    `Music generation failed: ${musicRes.status}`,
                );
              }

              const musicData = await musicRes.json();
              let generatedUrl = musicData.url;

              // Handle Mubert polling if needed
              if (
                musicProvider === "mubert" &&
                musicData.status === "processing" &&
                musicData.id
              ) {
                console.log(
                  `[generate-stream] Mubert polling for track ${musicData.id}...`,
                );
                const maxAttempts = 60;
                const interval = 5000;

                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  await new Promise((r) => setTimeout(r, interval));

                  const statusRes = await internalFetch(
                    `/api/music/mubert/status?id=${musicData.id}&customer_id=${musicData.customer_id}&access_token=${musicData.access_token}`,
                    {},
                    cookie,
                  );

                  if (!statusRes.ok) continue;

                  const statusData = await statusRes.json();
                  const generation = statusData.data?.generations?.[0];

                  if (generation?.status === "done" && generation.url) {
                    const finalRes = await internalFetch(
                      `/api/music/mubert`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          prompt: musicVersion.musicPrompt,
                          duration: adjustedDuration,
                          projectId: adId,
                          _internal_ready_url: generation.url,
                          _internal_track_id: musicData.id,
                        }),
                      },
                      cookie,
                    );

                    if (finalRes.ok) {
                      const finalData = await finalRes.json();
                      generatedUrl = finalData.url;
                    } else {
                      generatedUrl = generation.url;
                    }
                    break;
                  }
                }
              }

              if (!generatedUrl) {
                throw new Error("No URL returned from music provider");
              }

              // Persist to Redis
              await internalFetch(
                `/api/ads/${adId}/music/${musicVersionId}`,
                {
                  method: "PATCH",
                  body: JSON.stringify({
                    generatedUrl,
                    duration: adjustedDuration,
                  }),
                },
                cookie,
              );

              await sendEvent({ type: "music-ready", url: generatedUrl });
            } catch (error) {
              console.error(`[generate-stream] Music failed:`, error);
              await sendEvent({
                type: "music-failed",
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          })(),
        );
      }

      // SFX - ALL in parallel, starts immediately (parallel with voices and music)
      if (result.drafts.sfx) {
        const sfxVersion = (await getVersion(
          adId,
          "sfx",
          result.drafts.sfx,
        )) as SfxVersion | null;

        if (sfxVersion?.soundFxPrompts?.length) {
          const prompts = sfxVersion.soundFxPrompts;
          const versionId = result.drafts.sfx;
          const generatedUrls: (string | null)[] = new Array(
            prompts.length,
          ).fill(null);

          const sfxPromises = prompts.map(async (prompt, i) => {
            await sendEvent({
              type: "sfx-generating",
              index: i,
              total: prompts.length,
            });

            try {
              const sfxRes = await internalFetch(
                `/api/sfx/elevenlabs-v2`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    text: prompt.description,
                    duration: prompt.duration || 3,
                    projectId: adId,
                  }),
                },
                cookie,
              );

              if (!sfxRes.ok) {
                const errData = await sfxRes.json().catch(() => ({}));
                throw new Error(
                  errData.error || `SFX generation failed: ${sfxRes.status}`,
                );
              }

              const sfxData = await sfxRes.json();

              if (!sfxData.audio_url) {
                throw new Error("No audio URL returned");
              }

              generatedUrls[i] = sfxData.audio_url;
              await sendEvent({
                type: "sfx-ready",
                index: i,
                url: sfxData.audio_url,
              });
            } catch (error) {
              console.error(`[generate-stream] SFX ${i} failed:`, error);
              await sendEvent({
                type: "sfx-failed",
                index: i,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          });

          // Wait for all SFX and persist at the end
          generationPromises.push(
            Promise.all(sfxPromises).then(async () => {
              // Single PATCH to persist all SFX URLs
              const validUrls = generatedUrls.filter(
                (url): url is string => url !== null,
              );
              if (validUrls.length > 0) {
                await internalFetch(
                  `/api/ads/${adId}/sfx/${versionId}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ generatedUrls: generatedUrls }),
                  },
                  cookie,
                );
              }
            }),
          );
        }
      }

      // Wait for ALL generation to complete
      await Promise.all(generationPromises);
      console.log(
        `[generate-stream] All audio generation complete for ad ${adId}`,
      );

      // ============ AUTO-ACTIVATE AND REBUILD MIXER ============
      // Set active versions so mixer can see the drafts
      if (result.drafts.voices) {
        await setActiveVersion(adId, "voices", result.drafts.voices);
      }
      if (result.drafts.music) {
        await setActiveVersion(adId, "music", result.drafts.music);
      }
      if (result.drafts.sfx) {
        await setActiveVersion(adId, "sfx", result.drafts.sfx);
      }

      // Rebuild mixer from active versions
      const mixer = await rebuildMixer(adId);
      console.log(
        `[generate-stream] Mixer rebuilt with ${mixer.tracks.length} tracks`,
      );

      await sendEvent({ type: "complete", success: true });
    } catch (error) {
      console.error("[generate-stream] Fatal error:", error);
      await sendEvent({
        type: "error",
        message: error instanceof Error ? error.message : "Generation failed",
      });
    } finally {
      // Release the generation lock before closing the stream so another
      // POST can start immediately if this one failed early.
      await releaseGenerationLock(adId, generationLockToken);
      try {
        await writer.close();
      } catch {
        // Stream may already be closed
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
