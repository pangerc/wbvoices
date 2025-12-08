# Lovo v2 Pro Integration Attempt (Failed)

**Status:** Blocked - awaiting actual v2 Pro API from Lovo
**Branch:** `feature/lovo-v2-pro-attempt`
**Date:** 2025-01-16

## The Goal

Upgrade from Lovo v1 API to v2 Pro voices to access creative instruction capabilities similar to ElevenLabs v3. These instructions allow inline tags like:

```
[laughing and joking around] Check this out!
[read like a professor who is super sick and old]
[british accent] Hello there
[whispering, then shouting] This is amazing!
```

Lovo v2 Pro supposedly supports 30+ emotions and complex character directions.

## What We Tried

### Attempt #1: API Version Change (FAILED)
**Hypothesis:** "Pro V2" means API version 2

**Changes:**
- Changed speakers endpoint: `v1/speakers` → `v2/speakers/pro`
- Changed TTS endpoints: `v1/tts/sync` → `v2/tts/sync`
- Created `LovoV2ProPromptStrategy` with creative instruction mapping
- Re-enabled Lovo across 6 locations in codebase

**Result:** ❌ 404 errors - `/api/v2/tts/sync` doesn't exist

### Attempt #2: Pro Speaker Filtering (FAILED)
**Hypothesis:** Pro V2 is a voice type, not API version. Filter by `speakerType === "pro"`

**Changes:**
- Reverted all endpoints back to v1
- Added filter in voice list endpoint: `if (speaker.speakerType !== "pro") continue;`
- Kept creative instruction strategy

**Result:** ❌ Tags were read aloud ("laughing and joking around" spoken literally)

**User feedback:**
> "the tags are being read aloud. v1 obvs doesn't do the v2 pro stuff"

### Attempt #3: Finding True Pro V2 Voices (BLOCKED)
**Hypothesis:** `speakerType === "pro"` includes both old "Pro" and new "Pro V2" voices

**Investigation:**
- Checked Lovo's web UI voice selector
- Found distinct categories: **Pro V2**, Rapid, **Pro**, Global, Multilingual, Emotional
- Discovered French has **ZERO Pro V2 voices** in their catalog
- Tested French voices "Alain Hamel" and "Albertine Dubois" - both read tags aloud

**Conclusion:**
- `speakerType === "pro"` catches old Pro voices that DON'T support creative instructions
- No API field distinguishes Pro V2 from regular Pro
- Many languages lack Pro V2 voices entirely

## Why It Failed

### 1. API Doesn't Distinguish Pro V2
The `/api/v1/speakers` endpoint returns:
```json
{
  "speakerType": "pro",  // ← Both old Pro AND Pro V2 return this
  // No "version", "capabilities", or "tier" field
}
```

We need a way to identify which speakers actually support creative instructions.

### 2. Limited Language Coverage
From Lovo's web UI, Pro V2 voices are only available for:
- English
- Spanish
- Maybe a few others

**NOT available for:**
- French (0 voices)
- Most exotic languages we need

### 3. Documentation Gap
Lovo's API docs at https://docs.genny.lovo.ai lack:
- How to identify Pro V2 voices programmatically
- How to enable creative instructions (special parameter? different endpoint?)
- Which speakers support which features
- List of Pro V2 availability by language

## What We Need From Lovo

To make this work, we need **at least one** of:

1. **API field to identify Pro V2:**
   ```json
   {
     "speakerType": "pro",
     "version": "v2",  // ← This
     "supportsCreativeInstructions": true  // ← Or this
   }
   ```

2. **Dedicated v2 Pro endpoint:**
   ```
   GET /api/v2/speakers/pro  ← Returns only Pro V2 voices
   POST /api/v2/tts/creative  ← Endpoint that processes tags
   ```

3. **Documentation showing:**
   - Exact filter criteria for Pro V2 voices
   - How to enable creative instruction processing
   - Language coverage for Pro V2

## Work Preserved

All integration work is saved in branch: `feature/lovo-v2-pro-attempt`

**Commit:** `b1c887b` - "WIP: Lovo v2 Pro integration attempt (blocked - no Pro V2 API access)"

**Changes included:**
- ✅ Re-enabled Lovo in BriefPanel, ScripterPanel, VoiceManager
- ✅ Created `LovoV2ProPromptStrategy` with comprehensive creative instruction mapping
- ✅ Updated `PromptStrategyFactory` to use v2 Pro strategy
- ✅ Added Pro speaker filtering (though insufficient)
- ✅ Updated provider selection hierarchy

**To restore if Lovo fixes API:**
```bash
git checkout feature/lovo-v2-pro-attempt
# Apply fixes based on their documentation
git checkout main
git merge feature/lovo-v2-pro-attempt
```

## Current Status

Lovo remains **disabled** in main branch with comments:
```typescript
url.searchParams.set("exclude", "lovo"); // Lovo disabled due to poor quality
```

Should be changed to:
```typescript
// Lovo Pro V2 disabled pending API support for creative instructions
```

## References

- Lovo API Docs: https://docs.genny.lovo.ai
- Lovo Sync TTS: https://docs.genny.lovo.ai/reference/sync-tts
- User examples provided: `[laughing and joking around]`, `[read like a professor who is super sick]`, etc.
- Lovo web UI: Shows "Pro V2" as distinct category from "Pro"

## Lessons Learned

1. **Marketing vs API reality:** "Pro V2" is marketed feature, but API doesn't expose it
2. **Documentation matters:** Without clear API docs, integration is guesswork
3. **Test early:** Should have checked web UI for language coverage before implementing
4. **Branch early:** Isolating experimental work was the right call

## Next Steps

**Option 1:** Contact Lovo support (hello@lovo.ai) asking for:
- How to programmatically identify Pro V2 speakers
- How to enable creative instruction processing via API
- Roadmap for Pro V2 language coverage

**Option 2:** Wait for Lovo to update docs/API

**Option 3:** Abandon Lovo integration and focus on ElevenLabs + OpenAI for quality coverage

---

*Note: This document serves as both a postmortem and a blueprint for future attempts once Lovo provides proper API access.*
