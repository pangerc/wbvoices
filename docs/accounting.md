# Accounting & Usage Stats

## Overview

Track API usage and costs across all external providers. The accounting system combines:
1. **Ad/Project counts** - How many generations per month
2. **API usage tracking** - Characters, tokens, tracks consumed per provider
3. **Subscription costs** - Monthly fees and allotments

---

## Provider Subscriptions

| Provider | Cost/month | Allotment | Unit | Tracking Method |
|----------|------------|-----------|------|-----------------|
| **ElevenLabs** | $99 | 565,455 credits | characters | API query + internal count |
| **OpenAI TTS** | Pay-as-you-go | N/A | ~$0.015/min | API query + internal count |
| **Lahajati** | $11 | 1,000,000 points | characters | Internal count only |
| **Loudly** | $180 | 3,000 tracks | audio files | Internal count only |

### ElevenLabs
- **Model:** 1 character = 1 credit
- **API:** `GET /v1/user/subscription` returns `character_count` and `character_limit`
- **Plan:** Pro ($99/mo) with usage-based billing enabled

### OpenAI TTS
- **Model:** `gpt-4o-mini-tts` at ~$0.015/minute
- **Pricing:** $0.60/M input tokens + $12/M audio output tokens
- **API:** `GET /v1/organization/usage/audio` for usage by date range

### Lahajati
- **Model:** 1 point = 1 character
- **Plan:** Premium ($11/mo) = 1M points + 1,500 voice minutes
- **No API** for balance - must check dashboard manually

### Loudly
- **Model:** Per audio file generated (cache hits don't count)
- **Plan:** B2B contract ($180/mo) = up to 3,000 tracks
- **No API** for usage - we count internally

---

## Implementation Plan

### 1. Redis Schema for Usage Tracking

```
usage:{provider}:{YYYYMM}  →  {
  characters: number,      // ElevenLabs, Lahajati, OpenAI
  tracks: number,          // Loudly
  requests: number,        // All providers
  cacheHits: number,       // Loudly (saved money)
  lastUpdated: timestamp
}
```

### 2. Instrumentation Points

Each provider's `makeRequest()` method will call a tracking function:

```typescript
// After successful API call in each provider:
await trackUsage({
  provider: 'elevenlabs',
  characters: text.length,
  cached: false
});
```

| Provider | File | Metric to Track |
|----------|------|-----------------|
| ElevenLabs | `src/lib/providers/ElevenLabsVoiceProvider.ts` | `text.length` (characters) |
| Lahajati | `src/lib/providers/LahajatiVoiceProvider.ts` | `text.length` (characters) |
| OpenAI TTS | `src/lib/providers/OpenAIVoiceProvider.ts` | `text.length` (characters) |
| Loudly | `src/lib/providers/LoudlyProvider.ts` | +1 track (skip if `cached: true`) |

### 3. New Files to Create

| File | Purpose |
|------|---------|
| `src/lib/usage/tracker.ts` | `trackUsage()` function - logs to Redis |
| `src/lib/usage/queries.ts` | Query functions for aggregating usage |
| `src/app/api/admin/usage/route.ts` | API endpoint for usage data |
| `src/app/api/admin/usage/elevenlabs/route.ts` | Proxy to ElevenLabs subscription API |

### 4. Admin UI Updates

Expand `/admin/accounting` page to show:

```
┌─────────────────────────────────────────────────────────────┐
│  Accounting                              [December 2025 ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SUBSCRIPTIONS                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ ElevenLabs  │ │ Lahajati    │ │ Loudly      │           │
│  │ $99/mo      │ │ $11/mo      │ │ $180/mo     │           │
│  │             │ │             │ │             │           │
│  │ 45,231 used │ │ 12,450 used │ │ 127 tracks  │           │
│  │ / 565,455   │ │ / 1,000,000 │ │ / 3,000     │           │
│  │ (8%)        │ │ (1.2%)      │ │ (4.2%)      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                             │
│  ┌─────────────┐                                           │
│  │ OpenAI TTS  │  Total Monthly Cost: $290 + usage         │
│  │ Pay-as-you-go│                                          │
│  │ $12.45 used │                                           │
│  └─────────────┘                                           │
│                                                             │
│  AD/PROJECT COUNTS                                          │
│  V3 Ads: 42  |  V2 Projects: 67  |  Combined: 109          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Existing: Monthly Ad/Project Counts

**Endpoint:** `GET /api/admin/stats`

Returns the count of ads (V3) and projects (V2) created in a given month.

### Usage

```
/api/admin/stats?m=YYYYMM
```

| Parameter | Format | Example | Description |
|-----------|--------|---------|-------------|
| `m` | `YYYYMM` | `202511` | Month to query (optional, defaults to current month) |

### Response

```json
{
  "month": "2025-11",
  "v3": { "total": 150, "inMonth": 42 },
  "v2": { "total": 890, "inMonth": 67 },
  "combined": { "inMonth": 109 }
}
```

---

## TODO: Future Enhancements

- [ ] Implement usage tracking in providers
- [ ] Create `/api/admin/usage` endpoint
- [ ] Add ElevenLabs API proxy for real-time balance
- [ ] Expand admin UI with usage charts
- [ ] Add cost alerts when approaching limits
