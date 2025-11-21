import { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_voices",
      description:
        "Search voice database by language, gender, accent, or style. Use this to find suitable voices instead of asking user for voice list.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            description: "Language code (e.g., 'thai', 'indonesian', 'polish')",
          },
          gender: {
            type: "string",
            enum: ["male", "female"],
            description: "Voice gender filter (optional)",
          },
          accent: {
            type: "string",
            description: "Accent filter (optional, e.g., 'US', 'British')",
          },
          style: {
            type: "string",
            description:
              "Voice style filter (optional, e.g., 'calm', 'energetic')",
          },
          count: {
            type: "number",
            description: "Number of voices to return (default: 10)",
            default: 10,
          },
        } as Record<string, unknown>,
        required: ["language"],
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
                text: { type: "string", description: "Text to be spoken" },
                playAfter: {
                  type: "string",
                  description:
                    "What this plays after (e.g., 'start', 'track-0')",
                },
                overlap: {
                  type: "number",
                  description: "Overlap in seconds (can be negative for gap)",
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
          prompt: { type: "string", description: "Music generation prompt" },
          provider: {
            type: "string",
            enum: ["loudly", "mubert"],
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
                      enum: ["start", "end", "afterVoice"],
                      description: "Placement type",
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
      name: "get_current_state",
      description:
        "Get current active/draft version IDs and summaries for an ad. Use this if conversation is too long and you need to refresh context.",
      parameters: {
        type: "object",
        properties: {
          adId: { type: "string", description: "The ad ID" },
        } as Record<string, unknown>,
        required: ["adId"],
      },
    },
  },
];
