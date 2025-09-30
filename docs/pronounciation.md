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

2. **Frontend Storage**: Rules stored in localStorage
   - Single source of truth for UI
   - No complex sync logic
   - Fast, simple, reliable

3. **Backend Auto-Application**: Zero user touchpoints
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

## How It Works

### Flow

```
Admin (/admin/pronunciations)
  ↓
Add/edit rules in simple UI
  ↓
Save → localStorage + ElevenLabs API
  ↓
Voice generation (any language)
  ↓
Backend auto-looks up "Global Brand Pronunciations"
  ↓
Applies to ElevenLabs TTS request
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

**ElevenLabs** (backend):
- Dictionary named "Global Brand Pronunciations"
- Rules stored as PLS internally
- Referenced by ID in TTS requests

## Implementation

### Files

**Core utilities:**
- `src/utils/elevenlabs-pronunciation.ts` - CRUD operations for dictionaries

**Admin UI:**
- `src/app/admin/pronunciations/page.tsx` - Simple rule editor

**API routes:**
- `src/app/api/pronunciation/route.ts` - GET (list), POST (create)
- `src/app/api/pronunciation/[id]/route.ts` - GET, DELETE
- `src/app/api/voice/elevenlabs-v2/route.ts` - Auto-applies global dictionary

**Provider:**
- `src/lib/providers/ElevenLabsVoiceProvider.ts` - Accepts dictionary ID, applies to TTS

### Admin UI Flow

1. **Load**: Fetch rules from localStorage on mount
2. **Edit**: Add/remove/update rules in state
3. **Save**:
   - Delete old dictionary on ElevenLabs (if exists)
   - Create new dictionary with current rules
   - Save rules + dictionary ID to localStorage
4. **Delete All**: Remove from both ElevenLabs and localStorage

### Backend Auto-Application

In `src/app/api/voice/elevenlabs-v2/route.ts`:

```typescript
// On every TTS request:
1. List all dictionaries from ElevenLabs
2. Find dictionary named "Global Brand Pronunciations"
3. If found, inject dictionary ID into request body
4. ElevenLabsVoiceProvider applies it to TTS request
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

1. Go to `/admin/pronunciations`
2. Click "+ Add Rule"
3. Enter: "YSL" → "igrek es el"
4. Click "Save Rules"
5. Done - applies to all future voice generation

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
3. **Update dictionaries**: Must delete + recreate
4. **Multiple dictionaries**: Currently only one global dictionary

### Why These Trade-offs Are OK

1. **Per-language**: Most brands are global - "YSL" pronunciation can be the same or have multiple rules
2. **Fetch rules**: localStorage is our source of truth anyway
3. **Update pattern**: Delete + recreate is clean and simple
4. **Single dictionary**: Covers 95% of use cases, can extend later if needed

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