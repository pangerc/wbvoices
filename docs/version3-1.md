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
- Multi-provider support (OpenAI, Qwen, Moonshot)

---

## Architecture

### Two-Flow Model

V3 uses different flows for initial generation vs chat refinements:

**Initial Generation (fast path ~30-45s):**
```
User Brief
    ↓
BriefPanelV3 → POST /api/ai/generate
    ↓
prefetchVoices() → inject into prompt
    ↓
AgentExecutor (toolSet: "initial_generation")
    ↓
┌─────────────────────────────────────────┐
│ Tools (search_voices EXCLUDED):          │
│ • create_voice_draft(adId, tracks)      │
│ • create_music_draft(adId, prompt)      │
│ • create_sfx_draft(adId, effects)       │
│ • get_current_state(adId)               │
└─────────────────────────────────────────┘
    ↓
1 iteration: all 3 drafts created in parallel
    ↓
Redis (V3_REDIS_URL)
```

**Chat Refinement (full tools):**
```
User Message ("find me a more mature voice")
    ↓
POST /api/ads/[id]/chat
    ↓
AgentExecutor (toolSet: "chat_refinement")
    ↓
┌─────────────────────────────────────────┐
│ Tools (FULL SET):                        │
│ • search_voices(language, gender, ...)  │
│ • create_voice_draft(adId, tracks)      │
│ • create_music_draft(adId, prompt)      │
│ • create_sfx_draft(adId, effects)       │
│ • get_current_state(adId)               │
└─────────────────────────────────────────┘
    ↓
Redis (V3_REDIS_URL)
```

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

## LLM Providers

| Provider | Status | Use Case |
|----------|--------|----------|
| OpenAI | ✅ Working | Default, tested with tool-calling |
| Qwen-Max | 🔴 Untested | APAC markets |
| Moonshot KIMI | 🔴 Untested | Chinese market |

Provider selection: `src/lib/tool-calling/ProviderFactory.ts`

---

## Key Files

| Area | Files |
|------|-------|
| **Tool Definitions** | `src/lib/tools/definitions.ts` |
| **Tool Implementations** | `src/lib/tools/implementations.ts` |
| **Tool Executor** | `src/lib/tools/executor.ts` |
| **Agent Loop** | `src/lib/tool-calling/AgentExecutor.ts` |
| **Voice Prefetch** | `src/lib/tool-calling/voicePrefetch.ts` |
| **Provider Adapters** | `src/lib/tool-calling/adapters/*.ts` |
| **Prompt Builder** | `src/lib/knowledge/builder.ts` |
| **Knowledge Modules** | `src/lib/knowledge/modules/*.ts` |
| **Redis Operations** | `src/lib/redis/versions.ts` |
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
- ✅ AgentExecutor with tool loop
- ✅ All 5 tools implemented
- ✅ OpenAI adapter with tool-calling
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

**Performance Optimizations (Nov 29, 2025):**
- ✅ Voice prefetch eliminates search_voices round-trip (~7 iterations → 1)
- ✅ Tool set filtering: `initial_generation` excludes search_voices
- ✅ Parallel tool execution (Promise.all instead of sequential)
- ✅ Duplicate draft guard (blocks create_*_draft if draft already exists)
- ✅ Early exit check at start of loop (prevents wasted LLM calls)
- ✅ Lower reasoning effort (`"low"` instead of `"medium"`)
- ✅ Two-flow model: fast initial gen, full tools for chat refinement

### Pending
- ⏳ Mixer rebuild from V3 version data
- ⏳ LLM conversation UI for iterations
- ⏳ Qwen-Max adapter testing
- ⏳ Moonshot KIMI adapter testing

### Known Issues
- ScripterPanel still reloads voices on accordion expand (component remount)

### Resolved Issues
- ~~Initial generation took ~5 minutes (7 iterations)~~ → Now ~30-45s (1 iteration)

---

## Next Steps

**A. Test Performance** (immediate)
- Verify initial generation completes in < 60 seconds
- Monitor iteration count (target: 1)

**B. Per-Track Generation** (next)
- Save generated audio URLs back to Redis version record
- Enable preview playback from persisted URLs

**C. Pipeline to Mixer**
- Activate version → rebuild mixer → display timeline
- Prove end-to-end architecture works

**D. Conversation UI** (later)
- Chat interface for iterative refinement (`/api/ads/[id]/chat`)
- Create new drafts, archive previous versions
- `search_voices` available for recasting requests

---

## Environment

```bash
# V3 uses separate Redis instance for safety
V3_REDIS_URL=https://your-v3-instance.upstash.io?token=xxx

# Legacy system (untouched)
REDIS_URL=https://your-prod-instance.upstash.io?token=yyy
```
