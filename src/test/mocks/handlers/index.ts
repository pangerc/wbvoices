/**
 * MSW request handlers
 * Mock external API responses
 */

import { http, HttpResponse } from "msw";

/**
 * OpenAI API Handlers
 */
export const openAIHandlers = [
  // Mock chat completions endpoint
  http.post("https://api.openai.com/v1/chat/completions", () => {
    return HttpResponse.json({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: Date.now(),
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              script: "Test ad script",
              voiceTracks: [],
              musicPrompt: "Upbeat electronic music",
              soundFxPrompts: [],
            }),
          },
          finish_reason: "stop",
        },
      ],
    });
  }),
];

/**
 * ElevenLabs API Handlers
 */
export const elevenLabsHandlers = [
  // Mock text-to-speech endpoint
  http.post("https://api.elevenlabs.io/v1/text-to-speech/:voiceId", () => {
    // Return mock audio blob
    return HttpResponse.arrayBuffer(new ArrayBuffer(1024), {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  }),

  // Mock voices list endpoint
  http.get("https://api.elevenlabs.io/v1/voices", () => {
    return HttpResponse.json({
      voices: [
        {
          voice_id: "21m00Tcm4TlvDq8ikWAM",
          name: "Rachel",
          category: "premade",
        },
      ],
    });
  }),
];

/**
 * Lovo AI API Handlers
 */
export const lovoHandlers = [
  // Mock TTS endpoint
  http.post("https://api.genny.lovo.ai/api/v1/speakers/:speakerId/convert", () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: "test-job-id",
        status: "processing",
      },
    });
  }),

  // Mock job status check
  http.get("https://api.genny.lovo.ai/api/v1/jobs/:jobId", () => {
    return HttpResponse.json({
      success: true,
      data: {
        status: "completed",
        urls: ["https://example.com/audio.mp3"],
      },
    });
  }),
];

/**
 * Loudly API Handlers
 */
export const loudlyHandlers = [
  // Mock music generation endpoint
  http.post("https://api.loudly.com/api/v1/generate", () => {
    return HttpResponse.json({
      id: "test-loudly-job",
      status: "processing",
    });
  }),

  // Mock status check
  http.get("https://api.loudly.com/api/v1/status/:jobId", () => {
    return HttpResponse.json({
      status: "completed",
      audioUrl: "https://example.com/music.mp3",
    });
  }),
];

/**
 * Mubert API Handlers
 */
export const mubertHandlers = [
  // Mock music generation endpoint
  http.post("https://api.mubert.com/v2/RecTrackTT", () => {
    return HttpResponse.json({
      data: {
        tasks: [
          {
            status: "done",
            download_link: "https://example.com/mubert-track.mp3",
          },
        ],
      },
    });
  }),
];

/**
 * Vercel Blob Handlers
 */
export const blobHandlers = [
  // Mock blob upload
  http.put("https://blob.vercel-storage.com/*", () => {
    return HttpResponse.json({
      url: "https://blob.vercel-storage.com/test-file.mp3",
      downloadUrl: "https://blob.vercel-storage.com/test-file.mp3",
    });
  }),
];

// Export all handlers
export const handlers = [
  ...openAIHandlers,
  ...elevenLabsHandlers,
  ...lovoHandlers,
  ...loudlyHandlers,
  ...mubertHandlers,
  ...blobHandlers,
];
