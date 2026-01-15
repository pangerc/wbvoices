# Arabic Voice Generation with Lahajati

This document covers the Arabic-specific aspects of the Lahajati TTS integration.

## Overview

Lahajati is a specialized Arabic TTS provider offering:
- **72 Arabic dialects** (IDs 1-72) with regional sub-variants
- **~1996 performance styles** for prosody control
- **Two input modes**: Structured (Mode 0) vs Custom Prompt (Mode 1)

Unlike other providers (ElevenLabs, OpenAI), Lahajati controls prosody through explicit **dialect IDs** and **performance IDs** rather than inline emotional tags or structured voice instructions.

---

## Dialect System

### Complete Dialect Reference

#### Egyptian Dialects
| ID | Arabic Name | English Name | Use Case |
|----|-------------|--------------|----------|
| 7 | المصرية (القاهرية) | Egyptian Cairo | Standard Cairo dialect |
| 8 | المصرية (عامية القاهرة) | Egyptian Cairo Slang | Youth-oriented, casual |
| 9 | المصرية (إسكندرية) | Egyptian Alexandria | Alexandria region |
| 10 | المصرية (صعيدي) | Egyptian Upper Egypt | Upper Egypt/Sa'idi |

#### Gulf Dialects
| ID | Arabic Name | English Name |
|----|-------------|--------------|
| 2 | السعودية (نجدية) | Saudi Najdi (Central) |
| 3 | السعودية (حجازية) | Saudi Hijazi (Western/Jeddah) |
| 60 | العمانية | Omani |
| 64 | الكويتية | Kuwaiti |
| 67 | البحرينية | Bahraini |
| 69 | القطرية | Qatari |
| 70 | الإماراتية | Emirati (UAE) |

#### Levantine Dialects
| ID | Arabic Name | English Name |
|----|-------------|--------------|
| 12 | السورية (دمشق) | Syrian Damascus |
| 17 | اللبنانية (بيروت) | Lebanese Beirut |
| 22 | الأردنية | Jordanian |
| 26 | الفلسطينية | Palestinian |

#### North African (Maghreb) Dialects
| ID | Arabic Name | English Name |
|----|-------------|--------------|
| 30 | الجزائرية | Algerian |
| 35 | المغربية | Moroccan |
| 40 | التونسية | Tunisian |
| 57 | الليبية | Libyan |

#### Other Arabic Dialects
| ID | Arabic Name | English Name |
|----|-------------|--------------|
| 1 | الفصحى | Modern Standard Arabic (MSA) |
| 44 | العراقية | Iraqi |
| 48 | اليمنية | Yemeni |
| 53 | السودانية | Sudanese |
| 72 | الموريتانية | Mauritanian |

### Dialect Selection Logic

**Resolution Priority:**
1. Explicit `dialectId` from LLM or UI → Use directly
2. Accent code (e.g., "egyptian") → Map via dialect service
3. Fallback → MSA (ID 1)

**Accent-to-Dialect Mapping:**
```
egyptian → 7 (Cairo)
saudi → 2 (Najdi)
syrian → 12 (Damascus)
lebanese → 17 (Beirut)
gulf → 2 (default: Najdi)
maghrebi → 35 (default: Moroccan)
standard → 1 (MSA)
```

---

## Performance Styles

### Key Ad Performance Styles

| ID | Arabic Name | English Name | Use For |
|----|-------------|--------------|---------|
| 1542 | إعلان سيارة | Automotive Ad | **Car/vehicle commercials** |
| 1280 | تكنولوجي متقدم | Tech/Advanced | Tech products, apps, gadgets |
| 1308 | درامي ومثير | Dramatic | Documentary, cinematic ads |
| 1309 | بهدوء ودفء | Calm and Warm | Food, beverage, lifestyle |
| 1565 | ثقة هادئة | Calm Confidence | Banking, insurance, finance |
| 1306 | محايد ومعلوماتي | Neutral/Informative | **Default** - general use |

### Selection Rules for LLM

The LLM follows these rules when selecting performance styles:

```
Car/automotive/vehicle ads → 1542 (ALWAYS)
Tech/gadget/app ads → 1280
Banking/insurance/finance → 1565
Food/beverage/lifestyle → 1309
Documentary/dramatic → 1308
General/unsure → 1306 (default)
```

---

## API Modes

### Mode 0: Structured Control (Preferred)

Used when **no custom voice instructions** provided. Sends explicit IDs.

```json
{
  "text": "النص العربي هنا",
  "id_voice": "voice_123",
  "input_mode": "0",
  "performance_id": "1542",
  "dialect_id": "7"
}
```

**Advantages:**
- Precise, repeatable prosody
- LLM-selected style ensures ad-appropriate delivery
- Dialect-specific pronunciation

### Mode 1: Custom Prompt

Used when user provides **persona instructions** (like OpenAI voice instructions).

```json
{
  "text": "النص العربي هنا",
  "id_voice": "voice_123",
  "input_mode": "1",
  "custom_prompt_text": "Speak in Egyptian Cairo dialect. اقرأ بصوت واثق وحماسي كأنك مذيع سيارات"
}
```

**Note:** In Mode 1, `dialect_id` and `performance_id` are NOT sent. The custom prompt overrides structured control.

---

## Voice Instructions (Persona)

Unlike OpenAI's structured format, Lahajati uses **Arabic role-based descriptions**.

### Format

Arabic persona instructions describe HOW to speak using "كأنك" (as if you are...) constructions.

### Examples

```arabic
اقرأ بصوت واثق وحماسي كأنك مذيع سيارات فاخر
(Read confidently and enthusiastically like a luxury car announcer)

تحدث بهدوء ودفء كأنك تروي قصة لطفل
(Speak calmly and warmly, as if telling a story to a child)

بصوت ثقة هادئة كمستشار مالي محترف
(With calm confidence like a professional financial advisor)
```

### When to Use

- User wants fine-grained persona control
- Custom character voices
- Specific emotional delivery beyond performance styles

**Trade-off:** Using persona instructions switches to Mode 1, losing the precise control of explicit performance IDs.

---

## Data Flow

```
User Brief ("Egyptian automotive ad for Cairo youth")
       ↓
LLM Prompt Strategy (LahajatiPromptStrategy.ts)
  - Receives dialect options with IDs
  - Receives performance styles with selection rules
       ↓
LLM Tool Call (create_voice_draft)
  - dialectId: 7 (Cairo)
  - performanceId: 1542 (Automotive)
       ↓
Redis Storage
  - Track includes dialectId, performanceId
       ↓
UI (VoiceInstructionsDialog)
  - Shows selected dialect in dropdown
  - Shows selected performance in dropdown
  - User can override
       ↓
Audio Generation (voice-utils.ts)
  - Sends dialectId, performanceId to API
       ↓
LahajatiVoiceProvider
  - Resolves IDs (explicit > accent > fallback)
  - Selects Mode 0 (structured) or Mode 1 (custom)
       ↓
Lahajati API
  - Returns audio/mpeg
```

---

## Rate Limiting

### Lahajati API Limits

- **Content Creator Package**: 25 requests per minute
- **Max per_page**: 100

### Solution

```typescript
const LAHAJATI_RATE_LIMIT_DELAY = 2500; // 2.5s = 24 req/min
const LAHAJATI_PER_PAGE = 100;
```

### Request Counts (with per_page=100)

| Resource | Total | Pages | Requests |
|----------|-------|-------|----------|
| Dialects | 116 | 2 | 2 |
| Performances | ~1996 | 20 | 20 |
| Voices | ~339 | 4 | 4 |
| **Total** | - | - | **26** |

Cache refresh completes in ~65-90 seconds.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/providers/LahajatiVoiceProvider.ts` | API integration, mode selection |
| `src/lib/prompt-strategies/LahajatiPromptStrategy.ts` | LLM instructions for dialect/performance |
| `src/services/lahajatiDialectService.ts` | Dialect caching and resolution |
| `src/services/voiceProviderService.ts` | Voice/dialect/performance fetching |
| `src/app/api/lahajati/metadata/route.ts` | UI metadata endpoint |
| `src/lib/tools/definitions.ts` | Tool schema with dialectId/performanceId |
| `src/lib/voice-utils.ts` | Audio generation request building |

---

## Troubleshooting

### "Dialect ID: 1 (resolved from accent)" in logs

**Problem:** Explicit dialectId not being used.

**Check:**
1. Is dialectId stored in Redis track? (Check VoiceInstructionsDialog)
2. Is voice-utils.ts passing dialectId in request body?
3. Is the value a number (not string)?

### Performance style shows "LLM default"

**Problem:** LLM not outputting performanceId.

**Check:**
1. LahajatiPromptStrategy has clear selection rules?
2. Tool definitions include performanceId parameter?
3. Brief mentions ad type (automotive, tech, etc.)?

### Using Mode 1 instead of Mode 0

**Problem:** Custom persona instructions override structured control.

**Solution:** Remove voiceInstructions to use Mode 0 with explicit dialect/performance IDs.

---

## Quick Reference

### Generate Egyptian Automotive Ad

```
Brief: "Egyptian automotive ad for Cairo audience"

Expected LLM output:
- dialectId: 7 (Cairo) or 8 (Cairo Slang for youth)
- performanceId: 1542 (Automotive Ad)
- Clean Arabic text (no [emotional tags])
```

### Override in UI

1. Open voice track settings
2. Select dialect from dropdown (grouped by country)
3. Select performance style from dropdown
4. Optionally add persona instructions (switches to Mode 1)

### Fallback Behavior

If no explicit IDs provided:
- Dialect: Resolved from accent code → MSA (1)
- Performance: Resolved from style tone → Neutral (1306)
