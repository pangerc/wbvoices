# Pronunciation Dictionary System

## Problem Statement

When generating voice ads for international brands, TTS systems often mispronounce brand names, acronyms, and foreign words. For example:
- "YSL" needs to be pronounced differently across languages (e.g., "igrek es el" in Polish)
- "Yves Saint Laurent" needs proper French pronunciation
- Product names, technical terms, and local expressions need custom pronunciation

ElevenLabs provides pronunciation dictionary support via their API, allowing us to define custom pronunciations that are applied during text-to-speech generation.

## Simplified Architecture

After exploring ElevenLabs' API constraints, we opted for a **single global dictionary** approach:

### Key Design Decisions

1. **One Dictionary**: "Global Brand Pronunciations"
   - Contains all brand pronunciation rules
   - Applied automatically to every ElevenLabs TTS request
   - No per-language splitting (brands are global)

2. **Dual Storage**: Rules stored in localStorage + Redis
   - localStorage: Frontend UI state
   - Redis: Backend persistence & cross-provider access
   - Synced automatically on save
   - Fast, simple, reliable

3. **Integrated UI**: Embedded in ScripterPanel
   - Contextual access when using ElevenLabs
   - Tab toggle pattern (script ↔ pronunciation)
   - No separate admin page needed

4. **Backend Auto-Application**: Zero user touchpoints
   - No dictionary selection UI
   - No project-level storage
   - Just works™

### Why This Approach?

**ElevenLabs API Limitations:**
- Dictionaries have NO language metadata (language-agnostic)
- GET/LIST endpoints don't return rules (only metadata)
- Rules require separate PLS download endpoint
- Can't update dictionaries (must delete + recreate)

**Pragmatic Decision:**
- Most brands (YSL, BMW, L'Oréal) need consistent pronunciation
- Language-specific variants (if needed) can use separate rules
- One global dictionary is simpler than complex per-language management
- Avoids syncing our structured data with ElevenLabs' flat model

### Why Redis Storage?

**The localStorage Bug:**
- Initial implementation tried to access `localStorage` from server-side code
- This broke OpenAI voice generation: `ReferenceError: localStorage is not defined`
- `localStorage` only exists in browsers, not in API routes/Edge runtime

**Redis Solution:**
- Backend-accessible storage that works in all environments
- Already used by `/api/pronunciation` endpoints
- Enables pronunciation rules for **any** voice provider (not just ElevenLabs)
- OpenAI injects rules as voice instructions; ElevenLabs uses dictionary IDs
- Zero performance impact (Redis is fast and cached)

## How It Works

### Flow

```
ScripterPanel (when ElevenLabs is selected)
  ↓
Switch to "Pronunciation" tab
  ↓
Add/edit rules in integrated UI
  ↓
Save → localStorage + Redis + ElevenLabs API
  ↓
Voice generation (ElevenLabs or OpenAI)
  ↓
Backend fetches rules from Redis
  ↓
ElevenLabs: Applies dictionary ID to TTS request
OpenAI: Injects rules as voice instructions
  ↓
Correct pronunciation in output
```

### Storage Model

**localStorage** (frontend):
```json
{
  "rules": [
    { "stringToReplace": "YSL", "type": "alias", "alias": "igrek es el" },
    { "stringToReplace": "Yves Saint Laurent", "type": "alias", "alias": "iw sen loran" }
  ],
  "dictionaryId": "dict_abc123",
  "timestamp": 1234567890
}
```

**Redis** (backend):
```json
{
  "rules": [
    { "stringToReplace": "YSL", "type": "alias", "alias": "igrek es el" },
    { "stringToReplace": "Yves Saint Laurent", "type": "alias", "alias": "iw sen loran" }
  ],
  "dictionaryId": "dict_abc123",
  "timestamp": 1234567890
}
```
Key: `pronunciation:global_rules`

**ElevenLabs** (backend):
- Dictionary named "Global Brand Pronunciations"
- Rules stored as PLS internally
- Referenced by ID in TTS requests

## Implementation

### Files

**Core utilities:**
- `src/utils/elevenlabs-pronunciation.ts` - CRUD operations for ElevenLabs dictionaries
- `src/utils/server-pronunciation-helper.ts` - Server-safe helper for fetching rules from Redis and injecting into voice instructions (used by OpenAI)

**UI Components:**
- `src/components/PronunciationEditor.tsx` - Pronunciation rule editor component
- `src/components/ScripterPanel.tsx` - Integrates pronunciation editor via tab toggle (only visible when ElevenLabs provider is selected)

**API routes:**
- `src/app/api/pronunciation/route.ts` - GET (list), POST (create), syncs to Redis
- `src/app/api/pronunciation/[id]/route.ts` - GET, DELETE
- `src/app/api/voice/elevenlabs-v2/route.ts` - Auto-applies global dictionary
- `src/app/api/voice/openai-v2/route.ts` - Fetches rules from Redis via provider

**Providers:**
- `src/lib/providers/ElevenLabsVoiceProvider.ts` - Accepts dictionary ID, applies to TTS
- `src/lib/providers/OpenAIVoiceProvider.ts` - Fetches rules from Redis, injects as voice instructions

### Editor UI Flow

1. **Access**: Available in ScripterPanel when ElevenLabs is selected as voice provider
2. **Load**: Fetch rules from localStorage on mount
3. **Edit**: Add/remove/update rules in state
4. **Save**:
   - Delete old dictionary on ElevenLabs (if exists)
   - Create new dictionary with current rules
   - Save rules + dictionary ID to localStorage
   - Sync rules + dictionary ID to Redis (via `/api/pronunciation`)
5. **Delete All**: Remove from ElevenLabs, localStorage, and Redis

### Backend Auto-Application

**ElevenLabs** (`src/app/api/voice/elevenlabs-v2/route.ts`):
```typescript
// On every TTS request:
1. List all dictionaries from ElevenLabs
2. Find dictionary named "Global Brand Pronunciations"
3. If found, inject dictionary ID into request body
4. ElevenLabsVoiceProvider applies it to TTS request
```

**OpenAI** (`src/lib/providers/OpenAIVoiceProvider.ts`):
```typescript
// On every TTS request:
1. Fetch pronunciation rules from Redis
2. Filter rules that match strings in the script text
3. Inject as voice instructions (e.g., "Pronounce 'YSL' as 'igrek es el'")
4. Send to OpenAI TTS API with instructions
```

No language checking, no conditional logic - just works.

## API Reference

### ElevenLabs Endpoints Used

**Create Dictionary:**
```
POST https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules
{
  "name": "Global Brand Pronunciations",
  "rules": [
    {
      "string_to_replace": "YSL",
      "type": "alias",
      "alias": "igrek es el"
    }
  ]
}
```

**List Dictionaries:**
```
GET https://api.elevenlabs.io/v1/pronunciation-dictionaries
Returns: Array of dictionary metadata (no rules!)
```

**Delete Dictionary:**
```
DELETE https://api.elevenlabs.io/v1/pronunciation-dictionaries/{id}
```

**Apply in TTS:**
```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
{
  "text": "YSL is amazing",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": { ... },
  "pronunciation_dictionary_locators": [
    { "pronunciation_dictionary_id": "dict_abc123" }
  ]
}
```

### Our API Endpoints

**List dictionaries:**
```
GET /api/pronunciation
Returns: Metadata only (rules in localStorage)
```

**Create dictionary:**
```
POST /api/pronunciation
{
  "name": "Global Brand Pronunciations",
  "rules": [
    { "stringToReplace": "YSL", "type": "alias", "alias": "igrek es el" }
  ]
}
```

**Delete dictionary:**
```
DELETE /api/pronunciation/{id}
```

## Usage Examples

### Adding a Brand Pronunciation

1. In any project, navigate to the "Scripter" step
2. Select "ElevenLabs" as your voice provider
3. Click the "Pronunciation" tab (speech icon)
4. Click "+ Add Rule"
5. Enter: "YSL" → "igrek es el"
6. Click "Save Rules"
7. Done - applies to all future voice generation

**Note**: The pronunciation editor is currently only visible when ElevenLabs is selected as the voice provider (UI limitation), but pronunciation rules work for **both ElevenLabs and OpenAI** voice generation thanks to Redis storage.

### Testing Pronunciation

Use the test endpoint (for development):

```bash
curl -X POST http://localhost:3000/api/admin/pronunciation-test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "YSL is launching a new campaign",
    "cleanup": false
  }'
```

Returns two audio URLs:
- Without dictionary (baseline)
- With dictionary (custom pronunciation)

## Limitations & Trade-offs

### What We Can't Do

1. **Per-language dictionaries**: ElevenLabs has no language concept
2. **Fetch rules from ElevenLabs**: Need PLS download (not implemented)
3. **Update dictionaries**: Must delete + recreate (ElevenLabs limitation)
4. **Multiple dictionaries**: Currently only one global dictionary
5. **UI visibility**: Pronunciation editor only shows for ElevenLabs (though rules work for all providers)

### Why These Trade-offs Are OK

1. **Per-language**: Most brands are global - "YSL" pronunciation can be the same or have multiple rules
2. **Fetch rules**: Redis is our source of truth (localStorage for UI state only)
3. **Update pattern**: Delete + recreate is clean and simple
4. **Single dictionary**: Covers 95% of use cases, can extend later if needed
5. **UI visibility**: Users typically edit rules with ElevenLabs selected; rules automatically apply to OpenAI too

## Future Enhancements

### If We Need More Complexity

1. **Multiple dictionaries**: Allow different dictionaries for different contexts
   - "Luxury Brands", "Tech Products", "Medical Terms"
   - Admin UI: Tabs or dropdown to switch between dictionaries
   - Backend: Support multiple dictionary IDs (ElevenLabs allows up to 3)

2. **Language-specific rules**: Add language filtering in UI
   - Still one dictionary, but group rules by language visually
   - E.g., "YSL (Polish)" vs "YSL (English)"

3. **PLS download**: Implement fetching rules from ElevenLabs
   - Useful for verifying what's actually applied
   - Requires parsing W3C PLS XML format

4. **Project-level overrides**: Allow per-project custom dictionaries
   - For client-specific terms
   - Would need project data model changes

### Nice-to-haves

- **Bulk import/export**: Upload CSV of brand names
- **Pronunciation suggestions**: LLM generates phonetic spellings
- **Audio preview**: Test pronunciation before saving
- **Rule validation**: Check for conflicting rules

## References

- [ElevenLabs Pronunciation Dictionaries API](https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries)
- [W3C Pronunciation Lexicon Specification](https://www.w3.org/TR/pronunciation-lexicon/)
- [IPA (International Phonetic Alphabet)](https://en.wikipedia.org/wiki/International_Phonetic_Alphabet)