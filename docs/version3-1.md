# Version 3: Agentic Tool-Calling Architecture

**Status:** In Development
**Last Updated:** December 8, 2025

---

## Overview

V3 replaces the brittle JSON-parsing LLM integration with **agentic tool-calling**. The LLM uses tools to search for voices and create drafts directly in Redis, eliminating FormManager and the 4-layer data sync issues.

**Key Changes:**
- LLM calls tools instead of returning JSON
- Redis is single source of truth (no FormManager)
- Immutable version streams for voices, music, SFX
- Single orchestrator: OpenAI GPT-5.1 with Chain-of-Thought continuity

---

## Architecture

### Trust the Conductor

V3 uses **GPT-5.1 as the sole orchestrator**. We trust its Chain-of-Thought reasoning via `previous_response_id` continuity instead of building manual guardrails.

**Philosophy:** The best code is code deleted. We removed ~900 lines of guardrail code (duplicate draft detection, loop detection, context-aware feedback injection) and let CoT handle it.

**Generation Flow:**
```
User Brief
    ↓
BriefPanelV3 → POST /api/ai/generate
    ↓
prefetchVoices() → inject into system prompt
    ↓
runAgentLoop() with OpenAIAdapter
    ↓
┌─────────────────────────────────────────┐
│ Tools:                                   │
│ • search_voices(language, gender, ...)  │
│ • create_voice_draft(adId, tracks)      │
│ • create_music_draft(adId, prompt)      │
│ • create_sfx_draft(adId, effects)       │
│ • get_current_state(adId)               │
└─────────────────────────────────────────┘
    ↓
GPT-5.1 decides when complete (CoT continuity)
    ↓
Redis (V3_REDIS_URL)
```

**Chat Refinement:** Same flow via `/api/ads/[id]/chat`, continues existing conversation from Redis.

---

## Redis Schema

**Key Pattern:** `ad:{adId}:{stream}:v:{versionId}`

```
ad:{adId}:meta                    → { name, brief, createdAt }
ad:{adId}:voices:versions         → ["v1", "v2", "v3"]  (Redis LIST)
ad:{adId}:voices:active           → "v2"                (Redis STRING)
ad:{adId}:voices:v:v1             → { voiceTracks, generatedUrls, status, ... }
ad:{adId}:voices:v:v2             → { ... }

ad:{adId}:music:versions          → ["v1"]
ad:{adId}:music:active            → "v1"
ad:{adId}:music:v:v1              → { musicPrompts, generatedUrl, provider, ... }

ad:{adId}:sfx:versions            → ["v1"]
ad:{adId}:sfx:active              → "v1"
ad:{adId}:sfx:v:v1                → { soundFxPrompts, generatedUrls, ... }

ad:{adId}:mixer                   → { tracks, calculatedTracks, activeVersions }
ad:{adId}:conversation            → [{ role, content, tool_calls }, ...]
```

### Lazy Ad Creation

Ads are **not persisted on page visit**. The ad ID is generated client-side, but Redis write is deferred until:
- **Generate clicked** (primary trigger via `/api/ai/generate`)
- **Manual version created** (secondary trigger via version POST endpoints)

This prevents "Untitled Ad" spam from casual visits or refreshes. Implementation: `src/lib/redis/ensureAd.ts`

---

## Duration Tracking & Mixer

### Accurate Duration Measurement

Voice tracks now have **measured durations** instead of word-count estimation:

```typescript
// VoiceTrack type (src/types/versions.ts)
interface VoiceTrack {
  text: string;
  voice: Voice;
  generatedUrl?: string;
  generatedDuration?: number;  // ← Actual duration in seconds
  // ...
}
```

**Flow:**
1. Voice provider generates audio (ElevenLabs/Lovo)
2. `music-metadata` package parses audio buffer
3. `generatedDuration` saved to Redis with the track
4. Mixer uses real duration for timeline positioning

**Fallback:** Legacy data without `generatedDuration` uses word-count estimation (~2.5 words/sec).

### Server-Authoritative Mixer

The mixer state is calculated server-side and stored in Redis:

```
ad:{adId}:mixer → {
  tracks: [...],           // Raw track data with URLs
  calculatedTracks: [...], // Server-computed timings
  activeVersions: { voices, music, sfx },
  totalDuration: number
}
```

**Data Flow:**
```
Version Activated
    ↓
rebuildMixer() (src/lib/mixer/rebuilder.ts)
    ↓
LegacyTimelineCalculator computes positions
    ↓
Redis: mixer state with calculatedTracks
    ↓
SWR: /api/ads/{id}/mixer
    ↓
MixerPanel: hydrates Zustand from SWR
    ↓
TimelineTrack: renders with server-computed timings
```

**Key Behaviors:**
- Hydration compares track **URLs**, not just IDs (handles re-generation with different providers)
- Audio elements update `src` when URL changes
- Server is source of truth; client doesn't recalculate timings

---

## LLM Provider

**Single orchestrator:** OpenAI GPT-5.1 via Responses API

| Feature | Implementation |
|---------|----------------|
| Model | `gpt-5.1` |
| Tool calling | Native function calling |
| Reasoning | `reasoning.effort: "medium"` |
| Continuity | `previous_response_id` for CoT |
| Caching | 24-hour prompt caching built-in |

**No multi-provider abstraction.** If APAC localization needed later, add `localize_script` tool that calls Qwen/Kimi for text generation only (not orchestration).

---

## Key Files

| Area | Files |
|------|-------|
| **Tool Definitions** | `src/lib/tools/definitions.ts` |
| **Tool Implementations** | `src/lib/tools/implementations.ts` |
| **Tool Executor** | `src/lib/tools/executor.ts` |
| **Agent Loop** | `src/lib/tool-calling/AgentExecutor.ts` (~120 lines) |
| **OpenAI Adapter** | `src/lib/tool-calling/adapters/OpenAIAdapter.ts` |
| **Voice Prefetch** | `src/lib/tool-calling/voicePrefetch.ts` |
| **Prompt Builder** | `src/lib/knowledge/builder.ts` |
| **Knowledge Modules** | `src/lib/knowledge/modules/*.ts` |
| **Redis Operations** | `src/lib/redis/versions.ts` |
| **Conversation Store** | `src/lib/redis/conversation.ts` |
| **V3 Redis Client** | `src/lib/redis-v3.ts` |
| **Generate API** | `src/app/api/ai/generate/route.ts` |
| **Chat API** | `src/app/api/ads/[id]/chat/route.ts` |
| **Version APIs** | `src/app/api/ads/[id]/{voices,music,sfx}/*` |
| **Brief Panel** | `src/components/BriefPanelV3.tsx` |
| **Scripter Panel** | `src/components/ScripterPanel.tsx` |
| **Mixer Rebuilder** | `src/lib/mixer/rebuilder.ts` |
| **Timeline Calculator** | `src/services/legacyTimelineCalculator.ts` |
| **Mixer Panel** | `src/components/MixerPanel.tsx` |
| **Mixer Data Hook** | `src/hooks/useMixerData.ts` |
| **Voice Catalogue** | `src/services/voiceCatalogueService.ts` (tower cache) |
| **Voice Metadata** | `src/services/voiceMetadataService.ts` (blacklist) |

---

## Current Status

### Completed
- ✅ Redis schema with flat keys
- ✅ 15 API endpoints for version streams
- ✅ All 5 tools implemented
- ✅ Knowledge modules for dynamic prompts
- ✅ BriefPanelV3 integration
- ✅ Provider auto-selection by language
- ✅ Track-level provider routing (voice.provider)
- ✅ Death to useVoiceManagerV2 (BriefPanelV3 no longer loads voices)
- ✅ Consolidated `/api/voice-catalogue/language-options` endpoint
- ✅ Blacklist filtering in language options (requireApproval=true)
- ✅ Provider-specific LLM knowledge modules (builder.ts)
- ✅ ScripterPanel simplified to load only version's provider
- ✅ VoiceDraftEditor infers language/provider from voice tracks (not hardcoded)
- ✅ BriefPanelV3 auto-save race condition fixed (waits for initial load)
- ✅ Lazy ad creation (no Redis spam from page visits)

**Simplification (Nov 29, 2025):**
- ✅ Single orchestrator: OpenAI GPT-5.1 only (deleted Qwen/Kimi adapters)
- ✅ CoT continuity via `previous_response_id` (no manual guardrails)
- ✅ Deleted ~900 lines: ProviderFactory, ToolCallingAdapter, loop detection, feedback injection
- ✅ AgentExecutor: 335 → 120 lines
- ✅ Voice prefetch eliminates search_voices round-trip
- ✅ Duration constraint with word count guidance (~2.5 words/sec)
- ✅ Responses API fix: structured `function_call_output` for tool results

**Mixer & Duration (Dec 5, 2025):**
- ✅ Accurate voice duration tracking via `generatedDuration` field
- ✅ `music-metadata` package measures actual audio duration from voice providers
- ✅ Mixer rebuild from V3 version data (`rebuildMixer` in `rebuilder.ts`)
- ✅ Server-calculated timeline positions stored in `calculatedTracks`
- ✅ MixerPanel hydrates from SWR (Redis as source of truth)
- ✅ Hydration detects URL changes, not just track ID changes
- ✅ Audio elements update `src` when track URL changes
- ✅ Music track labels show provider + prompt preview

**Lahajati Integration (Dec 8, 2025):**
- ✅ LahajatiVoiceProvider with dynamic dialect fetching from API
- ✅ 339 Arabic voices, 116 dialects cached in Redis
- ✅ lahajatiDialectService for accent → dialect_id mapping
- ✅ Arabic country name mapping (e.g., "المصرية" → "egyptian" → dialect 7)
- ✅ VoiceInstructionsDialog support with Arabic persona placeholder
- ✅ LLM tool definition updated for Lahajati persona format (not OpenAI structured)
- ✅ `input_mode: "1"` custom prompt support for Arabic role instructions

**Voice Catalogue Performance (Dec 8, 2025):**
- ✅ Promise-based tower cache with 200ms TTL in `voiceCatalogueService.ts`
- ✅ Automatic request-level deduplication (14 calls → 2 Redis fetches)
- ✅ Blacklist pre-fetch per request (1 DB query instead of 5+)
- ✅ `language-options` API: 5-7 seconds → ~300ms
- ✅ LLM `search_voices` tool benefits automatically (no code changes needed)

### Pending
- ⏳ LLM conversation UI for iterations

### Known Issues
- ScripterPanel still reloads voices on accordion expand (component remount)

### Resolved Issues
- ~~Initial generation took ~5 minutes (7 iterations)~~ → Now single iteration
- ~~Ads running over duration budget~~ → Word count constraint added

---

## Next Steps

**A. Conversation UI**
- Chat interface for iterative refinement (`/api/ads/[id]/chat`)
- Create new drafts, archive previous versions
- `search_voices` available for recasting requests

**B. APAC Localization (if needed)**
- Add `localize_script` tool for Thai/Vietnamese/Chinese
- Simple Qwen/Kimi text generation (not orchestration)
- GPT-5.1 remains sole conductor

---

## Environment

```bash
# V3 uses separate Redis instance for safety
V3_REDIS_URL=https://your-v3-instance.upstash.io?token=xxx

# Legacy system (untouched)
REDIS_URL=https://your-prod-instance.upstash.io?token=yyy
```
