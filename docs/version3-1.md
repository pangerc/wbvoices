# Version 3: Agentic Tool-Calling Architecture

**Status:** In Development
**Last Updated:** November 29, 2025

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

### Pending
- ⏳ Mixer rebuild from V3 version data
- ⏳ LLM conversation UI for iterations

### Known Issues
- ScripterPanel still reloads voices on accordion expand (component remount)

### Resolved Issues
- ~~Initial generation took ~5 minutes (7 iterations)~~ → Now single iteration
- ~~Ads running over duration budget~~ → Word count constraint added

---

## Next Steps

**A. Per-Track Generation**
- Save generated audio URLs back to Redis version record
- Enable preview playback from persisted URLs

**B. Pipeline to Mixer**
- Activate version → rebuild mixer → display timeline
- Prove end-to-end architecture works

**C. Conversation UI**
- Chat interface for iterative refinement (`/api/ads/[id]/chat`)
- Create new drafts, archive previous versions
- `search_voices` available for recasting requests

**D. APAC Localization (if needed)**
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
