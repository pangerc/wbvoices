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

import { NextRequest } from "next/server";
import { runAgentLoop } from "@/lib/tool-calling";
import { getLanguageName } from "@/utils/language";
import { setAdMetadata, getAdMetadata, getVersion, setActiveVersion } from "@/lib/redis/versions";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import { buildSystemPrompt, type KnowledgeContext } from "@/lib/knowledge";
import { rebuildMixer } from "@/lib/mixer/rebuilder";
import type { ProjectBrief } from "@/types";
import type { VoiceVersion, MusicVersion, SfxVersion } from "@/types/versions";

// Required for streaming
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes

// Event types for SSE stream
type StreamEvent =
  | { type: "llm-thinking" } // LLM agent loop starting
  | { type: "status"; message: string }
  | { type: "drafts-created"; drafts: { voices?: string; music?: string; sfx?: string }; adName: string }
  | { type: "voice-generating"; index: number; total: number; versionId: string }
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

/**
 * Get base URL for internal API calls
 */
function getBaseUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:${process.env.PORT || 3003}`;
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
    autoGenerateAudio = true,
  } = body;

  // Validate required fields
  if (!adId) {
    return new Response(JSON.stringify({ error: "adId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!language || !clientDescription || !creativeBrief || !campaignFormat) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: language, clientDescription, creativeBrief, campaignFormat" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const voiceProvider = rawSelectedProvider || "elevenlabs";
  const baseUrl = getBaseUrl();

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
      const knowledgeContext: KnowledgeContext = {
        pacing: pacing === "fast" ? "fast" : "normal",
        accent: accent || undefined,
        region: region || undefined,
        language: language,
        voiceProvider: voiceProvider,
        campaignFormat: campaignFormat as "dialog" | "ad_read",
      };

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

      const systemPrompt = buildSystemPrompt(userMessage, knowledgeContext);

      const result = await runAgentLoop(systemPrompt, userMessage, {
        adId,
        reasoningEffort: "medium",
        maxIterations: 5,
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
        selectedProvider: voiceProvider as "elevenlabs" | "openai" | "lovo",
      };

      const effectiveSessionId = sessionId || "default-session";
      await ensureAdExists(adId, effectiveSessionId, brief);

      // Get ad title (LLM may have set it via set_ad_title tool)
      const currentMeta = await getAdMetadata(adId);
      const llmSetTitle = currentMeta?.name && currentMeta.name !== "Untitled Ad";
      const adTitle = llmSetTitle
        ? currentMeta.name
        : `${clientDescription.slice(0, 30)}${clientDescription.length > 30 ? "..." : ""} - ${languageName}`;

      // Update metadata
      await setAdMetadata(adId, {
        name: adTitle,
        brief,
        createdAt: currentMeta?.createdAt || Date.now(),
        lastModified: Date.now(),
        owner: currentMeta?.owner || effectiveSessionId,
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
        const voiceVersion = (await getVersion(adId, "voices", result.drafts.voices)) as VoiceVersion | null;

        if (voiceVersion?.voiceTracks?.length) {
          const tracks = [...voiceVersion.voiceTracks]; // Copy for safe mutation
          const versionId = result.drafts.voices;

          // Create array to track generated URLs for final persist
          const generatedResults: Array<{ index: number; url: string; duration: number } | null> =
            new Array(tracks.length).fill(null);

          const voicePromises = tracks.map(async (track, i) => {
            if (!track.voice?.id || !track.text?.trim()) return;

            const provider = track.voice?.provider || track.trackProvider || voiceProvider;
            const endpoint = VOICE_ENDPOINTS[provider] || VOICE_ENDPOINTS.elevenlabs;

            await sendEvent({ type: "voice-generating", index: i, total: tracks.length, versionId });

            try {
              const voiceRes = await fetch(`${baseUrl}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: track.text,
                  voiceId: track.voice.id,
                  style: track.style,
                  useCase: track.useCase,
                  voiceInstructions: track.voiceInstructions,
                  speed: track.speed,
                }),
              });

              if (!voiceRes.ok) {
                const errData = await voiceRes.json().catch(() => ({}));
                throw new Error(errData.error || `Voice generation failed: ${voiceRes.status}`);
              }

              const voiceData = await voiceRes.json();
              const audioUrl = voiceData.audio_url;

              if (!audioUrl) {
                throw new Error("No audio URL returned");
              }

              generatedResults[i] = { index: i, url: audioUrl, duration: voiceData.duration || 0 };
              await sendEvent({ type: "voice-ready", index: i, url: audioUrl });
            } catch (error) {
              console.error(`[generate-stream] Voice track ${i} failed:`, error);
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
                  return { ...t, generatedUrl: result.url, generatedDuration: result.duration };
                }
                return t;
              });

              // Single PATCH to persist all voice URLs
              await fetch(`${baseUrl}/api/ads/${adId}/voices/${versionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceTracks: updatedTracks }),
              });
            })
          );
        }
      }

      // Music - starts immediately (parallel with voices)
      if (result.drafts.music) {
        const musicVersionId = result.drafts.music; // Capture for closure
        generationPromises.push((async () => {
          const musicVersion = (await getVersion(adId, "music", musicVersionId)) as MusicVersion | null;
          if (!musicVersion) return;

          await sendEvent({ type: "music-generating" });

          try {
            const musicProvider = musicVersion.provider || "loudly";
            const musicDuration = musicVersion.duration || duration + 5;
            const adjustedDuration =
              musicProvider === "loudly" ? Math.ceil(musicDuration / 15) * 15 : musicDuration;

            const musicRes = await fetch(`${baseUrl}/api/music/${musicProvider}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: musicVersion.musicPrompts?.[musicProvider] || musicVersion.musicPrompt,
                duration: adjustedDuration,
                projectId: adId,
              }),
            });

            if (!musicRes.ok) {
              const errData = await musicRes.json().catch(() => ({}));
              throw new Error(errData.error || `Music generation failed: ${musicRes.status}`);
            }

            const musicData = await musicRes.json();
            let generatedUrl = musicData.url;

            // Handle Mubert polling if needed
            if (musicProvider === "mubert" && musicData.status === "processing" && musicData.id) {
              console.log(`[generate-stream] Mubert polling for track ${musicData.id}...`);
              const maxAttempts = 60;
              const interval = 5000;

              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise((r) => setTimeout(r, interval));

                const statusRes = await fetch(
                  `${baseUrl}/api/music/mubert/status?id=${musicData.id}&customer_id=${musicData.customer_id}&access_token=${musicData.access_token}`
                );

                if (!statusRes.ok) continue;

                const statusData = await statusRes.json();
                const generation = statusData.data?.generations?.[0];

                if (generation?.status === "done" && generation.url) {
                  const finalRes = await fetch(`${baseUrl}/api/music/mubert`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: musicVersion.musicPrompt,
                      duration: adjustedDuration,
                      projectId: adId,
                      _internal_ready_url: generation.url,
                      _internal_track_id: musicData.id,
                    }),
                  });

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
            await fetch(`${baseUrl}/api/ads/${adId}/music/${musicVersionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                generatedUrl,
                duration: adjustedDuration,
              }),
            });

            await sendEvent({ type: "music-ready", url: generatedUrl });
          } catch (error) {
            console.error(`[generate-stream] Music failed:`, error);
            await sendEvent({
              type: "music-failed",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        })());
      }

      // SFX - ALL in parallel, starts immediately (parallel with voices and music)
      if (result.drafts.sfx) {
        const sfxVersion = (await getVersion(adId, "sfx", result.drafts.sfx)) as SfxVersion | null;

        if (sfxVersion?.soundFxPrompts?.length) {
          const prompts = sfxVersion.soundFxPrompts;
          const versionId = result.drafts.sfx;
          const generatedUrls: (string | null)[] = new Array(prompts.length).fill(null);

          const sfxPromises = prompts.map(async (prompt, i) => {
            await sendEvent({ type: "sfx-generating", index: i, total: prompts.length });

            try {
              const sfxRes = await fetch(`${baseUrl}/api/sfx/elevenlabs-v2`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: prompt.description,
                  duration: prompt.duration || 3,
                  projectId: adId,
                }),
              });

              if (!sfxRes.ok) {
                const errData = await sfxRes.json().catch(() => ({}));
                throw new Error(errData.error || `SFX generation failed: ${sfxRes.status}`);
              }

              const sfxData = await sfxRes.json();

              if (!sfxData.audio_url) {
                throw new Error("No audio URL returned");
              }

              generatedUrls[i] = sfxData.audio_url;
              await sendEvent({ type: "sfx-ready", index: i, url: sfxData.audio_url });
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
              const validUrls = generatedUrls.filter((url): url is string => url !== null);
              if (validUrls.length > 0) {
                await fetch(`${baseUrl}/api/ads/${adId}/sfx/${versionId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ generatedUrls: generatedUrls }),
                });
              }
            })
          );
        }
      }

      // Wait for ALL generation to complete
      await Promise.all(generationPromises);
      console.log(`[generate-stream] All audio generation complete for ad ${adId}`);

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
      console.log(`[generate-stream] Mixer rebuilt with ${mixer.tracks.length} tracks`);

      await sendEvent({ type: "complete", success: true });
    } catch (error) {
      console.error("[generate-stream] Fatal error:", error);
      await sendEvent({
        type: "error",
        message: error instanceof Error ? error.message : "Generation failed",
      });
    } finally {
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
