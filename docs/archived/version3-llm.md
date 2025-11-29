# Version 3: Agentic LLM Architecture

**Status:** Architecture Design
**Created:** January 2025
**Author:** Architecture Team
**Version:** 1.0

---

## Executive Summary

The Version 3 LLM architecture replaces the current structured JSON output approach with an **agentic, conversational tool-calling system**. Instead of sending 50-100 voices in the system prompt and parsing brittle JSON responses, the LLM will:

1. **Use tools to search** for voices from the database
2. **Write directly to Redis** version streams via tools
3. **Maintain conversation history** for iterative refinement
4. **Support multiple providers** (OpenAI, Qwen, Moonshot KIMI) with unified interface

### Key Improvements

- **No more JSON parsing errors** - LLM writes directly to Redis via tools
- **Token efficiency** - Voice search on-demand instead of 100-voice catalogues in prompts
- **Conversational iteration** - "Make the music more upbeat" refines existing drafts
- **Prompt caching** - 50-90% token savings on repeated context
- **Multi-provider support** - Qwen for APAC markets, OpenAI for reliability
- **Separation of concerns** - High-level creative planning separate from implementation details

---

## Current Architecture Problems

### Problem 1: Brittle JSON Parsing

**Current Flow:**
```
Brief → LLM → JSON string → JSON.parse() → Hope it works
                              ↓
                         Parse error 💥
```

**Symptoms:**
- JSON parsing failures when LLM includes markdown code blocks
- Missing required fields cause crashes
- No validation until entire generation completes
- Manual parsing and mapping to FormManager state

### Problem 2: Token Waste

**Current Approach:**
- Send 50-100 voices in system prompt (10,000+ tokens)
- Include all voice metadata (name, accent, style, age, use_case, etc.)
- Repeat on every request (no caching)
- LLM must process entire catalogue to pick 2-3 voices

**Cost Impact:**
- English markets: 50 voices × 200 tokens = 10,000 tokens/request
- Most of that context is never used

### Problem 3: No Iteration Support

**Current Limitation:**
- Each generation **replaces** previous state
- User says "make the music more upbeat" → Must regenerate entire ad
- No way to refine specific aspects without starting over
- Lost iterations (see version3.md Problem 2)

### Problem 4: Provider Lock-in

**Current Issue:**
- Tightly coupled to OpenAI JSON mode
- Adding Qwen/KIMI requires duplicating prompt logic
- Different providers have different JSON quirks

---

## Proposed Solution: Agentic Tool Calling

### Core Concept

LLM acts as an **agent** that calls tools to accomplish tasks, rather than returning structured data.

```
Brief → LLM: "I need to create an ad for Spotify Premium in Thai"
       ↓
     LLM: [TOOL CALL] search_voices(language="thai", count=10)
       ↓
     TOOL RESULT: [10 Thai voices with metadata]
       ↓
     LLM: [TOOL CALL] create_voice_draft(adId="123", tracks=[...])
       ↓
     TOOL RESULT: { versionId: "v1", status: "draft" }
       ↓
     LLM: "Created voice draft v1 with 2 Thai voices. Review and activate when ready."
```

### Key Principles

1. **Conversational Continuity** - LLM remembers what it created via conversation history
2. **Tool-Based State Mutation** - LLM modifies Redis directly through tools
3. **Lazy Data Loading** - Fetch voices only when needed, not upfront
4. **Provider Agnostic** - Unified tool interface works across OpenAI/Qwen/KIMI
5. **Prompt Caching** - System prompt + conversation history cached for 50-90% savings
6. **Two-Phase Creative Process** - High-level planning first, then specific selections

---

## Architecture Design

### 1. Tool Definitions

```typescript
// Voice search - replaces sending 100 voices in prompt
{
  name: "search_voices",
  description: "Search voice database by language, gender, accent, or style",
  parameters: {
    language: { type: "string", required: true },
    gender: { type: "string", enum: ["male", "female"] },
    accent: { type: "string" },
    style: { type: "string" },
    count: { type: "number", default: 10 }
  }
}

// Create voice draft - replaces JSON parsing
{
  name: "create_voice_draft",
  description: "Create a new voice track version draft",
  parameters: {
    adId: { type: "string", required: true },
    tracks: {
      type: "array",
      items: {
        voiceId: { type: "string" },
        text: { type: "string" },
        playAfter: { type: "string" },
        overlap: { type: "number" }
      }
    }
  }
}

// Create music draft
{
  name: "create_music_draft",
  description: "Create a new music track version draft",
  parameters: {
    adId: { type: "string", required: true },
    prompt: { type: "string", required: true },
    provider: { type: "string", enum: ["loudly", "mubert"] },
    duration: { type: "number" }
  }
}

// Create SFX draft
{
  name: "create_sfx_draft",
  description: "Create a new sound effects version draft",
  parameters: {
    adId: { type: "string", required: true },
    prompts: {
      type: "array",
      items: {
        description: { type: "string" },
        placement: { type: "object" },
        duration: { type: "number" }
      }
    }
  }
}

// Optional state refresh tool
{
  name: "get_current_state",
  description: "Get current active draft IDs and summaries for an ad",
  parameters: {
    adId: { type: "string", required: true }
  }
}
```

### 2. Conversation Storage

**Redis Key:** `ad:{adId}:conversation`

**Structure:**
```typescript
type ConversationMessage =
  | { role: "system", content: string, cached: true }
  | { role: "user", content: string }
  | { role: "assistant", content: string, tool_calls?: ToolCall[] }
  | { role: "tool", tool_call_id: string, content: string }

// Example conversation
[
  {
    role: "system",
    content: "You are a creative ad generator...",
    cached: true
  },
  {
    role: "user",
    content: "Create a 30s Spotify Premium ad in Thai"
  },
  {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "search_voices",
          arguments: '{"language":"thai","count":10}'
        }
      }
    ]
  },
  {
    role: "tool",
    tool_call_id: "call_1",
    content: '[{"id":"voice123","name":"Sarawut",...}]'
  },
  {
    role: "assistant",
    content: "I found 10 Thai voices. Creating draft with Sarawut...",
    tool_calls: [
      {
        id: "call_2",
        type: "function",
        function: {
          name: "create_voice_draft",
          arguments: '{"adId":"ad123","tracks":[...]}'
        }
      }
    ]
  },
  {
    role: "tool",
    tool_call_id: "call_2",
    content: '{"versionId":"v1","status":"draft"}'
  },
  {
    role: "assistant",
    content: "Created voice draft v1. Review and activate when ready."
  }
]
```

### 3. Provider Adapter Layer

**Unified Interface:**
```typescript
interface ToolCallingProvider {
  callWithTools(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    options?: {
      caching?: boolean,
      streaming?: boolean
    }
  ): Promise<{
    message: AssistantMessage,
    toolCalls: ToolCall[]
  }>;

  supportsStreaming: boolean;
  supportsCaching: boolean;
}
```

**Provider Implementations:**

```typescript
// OpenAI Adapter
class OpenAIAdapter implements ToolCallingProvider {
  supportsStreaming = true;
  supportsCaching = true;

  async callWithTools(messages, tools, options) {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      tools,
      tool_choice: "auto"
    });

    return {
      message: response.choices[0].message,
      toolCalls: response.choices[0].message.tool_calls || []
    };
  }
}

// Qwen Adapter (handles streaming bugs)
class QwenAdapter implements ToolCallingProvider {
  supportsStreaming = false; // Disabled due to parallel call bugs
  supportsCaching = true;

  async callWithTools(messages, tools, options) {
    // Use DashScope compatible mode
    const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen-max",
        messages,
        tools,
        stream: false // Avoid parallel call bugs
      })
    });

    const data = await response.json();

    // Validate tool calls (Qwen sometimes malforms them)
    const validatedCalls = this.validateToolCalls(data.choices[0].message.tool_calls);

    return {
      message: data.choices[0].message,
      toolCalls: validatedCalls
    };
  }

  private validateToolCalls(calls) {
    // Handle Qwen-specific edge cases
    return calls?.map(call => ({
      ...call,
      function: {
        ...call.function,
        arguments: this.repairJSON(call.function.arguments)
      }
    })) || [];
  }
}

// KIMI Adapter (handles parallel call indexing)
class KimiAdapter implements ToolCallingProvider {
  supportsStreaming = true; // Requires manual parsing
  supportsCaching = true;

  async callWithTools(messages, tools, options) {
    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MOONSHOT_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "moonshot-v1-32k",
        messages,
        tools
      })
    });

    const data = await response.json();

    // Fix parallel call indexing issues
    const reindexedCalls = this.reindexToolCalls(data.choices[0].message.tool_calls);

    return {
      message: data.choices[0].message,
      toolCalls: reindexedCalls
    };
  }

  private reindexToolCalls(calls) {
    // KIMI sometimes messes up tool_call.index
    return calls?.map((call, index) => ({
      ...call,
      index // Force correct sequential indexing
    })) || [];
  }
}
```

**Provider Selection Strategy:**

```typescript
function getProvider(language: string, market: string): ToolCallingProvider {
  // Primary: Qwen for APAC/multilingual
  if (["thai", "indonesian", "polish", "portuguese", "spanish"].includes(language)) {
    return new QwenAdapter();
  }

  // Chinese: Moonshot KIMI (best for Chinese)
  if (language === "chinese") {
    return new KimiAdapter();
  }

  // Default: OpenAI (most reliable)
  return new OpenAIAdapter();
}
```

---

## API Endpoints

### 1. Initial Generation

**Endpoint:** `POST /api/ai/generate` (refactored)

**Request:**
```json
{
  "adId": "ad-123",
  "brief": {
    "clientDescription": "Spotify Premium family plan",
    "targetAudience": "Thai families",
    "format": "30s audio ad"
  },
  "provider": "qwen", // or "openai", "kimi"
  "conversationId": null // null for initial generation
}
```

**Flow:**
1. Create conversation in Redis with system prompt (mark as cached)
2. Add user message with brief
3. Call LLM with tools enabled
4. Execute tool calls:
   - `search_voices(language="thai")` → returns 10 voices
   - `create_voice_draft(...)` → writes to Redis
   - `create_music_draft(...)` → writes to Redis
   - `create_sfx_draft(...)` → writes to Redis
5. Store complete conversation history
6. Return conversation ID + created draft version IDs

**Response:**
```json
{
  "conversationId": "conv-123",
  "drafts": {
    "voices": "v1",
    "music": "v1",
    "sfx": "v1"
  },
  "message": "Created drafts for Thai Spotify Premium ad. Review each panel and activate when ready."
}
```

### 2. Iterative Refinement

**Endpoint:** `POST /api/ads/[id]/chat` (new)

**Request:**
```json
{
  "message": "Make the music more upbeat and add a whoosh sound effect at the start",
  "conversationId": "conv-123"
}
```

**Flow:**
1. Load conversation history from Redis
2. Append new user message
3. Call LLM with tools + conversation history (cached!)
4. LLM understands context:
   - Knows what music draft exists (from conversation)
   - Creates new music draft with updated prompt
   - Creates new SFX draft with whoosh effect
5. Execute tool calls
6. Store updated conversation
7. Return new draft versions

**Response:**
```json
{
  "drafts": {
    "music": "v2",
    "sfx": "v2"
  },
  "message": "Created music v2 with more upbeat tempo and sfx v2 with whoosh at start. Review in panels."
}
```

---

## Prompt Caching Strategy

### What Gets Cached

**System Prompt (Always Cached):**
```typescript
const systemPrompt = `You are an expert audio ad creative director...

Available tools:
- search_voices: Find voices from database
- create_voice_draft: Write voice tracks to Redis
- create_music_draft: Write music prompts to Redis
- create_sfx_draft: Write sound effects to Redis

Guidelines:
1. Search for voices instead of asking user for list
2. Create drafts via tools, don't return JSON
3. Be conversational and guide user through refinement
4. Separate high-level creative planning from specific voice selection
`;

// Mark as cacheable
messages.push({
  role: "system",
  content: systemPrompt,
  cached: true // OpenAI/Qwen cache this
});
```

**Conversation History (Incrementally Cached):**
```typescript
// Turn 1: 2500 tokens cached
[system prompt + tools] → cached

// Turn 2: +600 new, 2500 cached
[system prompt + tools + turn 1] → 2500 cached, 600 new

// Turn 3: +300 new, 3100 cached
[system prompt + tools + turn 1 + turn 2] → 3100 cached, 300 new
```

**Token Savings:**
- OpenAI: 50% discount on cached tokens (90% for extended cache)
- Qwen: KV cache support (similar savings)
- Moonshot: 2M token context window with caching

**Example Cost Calculation:**
```
Without caching:
- Turn 1: 3000 tokens × $0.01 = $0.03
- Turn 2: 3600 tokens × $0.01 = $0.036
- Turn 3: 3900 tokens × $0.01 = $0.039
Total: $0.105

With caching:
- Turn 1: 3000 tokens × $0.01 = $0.03
- Turn 2: 2500 cached × $0.005 + 600 new × $0.01 = $0.0185
- Turn 3: 3100 cached × $0.005 + 300 new × $0.01 = $0.0185
Total: $0.067 (36% savings)
```

---

## Context Management

### How LLM "Remembers" Draft State

**Option: Conversational Continuity (CHOSEN)**

LLM knows what drafts exist because it **created them via tools** and that's in the conversation history:

```
User: "Create an ad for Spotify"
Assistant: [calls create_voice_draft]
Tool Result: { versionId: "v1", voiceTracks: [...] }
Assistant: "Created voice draft v1 with 2 voices"

User: "Change the second voice to be more energetic"
Assistant: (looks back at conversation history)
          "I created v1 with voices: Rachel (calm), Jack (upbeat)"
          "User wants to change Jack to be more energetic"
          [calls search_voices(style="energetic")]
          [calls create_voice_draft with new voice]
```

**Benefits:**
- Natural conversational UX
- No extra latency for state fetching
- LLM has full creative context
- User can reference previous iterations naturally

**Trade-offs:**
- Token usage grows with conversation length
- Need conversation summarization after ~10-15 turns
- Must store conversation persistently

**Backup Tool:** `get_current_state(adId)`
- LLM can call if conversation is too long
- Returns active draft IDs + brief summaries
- Refreshes LLM's understanding

---

## Implementation Plan

### Overview

**Total Duration:** 4 phases (12-15 days)
**Approach:** Incremental with feature flags for safe rollout
**Testing:** Unit tests + integration tests per phase

---

### Phase 1: Tool Infrastructure (Days 1-4)

#### Step 1.1: Tool Type System
**File:** `src/lib/tools/types.ts`

Create TypeScript interfaces for the tool calling system:

```typescript
// Core tool call types (OpenAI-compatible)
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string; // JSON string
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Tool implementation parameter types
export interface SearchVoicesParams {
  language: string;
  gender?: "male" | "female";
  accent?: string;
  style?: string;
  count?: number;
}

export interface CreateVoiceDraftParams {
  adId: string;
  tracks: Array<{
    voiceId: string;
    text: string;
    playAfter?: string;
    overlap?: number;
  }>;
}

export interface CreateMusicDraftParams {
  adId: string;
  prompt: string;
  provider?: "loudly" | "mubert";
  duration?: number;
}

export interface CreateSfxDraftParams {
  adId: string;
  prompts: Array<{
    description: string;
    placement?: { type: string; index?: number };
    duration?: number;
  }>;
}

export interface GetCurrentStateParams {
  adId: string;
}

// Tool result types
export interface SearchVoicesResult {
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
    accent?: string;
    style?: string;
  }>;
  count: number;
}

export interface DraftCreationResult {
  versionId: string;
  status: "draft";
}

export interface CurrentStateResult {
  voices?: { versionId: string; summary: string };
  music?: { versionId: string; summary: string };
  sfx?: { versionId: string; summary: string };
}
```

#### Step 1.2: Tool Definitions
**File:** `src/lib/tools/definitions.ts`

Create OpenAI-compatible tool schemas:

```typescript
import { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_voices",
      description: "Search voice database by language, gender, accent, or style. Use this to find suitable voices instead of asking user for voice list.",
      parameters: {
        type: "object",
        properties: {
          language: {
            type: "string",
            description: "Language code (e.g., 'thai', 'indonesian', 'polish')"
          },
          gender: {
            type: "string",
            enum: ["male", "female"],
            description: "Voice gender filter (optional)"
          },
          accent: {
            type: "string",
            description: "Accent filter (optional, e.g., 'US', 'British')"
          },
          style: {
            type: "string",
            description: "Voice style filter (optional, e.g., 'calm', 'energetic')"
          },
          count: {
            type: "number",
            description: "Number of voices to return (default: 10)",
            default: 10
          }
        },
        required: ["language"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_voice_draft",
      description: "Create a new voice track version draft in Redis. This writes directly to the version stream.",
      parameters: {
        type: "object",
        properties: {
          adId: {
            type: "string",
            description: "The ad ID to create draft for"
          },
          tracks: {
            type: "array",
            description: "Array of voice tracks with text and timing",
            items: {
              type: "object",
              properties: {
                voiceId: { type: "string", description: "Voice ID from search_voices" },
                text: { type: "string", description: "Text to be spoken" },
                playAfter: { type: "string", description: "What this plays after (e.g., 'start', 'track-0')" },
                overlap: { type: "number", description: "Overlap in seconds (can be negative for gap)" }
              },
              required: ["voiceId", "text"]
            }
          }
        },
        required: ["adId", "tracks"]
      }
    }
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
            description: "Music provider (default: loudly)"
          },
          duration: {
            type: "number",
            description: "Duration in seconds"
          }
        },
        required: ["adId", "prompt"]
      }
    }
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
                description: { type: "string", description: "Sound effect description" },
                placement: {
                  type: "object",
                  description: "Where to place the SFX",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["start", "end", "afterVoice"],
                      description: "Placement type"
                    },
                    index: {
                      type: "number",
                      description: "Voice track index (only for afterVoice)"
                    }
                  }
                },
                duration: { type: "number", description: "Duration in seconds" }
              },
              required: ["description"]
            }
          }
        },
        required: ["adId", "prompts"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_state",
      description: "Get current active/draft version IDs and summaries for an ad. Use this if conversation is too long and you need to refresh context.",
      parameters: {
        type: "object",
        properties: {
          adId: { type: "string", description: "The ad ID" }
        },
        required: ["adId"]
      }
    }
  }
];
```

#### Step 1.3: Tool Implementations
**File:** `src/lib/tools/implementations.ts`

Implement the actual tool execution logic:

```typescript
import {
  SearchVoicesParams,
  SearchVoicesResult,
  CreateVoiceDraftParams,
  CreateMusicDraftParams,
  CreateSfxDraftParams,
  GetCurrentStateParams,
  DraftCreationResult,
  CurrentStateResult,
} from "./types";
import { voiceCatalogue } from "@/data/voiceCatalogue";
import { createVersion, getLatestVersion } from "@/lib/redis-v3";
import type { Language, Provider } from "@/types";
import type { VoiceVersion, MusicVersion, SfxVersion } from "@/types/versions";

/**
 * Search voices from the voice catalogue
 */
export async function searchVoices(
  params: SearchVoicesParams
): Promise<SearchVoicesResult> {
  const { language, gender, accent, style, count = 10 } = params;

  // Get voices from catalogue
  const allVoices = await voiceCatalogue.getVoicesForProvider(
    "any" as Provider,
    language as Language,
    accent,
    true // requireApproval
  );

  // Filter by gender if specified
  let filtered = gender
    ? allVoices.filter((v) => v.gender.toLowerCase() === gender.toLowerCase())
    : allVoices;

  // Filter by style if specified (check voice.style or voice.use_case)
  if (style) {
    filtered = filtered.filter(
      (v) =>
        v.style?.toLowerCase().includes(style.toLowerCase()) ||
        v.use_case?.toLowerCase().includes(style.toLowerCase())
    );
  }

  // Take first N voices
  const selected = filtered.slice(0, count);

  // Enrich with metadata
  const enriched = selected.map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    style: v.style || v.use_case,
    provider: v.provider,
  }));

  return {
    voices: enriched,
    count: enriched.length,
  };
}

/**
 * Create voice draft in Redis
 */
export async function createVoiceDraft(
  params: CreateVoiceDraftParams
): Promise<DraftCreationResult> {
  const { adId, tracks } = params;

  // Build voice version object
  const voiceVersion: VoiceVersion = {
    voiceTracks: tracks.map((track, index) => ({
      id: `track-${index}`,
      voiceId: track.voiceId,
      text: track.text,
      playAfter: track.playAfter || (index === 0 ? "start" : `track-${index - 1}`),
      overlap: track.overlap ?? 0,
      speed: 1.0, // Default speed
    })),
  };

  // Create draft version in Redis
  const versionId = await createVersion(adId, "voices", voiceVersion, "draft");

  return {
    versionId,
    status: "draft",
  };
}

/**
 * Create music draft in Redis
 */
export async function createMusicDraft(
  params: CreateMusicDraftParams
): Promise<DraftCreationResult> {
  const { adId, prompt, provider = "loudly", duration } = params;

  const musicVersion: MusicVersion = {
    musicPrompt: prompt,
    musicProvider: provider,
    duration,
  };

  const versionId = await createVersion(adId, "music", musicVersion, "draft");

  return {
    versionId,
    status: "draft",
  };
}

/**
 * Create SFX draft in Redis
 */
export async function createSfxDraft(
  params: CreateSfxDraftParams
): Promise<DraftCreationResult> {
  const { adId, prompts } = params;

  const sfxVersion: SfxVersion = {
    soundFxPrompts: prompts.map((p) => ({
      description: p.description,
      placement: p.placement || { type: "end" },
      duration: p.duration || 3,
      playAfter: "start",
      overlap: 0,
    })),
  };

  const versionId = await createVersion(adId, "sfx", sfxVersion, "draft");

  return {
    versionId,
    status: "draft",
  };
}

/**
 * Get current state for an ad
 */
export async function getCurrentState(
  params: GetCurrentStateParams
): Promise<CurrentStateResult> {
  const { adId } = params;

  const [voicesVersion, musicVersion, sfxVersion] = await Promise.all([
    getLatestVersion(adId, "voices", "draft").catch(() => null),
    getLatestVersion(adId, "music", "draft").catch(() => null),
    getLatestVersion(adId, "sfx", "draft").catch(() => null),
  ]);

  const result: CurrentStateResult = {};

  if (voicesVersion) {
    const vv = voicesVersion.data as VoiceVersion;
    result.voices = {
      versionId: voicesVersion.id,
      summary: `${vv.voiceTracks.length} voice tracks`,
    };
  }

  if (musicVersion) {
    const mv = musicVersion.data as MusicVersion;
    result.music = {
      versionId: musicVersion.id,
      summary: `${mv.musicProvider} - "${mv.musicPrompt.slice(0, 50)}..."`,
    };
  }

  if (sfxVersion) {
    const sv = sfxVersion.data as SfxVersion;
    result.sfx = {
      versionId: sfxVersion.id,
      summary: `${sv.soundFxPrompts.length} sound effects`,
    };
  }

  return result;
}
```

#### Step 1.4: Tool Executor
**File:** `src/lib/tools/executor.ts`

Create orchestration layer for executing tool calls:

```typescript
import type { ToolCall, ToolResult } from "./types";
import {
  searchVoices,
  createVoiceDraft,
  createMusicDraft,
  createSfxDraft,
  getCurrentState,
} from "./implementations";

/**
 * Execute a single tool call and return the result
 */
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const { id, function: func } = call;
  const { name, arguments: argsStr } = func;

  try {
    // Parse arguments
    const args = JSON.parse(argsStr);

    // Execute the appropriate tool
    let result: unknown;

    switch (name) {
      case "search_voices":
        result = await searchVoices(args);
        break;

      case "create_voice_draft":
        result = await createVoiceDraft(args);
        break;

      case "create_music_draft":
        result = await createMusicDraft(args);
        break;

      case "create_sfx_draft":
        result = await createSfxDraft(args);
        break;

      case "get_current_state":
        result = await getCurrentState(args);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Special handling for search_voices with 0 results
    if (name === "search_voices" && Array.isArray((result as any).voices) && (result as any).voices.length === 0) {
      return {
        tool_call_id: id,
        content: JSON.stringify({
          error: "No voices found matching the criteria",
          suggestion: "Try broadening your search (remove accent/style filters, try different gender)",
          voices: [],
          count: 0,
        }),
      };
    }

    return {
      tool_call_id: id,
      content: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      tool_call_id: id,
      content: JSON.stringify({
        error: errorMessage,
        suggestion: "Retry with different parameters or check argument format",
      }),
    };
  }
}

/**
 * Execute multiple tool calls in sequence
 */
export async function executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const call of calls) {
    const result = await executeToolCall(call);
    results.push(result);
  }

  return results;
}
```

#### Step 1.5: Testing
**File:** `src/lib/tools/__tests__/implementations.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { searchVoices, createVoiceDraft } from "../implementations";

describe("searchVoices", () => {
  it("returns voices matching language", async () => {
    const result = await searchVoices({ language: "english", count: 5 });
    expect(result.voices.length).toBeGreaterThan(0);
    expect(result.voices.length).toBeLessThanOrEqual(5);
  });

  it("filters by gender", async () => {
    const result = await searchVoices({ language: "english", gender: "female", count: 10 });
    expect(result.voices.every((v) => v.gender.toLowerCase() === "female")).toBe(true);
  });
});

describe("createVoiceDraft", () => {
  it("creates draft version in Redis", async () => {
    const result = await createVoiceDraft({
      adId: "test-ad",
      tracks: [
        { voiceId: "voice-1", text: "Hello world" },
        { voiceId: "voice-2", text: "Goodbye", playAfter: "track-0", overlap: -0.5 },
      ],
    });

    expect(result.versionId).toMatch(/^v\d+$/);
    expect(result.status).toBe("draft");
  });
});
```

**Deliverables:**
- ✅ Complete type system for tool calling
- ✅ OpenAI-compatible tool definitions
- ✅ Working tool implementations that write to Redis
- ✅ Tool executor with error handling
- ✅ Unit tests

---

### Phase 2: Provider Adapters (Days 5-8)

#### Step 2.1: Provider Interface
**File:** `src/lib/tool-calling/ToolCallingProvider.ts`

```typescript
import type { ToolDefinition, ToolCall } from "@/lib/tools/types";

export interface ConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  cached?: boolean; // For prompt caching
}

export interface ProviderResponse {
  message: ConversationMessage;
  toolCalls: ToolCall[];
}

export interface ToolCallingProvider {
  callWithTools(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    options?: {
      caching?: boolean;
      streaming?: boolean;
    }
  ): Promise<ProviderResponse>;

  supportsStreaming: boolean;
  supportsCaching: boolean;
  name: string;
}
```

#### Step 2.2: OpenAI Adapter
**File:** `src/lib/tool-calling/OpenAIAdapter.ts`

```typescript
import OpenAI from "openai";
import type {
  ToolCallingProvider,
  ConversationMessage,
  ProviderResponse,
} from "./ToolCallingProvider";
import type { ToolDefinition } from "@/lib/tools/types";

export class OpenAIAdapter implements ToolCallingProvider {
  name = "openai";
  supportsStreaming = true;
  supportsCaching = true;

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async callWithTools(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    options?: { caching?: boolean; streaming?: boolean }
  ): Promise<ProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: messages as any,
      tools: tools as any,
      tool_choice: "auto",
      stream: options?.streaming ?? false,
    });

    const choice = response.choices[0];
    const message = choice.message;

    return {
      message: {
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls as any,
      },
      toolCalls: (message.tool_calls as any) || [],
    };
  }
}
```

#### Step 2.3: Qwen Adapter
**File:** `src/lib/tool-calling/QwenAdapter.ts`

```typescript
import type {
  ToolCallingProvider,
  ConversationMessage,
  ProviderResponse,
} from "./ToolCallingProvider";
import type { ToolDefinition, ToolCall } from "@/lib/tools/types";

export class QwenAdapter implements ToolCallingProvider {
  name = "qwen";
  supportsStreaming = false; // Disabled due to parallel call bugs
  supportsCaching = true;

  async callWithTools(
    messages: ConversationMessage[],
    tools: ToolDefinition[],
    options?: { caching?: boolean; streaming?: boolean }
  ): Promise<ProviderResponse> {
    const response = await fetch(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen-max",
          messages,
          tools,
          stream: false, // Force non-streaming for reliability
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qwen API error: ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice.message;

    // Validate and repair tool calls
    const validatedCalls = this.validateToolCalls(message.tool_calls);

    return {
      message: {
        role: "assistant",
        content: message.content || "",
        tool_calls: validatedCalls,
      },
      toolCalls: validatedCalls,
    };
  }

  private validateToolCalls(calls: ToolCall[] | undefined): ToolCall[] {
    if (!calls) return [];

    return calls.map((call) => ({
      ...call,
      function: {
        ...call.function,
        arguments: this.repairJSON(call.function.arguments),
      },
    }));
  }

  private repairJSON(jsonStr: string): string {
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      // Common Qwen issues:
      // 1. Trailing commas
      let repaired = jsonStr.replace(/,(\s*[}\]])/g, "$1");

      // 2. Unquoted keys
      repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // 3. Single quotes instead of double
      repaired = repaired.replace(/'/g, '"');

      return repaired;
    }
  }
}
```

#### Step 2.4: Provider Factory
**File:** `src/lib/tool-calling/ProviderFactory.ts`

```typescript
import type { ToolCallingProvider } from "./ToolCallingProvider";
import { OpenAIAdapter } from "./OpenAIAdapter";
import { QwenAdapter } from "./QwenAdapter";

export function getToolCallingProvider(language: string, market: string): ToolCallingProvider {
  // APAC languages → Qwen
  if (["thai", "indonesian", "vietnamese"].includes(language.toLowerCase())) {
    return new QwenAdapter();
  }

  // LATAM languages → Qwen
  if (["spanish", "portuguese"].includes(language.toLowerCase())) {
    return new QwenAdapter();
  }

  // Eastern Europe → Qwen
  if (["polish", "czech", "romanian"].includes(language.toLowerCase())) {
    return new QwenAdapter();
  }

  // Default: OpenAI (most reliable)
  return new OpenAIAdapter();
}
```

**Deliverables:**
- ✅ Provider interface with OpenAI compatibility
- ✅ OpenAI adapter implementation
- ✅ Qwen adapter with JSON repair
- ✅ Provider factory for routing
- ✅ Unit tests for adapters

---

### Phase 3: Conversation Storage & API Integration (Days 9-12)

#### Step 3.1: Conversation Storage
**File:** `src/lib/redis/conversation.ts`

```typescript
import { redis } from "./redis-v3";
import type { ConversationMessage } from "@/lib/tool-calling/ToolCallingProvider";

const CONVERSATION_KEY_PREFIX = "ad:";
const CONVERSATION_KEY_SUFFIX = ":conversation";

export async function getConversation(adId: string): Promise<ConversationMessage[]> {
  const key = `${CONVERSATION_KEY_PREFIX}${adId}${CONVERSATION_KEY_SUFFIX}`;
  const data = await redis.get(key);

  if (!data) return [];

  return JSON.parse(data);
}

export async function saveConversation(
  adId: string,
  messages: ConversationMessage[]
): Promise<void> {
  const key = `${CONVERSATION_KEY_PREFIX}${adId}${CONVERSATION_KEY_SUFFIX}`;
  await redis.set(key, JSON.stringify(messages));
}

export async function appendToConversation(
  adId: string,
  messages: ConversationMessage[]
): Promise<ConversationMessage[]> {
  const existing = await getConversation(adId);
  const updated = [...existing, ...messages];
  await saveConversation(adId, updated);
  return updated;
}

export async function clearConversation(adId: string): Promise<void> {
  const key = `${CONVERSATION_KEY_PREFIX}${adId}${CONVERSATION_KEY_SUFFIX}`;
  await redis.del(key);
}
```

#### Step 3.2: Refactor `/api/ai/generate`
**File:** `src/app/api/ai/generate/route.ts`

Add V3 tool-calling flow with feature flag:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { TOOL_DEFINITIONS } from "@/lib/tools/definitions";
import { executeToolCalls } from "@/lib/tools/executor";
import { getToolCallingProvider } from "@/lib/tool-calling/ProviderFactory";
import { saveConversation } from "@/lib/redis/conversation";
import type { ConversationMessage } from "@/lib/tool-calling/ToolCallingProvider";

const ENABLE_V3_TOOL_CALLING = process.env.ENABLE_V3_TOOL_CALLING === "true";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { adId, brief, language = "english", market = "US", useToolCalling } = body;

  // Check if V3 tool calling is enabled
  const shouldUseToolCalling = useToolCalling || ENABLE_V3_TOOL_CALLING;

  if (!shouldUseToolCalling) {
    // Legacy JSON parsing flow
    return legacyGeneration(body);
  }

  // === V3 AGENTIC TOOL CALLING FLOW ===

  // 1. Build system prompt
  const systemPrompt = buildSystemPrompt();

  // 2. Build user message from brief
  const userMessage = buildUserMessage(brief);

  // 3. Initialize conversation
  const messages: ConversationMessage[] = [
    { role: "system", content: systemPrompt, cached: true },
    { role: "user", content: userMessage },
  ];

  // 4. Get provider
  const provider = getToolCallingProvider(language, market);

  // 5. Call LLM with tools
  const response = await provider.callWithTools(messages, TOOL_DEFINITIONS, {
    caching: true,
  });

  // 6. Execute tool calls
  if (response.toolCalls.length > 0) {
    const toolResults = await executeToolCalls(response.toolCalls);

    // Add assistant message with tool calls
    messages.push(response.message);

    // Add tool results
    for (const result of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: result.tool_call_id,
        content: result.content,
      });
    }

    // Call LLM again to get final response
    const finalResponse = await provider.callWithTools(messages, TOOL_DEFINITIONS);
    messages.push(finalResponse.message);
  }

  // 7. Save conversation
  await saveConversation(adId, messages);

  // 8. Extract created draft IDs from tool results
  const drafts = extractDraftIds(messages);

  return NextResponse.json({
    conversationId: adId,
    drafts,
    message: messages[messages.length - 1].content,
  });
}

function buildSystemPrompt(): string {
  return `You are an expert audio ad creative director...

Available tools:
- search_voices: Find voices from database by language, gender, accent, style
- create_voice_draft: Write voice tracks directly to Redis
- create_music_draft: Write music prompts directly to Redis
- create_sfx_draft: Write sound effects directly to Redis

Guidelines:
1. Always search for voices using search_voices tool instead of asking user
2. Create drafts via tools - do NOT return JSON
3. Be conversational and guide user through the process
4. Separate high-level creative planning from specific voice selection`;
}

function buildUserMessage(brief: any): string {
  return `Create an audio ad with the following details:

Client: ${brief.clientDescription}
Target Audience: ${brief.targetAudience}
Duration: ${brief.duration || 30}s
Market: ${brief.market}
Language: ${brief.language}

Additional context:
${brief.additionalContext || "None"}`;
}

function extractDraftIds(messages: ConversationMessage[]): {
  voices?: string;
  music?: string;
  sfx?: string;
} {
  const drafts: any = {};

  for (const msg of messages) {
    if (msg.role === "tool") {
      try {
        const result = JSON.parse(msg.content);
        if (result.versionId) {
          // Infer type from tool call
          // This is simplified - in real implementation, track which tool created which version
          if (!drafts.voices) drafts.voices = result.versionId;
          else if (!drafts.music) drafts.music = result.versionId;
          else if (!drafts.sfx) drafts.sfx = result.versionId;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return drafts;
}

// Legacy flow (keep for backward compatibility)
async function legacyGeneration(body: any) {
  // ... existing implementation
}
```

**Deliverables:**
- ✅ Conversation storage in Redis
- ✅ Refactored `/api/ai/generate` with V3 flow
- ✅ Feature flag for gradual rollout
- ✅ Backward compatibility with legacy flow

---

### Phase 4: Chat Endpoint & Frontend Integration (Days 13-15)

#### Step 4.1: Chat Endpoint
**File:** `src/app/api/ads/[id]/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConversation, appendToConversation } from "@/lib/redis/conversation";
import { getToolCallingProvider } from "@/lib/tool-calling/ProviderFactory";
import { TOOL_DEFINITIONS } from "@/lib/tools/definitions";
import { executeToolCalls } from "@/lib/tools/executor";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adId = params.id;
  const { message, language = "english", market = "US" } = await request.json();

  // 1. Load conversation history
  const conversation = await getConversation(adId);

  if (conversation.length === 0) {
    return NextResponse.json(
      { error: "No conversation found. Generate initial ad first." },
      { status: 400 }
    );
  }

  // 2. Append user message
  const newMessages = [{ role: "user" as const, content: message }];
  const updatedConversation = [...conversation, ...newMessages];

  // 3. Get provider
  const provider = getToolCallingProvider(language, market);

  // 4. Call LLM with full conversation + tools
  const response = await provider.callWithTools(
    updatedConversation,
    TOOL_DEFINITIONS,
    { caching: true }
  );

  // 5. Execute tool calls if any
  const messagesToAdd = [response.message];

  if (response.toolCalls.length > 0) {
    const toolResults = await executeToolCalls(response.toolCalls);

    // Add tool results
    for (const result of toolResults) {
      messagesToAdd.push({
        role: "tool" as const,
        tool_call_id: result.tool_call_id,
        content: result.content,
      });
    }

    // Get final response from LLM
    const finalResponse = await provider.callWithTools(
      [...updatedConversation, ...messagesToAdd],
      TOOL_DEFINITIONS
    );
    messagesToAdd.push(finalResponse.message);
  }

  // 6. Save updated conversation
  await appendToConversation(adId, messagesToAdd);

  // 7. Extract newly created draft IDs
  const drafts = extractDraftIds(messagesToAdd);

  return NextResponse.json({
    drafts,
    message: messagesToAdd[messagesToAdd.length - 1].content,
  });
}

function extractDraftIds(messages: any[]): any {
  // Same logic as in /api/ai/generate
  const drafts: any = {};

  for (const msg of messages) {
    if (msg.role === "tool") {
      try {
        const result = JSON.parse(msg.content);
        if (result.versionId) {
          if (!drafts.voices) drafts.voices = result.versionId;
          else if (!drafts.music) drafts.music = result.versionId;
          else if (!drafts.sfx) drafts.sfx = result.versionId;
        }
      } catch {
        // Ignore
      }
    }
  }

  return drafts;
}
```

#### Step 4.2: Update BriefPanelV3
**File:** `src/components/BriefPanelV3.tsx`

Remove JSON parsing, use tool calling:

```typescript
// Change handleGenerate to use tool calling
const handleGenerate = async () => {
  setIsGenerating(true);
  setStatusMessage("Generating creative...");

  try {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adId,
        brief: formData,
        useToolCalling: true, // Enable V3 flow
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setStatusMessage(data.message || "Drafts created successfully!");

      // Notify parent with draft IDs
      if (onDraftsCreated) {
        onDraftsCreated(data.drafts);
      }
    } else {
      const error = await response.json();
      setStatusMessage(`Generation failed: ${error.error}`);
    }
  } catch (error) {
    console.error("Generation error:", error);
    setStatusMessage("Generation failed. Please try again.");
  } finally {
    setIsGenerating(false);
  }
};
```

**Deliverables:**
- ✅ Chat endpoint for conversational iteration
- ✅ Updated BriefPanelV3 to use tool calling
- ✅ Integration tests for full flow
- ✅ Documentation for migration

---

### Testing & Rollout

#### Unit Tests
- Tool implementations (`search_voices`, `create_voice_draft`, etc.)
- Provider adapters (OpenAI, Qwen)
- JSON repair logic
- Conversation storage

#### Integration Tests
- Full generation flow (brief → tools → drafts in Redis)
- Conversational iteration (generate → refine → verify)
- Provider switching
- Error handling

#### Rollout Plan
1. **Week 1:** Internal testing with `ENABLE_V3_TOOL_CALLING=true`
2. **Week 2:** 10% of production traffic
3. **Week 3:** 50% of production traffic
4. **Week 4:** 100% of production traffic
5. **Week 5:** Remove legacy code

---

## Provider Comparison & Selection

### OpenAI GPT-4/GPT-5

**Strengths:**
- Most reliable tool calling
- Best documentation
- Full streaming support
- Native prompt caching

**Weaknesses:**
- Higher cost ($10-20 per session)
- Limited APAC language training data
- Indonesian only 0.6% of training data

**Use Cases:**
- Critical operations where reliability > cost
- English/Western European markets
- Complex multi-step workflows

---

### Qwen-Max

**Strengths:**
- Confirmed Thai/Indonesian support (119 languages)
- Excellent Chinese support
- OpenAI-compatible API
- Cost-effective
- Good tool calling reliability

**Weaknesses:**
- Streaming + parallel calls has bugs (avoid streaming)
- Corner cases with malformed tool calls (requires validation)
- Not as well-documented as OpenAI

**Use Cases:**
- **Primary choice for APAC markets** (Thailand, Indonesia)
- Poland, LATAM (Spanish, Portuguese)
- Any multilingual use case
- Cost-sensitive operations

**Implementation Notes:**
- Disable streaming for operations with parallel tool calls
- Add validation layer for tool call JSON
- Use non-streaming mode for reliability

---

### Moonshot KIMI

**Strengths:**
- Excellent Chinese support (native)
- Best for agentic workflows (200-300 sequential calls)
- Cost-effective ($7 vs $10-20)
- 2M token context window
- OpenAI-compatible API

**Weaknesses:**
- Thai/Indonesian support NOT confirmed (not in documented languages)
- Parallel call indexing issues (requires fixing)
- Less documentation than OpenAI

**Use Cases:**
- Chinese markets specifically
- Complex agentic workflows
- After confirming Thai/Indonesian support

**TODO:**
- Email support@moonshot.cn to confirm Thai/Indonesian
- Test with sample Thai/Indonesian prompts
- Document results before production use

---

## Provider Routing Logic

```typescript
function selectProvider(context: {
  language: string,
  market: string,
  complexity: "simple" | "complex",
  budget: "cost-effective" | "premium"
}): ToolCallingProvider {

  // Chinese content → KIMI
  if (context.language === "chinese") {
    return new KimiAdapter();
  }

  // APAC languages (Thai, Indonesian, etc.) → Qwen
  if (["thai", "indonesian", "vietnamese"].includes(context.language)) {
    return new QwenAdapter();
  }

  // LATAM languages → Qwen
  if (["spanish", "portuguese"].includes(context.language)) {
    return new QwenAdapter();
  }

  // Eastern Europe → Qwen
  if (["polish", "czech", "romanian"].includes(context.language)) {
    return new QwenAdapter();
  }

  // Premium budget or complex workflow → OpenAI
  if (context.budget === "premium" || context.complexity === "complex") {
    return new OpenAIAdapter();
  }

  // Default: Qwen (good balance of cost and quality)
  return new QwenAdapter();
}
```

---

## Error Handling & Edge Cases

### Tool Call Failures

**Scenario:** Voice search returns 0 results

**Handling:**
```typescript
async function executeToolCall(call: ToolCall) {
  try {
    const result = await tools[call.function.name](
      JSON.parse(call.function.arguments)
    );

    if (call.function.name === "search_voices" && result.length === 0) {
      return {
        tool_call_id: call.id,
        content: JSON.stringify({
          error: "No voices found. Try different filters.",
          suggestion: "Broaden search (remove accent filter, try different gender)"
        })
      };
    }

    return {
      tool_call_id: call.id,
      content: JSON.stringify(result)
    };
  } catch (error) {
    return {
      tool_call_id: call.id,
      content: JSON.stringify({
        error: error.message,
        suggestion: "Retry with different parameters"
      })
    };
  }
}
```

### Malformed Tool Calls (Qwen)

**Issue:** Qwen sometimes returns invalid JSON in tool arguments

**Mitigation:**
```typescript
class QwenAdapter {
  private repairJSON(jsonStr: string): string {
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      // Common Qwen issues:
      // 1. Trailing commas
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

      // 2. Unquoted keys
      jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

      // 3. Single quotes instead of double
      jsonStr = jsonStr.replace(/'/g, '"');

      return jsonStr;
    }
  }
}
```

### Parallel Call Indexing (KIMI)

**Issue:** KIMI messes up `tool_call.index` in parallel calls

**Mitigation:**
```typescript
class KimiAdapter {
  private reindexToolCalls(calls: ToolCall[]): ToolCall[] {
    return calls?.map((call, index) => ({
      ...call,
      index // Force sequential indexing
    })) || [];
  }
}
```

### Conversation Too Long

**Issue:** After 15+ turns, conversation exceeds token limits

**Mitigation:**
```typescript
async function summarizeConversation(messages: ConversationMessage[]) {
  const recentTurns = messages.slice(-6); // Keep last 3 back-and-forth
  const olderTurns = messages.slice(0, -6);

  // Summarize older turns
  const summary = await llm.call({
    messages: [
      { role: "system", content: "Summarize this conversation concisely" },
      { role: "user", content: JSON.stringify(olderTurns) }
    ]
  });

  return [
    { role: "system", content: systemPrompt, cached: true },
    { role: "system", content: `Previous conversation summary: ${summary}` },
    ...recentTurns
  ];
}
```

---

## Testing Strategy

### Unit Tests

**Tool Implementations:**
```typescript
describe("search_voices tool", () => {
  it("returns voices matching language", async () => {
    const result = await tools.search_voices({ language: "thai", count: 10 });
    expect(result).toHaveLength(10);
    expect(result.every(v => v.language === "thai")).toBe(true);
  });

  it("returns empty array for unsupported language", async () => {
    const result = await tools.search_voices({ language: "klingon" });
    expect(result).toEqual([]);
  });
});
```

**Provider Adapters:**
```typescript
describe("QwenAdapter", () => {
  it("repairs malformed JSON", () => {
    const adapter = new QwenAdapter();
    const malformed = '{language: "thai", count: 10,}';
    const repaired = adapter["repairJSON"](malformed);
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  it("disables streaming for parallel calls", async () => {
    const adapter = new QwenAdapter();
    const response = await adapter.callWithTools(messages, tools, { streaming: true });
    // Should force streaming: false internally
  });
});
```

### Integration Tests

**End-to-End Flow:**
```typescript
describe("Agentic generation flow", () => {
  it("creates drafts via tool calls", async () => {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({
        adId: "test-123",
        brief: { clientDescription: "Spotify Premium", targetAudience: "Thai families" },
        provider: "qwen"
      })
    });

    const data = await response.json();

    expect(data.conversationId).toBeDefined();
    expect(data.drafts.voices).toBe("v1");
    expect(data.drafts.music).toBe("v1");

    // Verify drafts in Redis
    const voiceDraft = await getVersion("test-123", "voices", "v1");
    expect(voiceDraft.voiceTracks.length).toBeGreaterThan(0);
  });

  it("refines drafts via chat", async () => {
    // Initial generation
    const gen = await fetch("/api/ai/generate", { ... });
    const { conversationId } = await gen.json();

    // Refinement
    const chat = await fetch("/api/ads/test-123/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Make the music more upbeat",
        conversationId
      })
    });

    const data = await chat.json();
    expect(data.drafts.music).toBe("v2");

    // Verify new music draft
    const musicDraft = await getVersion("test-123", "music", "v2");
    expect(musicDraft.musicPrompt).toContain("upbeat");
  });
});
```

### Provider Testing

**Language Quality:**
```typescript
const testCases = [
  { language: "thai", provider: "qwen", text: "สวัสดี" },
  { language: "indonesian", provider: "qwen", text: "Selamat datang" },
  { language: "chinese", provider: "kimi", text: "你好" },
  { language: "polish", provider: "qwen", text: "Dzień dobry" },
  { language: "spanish", provider: "qwen", text: "Hola" }
];

for (const test of testCases) {
  describe(`${test.provider} ${test.language} support`, () => {
    it("generates coherent copy", async () => {
      const result = await generateWithProvider(test.provider, {
        brief: `Create ad copy in ${test.language}`
      });

      expect(result.tracks[0].text).toContain(test.text);
      // Manual review required for quality assessment
    });
  });
}
```

---

## Migration Path

### Phase 0: Coexistence

**Current System:**
- `/api/ai/generate` returns JSON (old behavior)
- Frontend parses JSON and populates FormManager

**New System:**
- `/api/ai/generate?v=3` uses tool calling
- Returns conversation ID + draft version IDs
- Frontend loads drafts via version stream APIs

**Benefit:** Both systems work simultaneously during transition

---

### Phase 1: Feature Flag

```typescript
// .env
ENABLE_AGENTIC_LLM=true

// /api/ai/generate
if (process.env.ENABLE_AGENTIC_LLM === "true") {
  return await agenticGeneration(request);
} else {
  return await legacyJSONGeneration(request);
}
```

---

### Phase 2: Gradual Rollout

1. **Week 1:** Internal testing only (ENABLE_AGENTIC_LLM=true for dev)
2. **Week 2:** 10% of users (random selection)
3. **Week 3:** 50% of users
4. **Week 4:** 100% of users
5. **Week 5:** Remove legacy code

**Monitoring:**
- Tool call success rates
- JSON parsing error rate (should drop to 0)
- Token costs per session
- User satisfaction (qualitative feedback)

---

### Phase 3: Deprecation

After 4 weeks of stable operation:
1. Remove legacy JSON parsing code
2. Remove FormManager dual-state logic
3. Update documentation
4. Archive old prompt strategies

---

## Success Metrics

### Technical Metrics

| Metric | Current (JSON) | Target (Agentic) |
|--------|---------------|------------------|
| JSON parse failures | 5-10% | 0% (no parsing) |
| Token cost per session | 15,000 tokens | 7,500 tokens (50% via caching) |
| Voices in system prompt | 100 voices (10k tokens) | 0 (on-demand search) |
| Iteration support | None (full regen) | Conversational refinement |
| Provider flexibility | OpenAI only | OpenAI/Qwen/KIMI unified |

### User Experience Metrics

| Metric | Current | Target |
|--------|---------|--------|
| "Lost best version" complaints | Common | Never (version streams) |
| Time to refine creative | 5 min (regen all) | 30 sec (targeted change) |
| Understanding of LLM actions | Low (black box JSON) | High (see tool calls) |
| Multi-language quality | Poor (APAC markets) | Excellent (Qwen/KIMI) |

---

## Future Enhancements

### Phase 6: Multi-Turn Planning

**Feature:** LLM breaks down complex requests into steps

**Example:**
```
User: "Create 3 variations of this ad with different voice tones"

LLM: "I'll create 3 variations:
1. Calm & professional tone
2. Energetic & youthful tone
3. Warm & friendly tone

Let me start with variation 1..."

[Creates v1 with calm voices]
[Creates v2 with energetic voices]
[Creates v3 with warm voices]

"Done! Review all 3 versions in the voice panel."
```

---

### Phase 7: Proactive Suggestions

**Feature:** LLM suggests improvements without being asked

**Example:**
```
LLM: "I created v1 with 2 voices. I noticed the second voice might benefit from a slower speed for better clarity. Should I create v2 with adjusted speed?"
```

---

### Phase 8: Cross-Panel Reasoning

**Feature:** LLM coordinates between voice/music/SFX for cohesive creative

**Example:**
```
User: "Make the ad feel more urgent"

LLM: [Analyzes current state]
     "To create urgency, I'll:
     - Use faster-paced voices with emphasis
     - Add upbeat, driving music
     - Add countdown SFX ('5, 4, 3, 2, 1')
     Creating coordinated drafts..."
```

---

## Document Status

**Version:** 2.1
**Last Updated:** January 2025
**Status:** Phase 1 Complete - In Progress

**Architecture Decisions Made:**
1. ✅ Conversational continuity chosen for context management
2. ✅ Start with OpenAI + Qwen (defer KIMI pending language verification)
3. ✅ Token cost target: 7,500 per session (50% savings via caching)
4. ✅ Conversation summarization after 10-15 turns
5. ✅ Chat UI will be added later as persistent side panel

**Implementation Progress:**

### ✅ Phase 1 Complete: Tool Infrastructure (Days 1-4)
**Status:** Completed January 2025

**Files Implemented:**
- ✅ `src/lib/tools/types.ts` - Complete type system for tool calling
- ✅ `src/lib/tools/definitions.ts` - OpenAI-compatible tool schemas (5 tools)
- ✅ `src/lib/tools/implementations.ts` - Tool execution functions with Redis integration
- ✅ `src/lib/tools/executor.ts` - Tool orchestration with error handling
- ✅ `src/lib/tools/__tests__/implementations.test.ts` - Unit tests

**Key Implementation Details:**
- Voice search integration with `voiceCatalogueService`
- Direct Redis draft creation for all 3 stream types (voices, music, sfx)
- Proper version metadata (createdAt, createdBy: "llm", status: "draft")
- Type-safe tool call execution with OpenAI-compatible format
- Error handling for edge cases (e.g., empty voice search results)

**Build Status:** ✅ All tool system code compiles successfully with no type errors

---

### 🔄 Phase 2: Provider Adapters (Days 5-8)
**Status:** Ready to begin

**Next Steps:**
1. Create `src/lib/tool-calling/ToolCallingProvider.ts` - Unified interface
2. Create `src/lib/tool-calling/OpenAIAdapter.ts` - OpenAI implementation
3. Create `src/lib/tool-calling/QwenAdapter.ts` - Qwen with JSON repair
4. Create `src/lib/tool-calling/ProviderFactory.ts` - Provider routing

---

### ⏳ Phase 3: Conversation Storage & API Integration (Days 9-12)
**Status:** Pending Phase 2 completion

---

### ⏳ Phase 4: Chat Endpoint & Frontend Integration (Days 13-15)
**Status:** Pending Phase 3 completion

---

**Changes from v2.0:**
- ✅ Completed Phase 1 implementation
- Added implementation status tracking
- Documented key technical decisions made during Phase 1
- Updated build status and verification results
- Ready to proceed with Phase 2

---

## Appendix: Research Summary

### Provider Capabilities Verification

**OpenAI GPT-4/GPT-5:**
- ✅ Native function calling support
- ✅ Prompt caching with 50-90% discounts
- ✅ Full streaming support
- ✅ Most reliable implementation
- ⚠️ Higher cost
- ⚠️ Limited APAC language training

**Qwen-Max:**
- ✅ OpenAI-compatible function calling
- ✅ 119 languages (Thai, Indonesian, Polish, Spanish, Portuguese confirmed)
- ✅ Cost-effective
- ✅ KV cache support
- ⚠️ Streaming + parallel calls has bugs (use non-streaming)
- ⚠️ Requires validation layer for tool call JSON

**Moonshot KIMI:**
- ✅ OpenAI-compatible API
- ✅ Excellent Chinese support
- ✅ Best for agentic workflows (200-300 sequential calls)
- ✅ 2M token context
- ⚠️ Thai/Indonesian support NOT confirmed (needs verification)
- ⚠️ Parallel call indexing issues (requires manual fix)
- ⚠️ Streaming requires manual parsing

**Recommendation:**
- **Primary:** Qwen-Max for multilingual markets
- **Fallback:** OpenAI for critical operations
- **Special:** Moonshot KIMI for Chinese (after language verification)
