import { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_voices",
      description:
        "Search voice database by provider, language, gender, and accent. Returns voices with personality descriptions - pick the ones that best fit the creative direction.",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["elevenlabs", "openai", "lovo", "qwen", "bytedance"],
            description: "Voice provider to search (REQUIRED - use the provider specified in the brief)",
          },
          language: {
            type: "string",
            description: "ISO 639-1 language code (e.g., 'fr', 'de', 'es', 'th', 'id', 'pl', 'en')",
          },
          gender: {
            type: "string",
            enum: ["male", "female"],
            description: "Voice gender filter (optional)",
          },
          accent: {
            type: "string",
            description: "Accent filter (optional) - only use if user explicitly specified an accent",
          },
          count: {
            type: "number",
            description: "Number of voices to return (default: 10)",
            default: 10,
          },
        } as Record<string, unknown>,
        required: ["provider", "language"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_voice_draft",
      description:
        "Create a new voice track version draft in Redis. This writes directly to the version stream.",
      parameters: {
        type: "object",
        properties: {
          adId: {
            type: "string",
            description: "The ad ID to create draft for",
          },
          tracks: {
            type: "array",
            description: "Array of voice tracks with text and timing",
            items: {
              type: "object",
              properties: {
                voiceId: {
                  type: "string",
                  description: "Voice ID from search_voices",
                },
                text: {
                  type: "string",
                  description:
                    "Script text. For ElevenLabs: include [emotional tags] inline. For OpenAI: plain text.",
                },
                playAfter: {
                  type: "string",
                  description:
                    "What this plays after (e.g., 'start', 'track-0')",
                },
                overlap: {
                  type: "number",
                  description: "Overlap in seconds (can be negative for gap)",
                },
                description: {
                  type: "string",
                  description:
                    "ElevenLabs baseline tone (REQUIRED for ElevenLabs voices): cheerful, excited, calm, professional, energetic, warm, serious, etc.",
                },
                voiceInstructions: {
                  type: "string",
                  description:
                    "OpenAI voice guidance (REQUIRED for OpenAI voices): 'Voice Affect: ...; Tone: ...; Pacing: ...; Emotion: ...; Emphasis: ...; Pronunciation: ...; Pauses: ...'",
                },
              },
              required: ["voiceId", "text"],
            },
          },
        } as Record<string, unknown>,
        required: ["adId", "tracks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_music_draft",
      description: "Create a new music track version draft in Redis.",
      parameters: {
        type: "object",
        properties: {
          adId: { type: "string", description: "The ad ID" },
          prompt: {
            type: "string",
            description:
              "Base music concept (1 sentence, used as fallback)",
          },
          elevenlabs: {
            type: "string",
            description:
              "ElevenLabs prompt (100-200 words): Detailed instrumental descriptions, NO artist names. Focus on instruments, tempo, playing techniques.",
          },
          loudly: {
            type: "string",
            description:
              "Loudly prompt (1 sentence, ~15-25 words): Short description with duration, genre, mood. Optional artist reference. Example: 'A 30-second upbeat indie pop track in the style of Phoenix'",
          },
          mubert: {
            type: "string",
            description:
              "Mubert prompt (8-12 words): Structured vibe storytelling. Format: genre, energy, optional instrument, setting, vibe/activity. Example: 'Indie rock, energetic, summer, full of life, fun day with friends'",
          },
          provider: {
            type: "string",
            enum: ["loudly", "mubert", "elevenlabs"],
            description: "Music provider (default: loudly)",
          },
          duration: {
            type: "number",
            description: "Duration in seconds",
          },
        } as Record<string, unknown>,
        required: ["adId", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sfx_draft",
      description: "Create a new sound effects version draft in Redis.",
      parameters: {
        type: "object",
        properties: {
          adId: { type: "string" },
          prompts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Sound effect description",
                },
                placement: {
                  type: "object",
                  description: "Where to place the SFX",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["beforeVoices", "withFirstVoice", "afterVoice", "end"],
                      description: "Placement type: beforeVoices (sequential intro), withFirstVoice (concurrent intro), afterVoice (after specific voice), end (outro)",
                    },
                    index: {
                      type: "number",
                      description: "Voice track index (only for afterVoice)",
                    },
                  },
                },
                duration: {
                  type: "number",
                  description: "Duration in seconds",
                },
              },
              required: ["description"],
            },
          },
        } as Record<string, unknown>,
        required: ["adId", "prompts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_ad_state",
      description:
        "Read the complete current state of an ad from Redis. Returns full version data for the latest voices, music, and SFX streams, plus voiceHistory showing which voices were used in previous versions. ALWAYS call this first. When iterating, check voiceHistory to avoid reusing previously tried voices unless explicitly requested.",
      parameters: {
        type: "object",
        properties: {
          adId: { type: "string", description: "The ad ID to read state for" },
        } as Record<string, unknown>,
        required: ["adId"],
      },
    },
  },
];

