# Accounting & Usage Stats

**Location:** `/admin/accounting`
**Tracking Started:** December 16, 2025

---

## Overview

Track API usage and costs across all external providers. The system provides:
- **Real-time usage tracking** - Characters, tokens, tracks consumed per provider
- **Cost estimation** - Monthly subscriptions + pay-as-you-go estimates
- **Cost per ad metric** - Total costs divided by ads generated

---

## Provider Subscriptions

| Provider | Cost/month | Allotment | Unit | Tracking |
|----------|------------|-----------|------|----------|
| **ElevenLabs** | $99 | 565,455 | characters | Live API + internal |
| **Lahajati** | $11 | 1,000,000 | characters | Internal only |
| **Loudly** | $180 | 3,000 | tracks | Internal only |
| **OpenAI TTS** | ~$15/1M chars | Pay-as-you-go | characters | Internal only |

**Total fixed subscriptions:** $290/month + OpenAI usage

### ElevenLabs
- 1 character = 1 credit
- Live balance via `GET /v1/user/subscription`
- Pro plan with usage-based billing enabled

### Lahajati
- 1 point = 1 character
- Premium plan: 1M points + 1,500 voice minutes
- No API - tracked internally

### Loudly
- Per audio file generated
- B2B contract: up to 3,000 tracks/month
- Cache hits don't count against allotment

### OpenAI TTS
- Model: `gpt-4o-mini-tts`
- Estimated: ~$15 per 1M characters
- No subscription - pay-as-you-go

---

## API Endpoints

### GET /api/admin/stats
Monthly ad/project counts.

```bash
curl /api/admin/stats?m=202512
```

Response:
```json
{
  "month": "2025-12",
  "v3": { "total": 150, "inMonth": 42 },
  "v2": { "total": 890, "inMonth": 67 },
  "combined": { "inMonth": 109 }
}
```

### GET /api/admin/usage
Provider usage data with cost calculations.

```bash
curl /api/admin/usage?m=202512
```

Response:
```json
{
  "month": "2025-12",
  "providers": [
    {
      "id": "elevenlabs",
      "name": "ElevenLabs",
      "costPerMonth": 99,
      "allotment": 565455,
      "unit": "characters",
      "used": 45231,
      "requests": 127,
      "usagePercent": 8.0,
      "estimatedCost": null
    },
    {
      "id": "openai",
      "name": "OpenAI TTS",
      "costPerMonth": 0,
      "allotment": null,
      "unit": "characters",
      "used": 125000,
      "requests": 45,
      "estimatedCost": 1.88
    }
  ],
  "totalMonthlyCost": 290,
  "openaiEstimatedCost": 1.88,
  "totalEstimatedCost": 291.88,
  "trackingStarted": "2025-12-16"
}
```

### GET /api/admin/usage/elevenlabs
Live ElevenLabs subscription balance.

```json
{
  "tier": "pro",
  "characterCount": 45231,
  "characterLimit": 565455,
  "remaining": 520224,
  "usagePercent": 8.0,
  "resetDate": "2025-01-01T00:00:00.000Z",
  "status": "active"
}
```

---

## Implementation

### Redis Schema

```
usage:{provider}:{YYYYMM}  →  {
  characters: number,
  tracks: number,
  requests: number,
  cacheHits: number,
  lastUpdated: timestamp
}
```

### Instrumented Providers

| Provider | File | Tracking Call |
|----------|------|---------------|
| ElevenLabs | `src/lib/providers/ElevenLabsVoiceProvider.ts` | `trackVoiceUsage("elevenlabs", text.length)` |
| Lahajati | `src/lib/providers/LahajatiVoiceProvider.ts` | `trackVoiceUsage("lahajati", text.length)` |
| OpenAI | `src/lib/providers/OpenAIVoiceProvider.ts` | `trackVoiceUsage("openai", text.length)` |
| Loudly | `src/lib/providers/LoudlyProvider.ts` | `trackMusicUsage(cached)` |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/usage/tracker.ts` | `trackUsage()`, `trackVoiceUsage()`, `trackMusicUsage()` |
| `src/lib/usage/queries.ts` | `getProviderUsage()`, `getAllUsage()`, subscription config |
| `src/app/api/admin/usage/route.ts` | Usage API with cost calculations |
| `src/app/api/admin/usage/elevenlabs/route.ts` | ElevenLabs live balance proxy |
| `src/app/api/admin/stats/route.ts` | Ad/project counts by month |
| `src/app/admin/accounting/page.tsx` | Admin UI |

---

## Notes

- **Tracking started Dec 16, 2025** - previous months show 0
- **ElevenLabs live balance** always shows current billing period
- **Month picker** filters internal tracking data (not ElevenLabs live)
- **Cost per ad** = (subscriptions + OpenAI estimate) / ads generated

---

## Future Enhancements

- [ ] Usage charts/graphs over time
- [ ] Cost alerts when approaching limits
- [ ] Export usage data to CSV
- [ ] Per-ad cost attribution in history panel
