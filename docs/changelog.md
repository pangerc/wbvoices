# WB-Voices System Changelog

## September 2025

### ByteDance Provider Integration
**Added**: ByteDance TTS provider for Chinese and Cantonese voices

**Features**:
- 14 voices (Chinese Mandarin, Cantonese, Sichuan, Taiwanese, Japanese)
- Cantonese → Hong Kong region mapping
- Custom authentication headers (non-standard Bearer token)

**Implementation Details**:
- API route: `/api/voice/bytedance-v2`
- Authentication: X-Api-App-Id, X-Api-Access-Key, X-Api-Resource-Id
- Request format: Requires `app.appid`, `app.cluster`, `request.reqid`
- Edge Runtime: Migrated to Web Crypto API for compatibility

**Challenges Overcome**:
- Field name mismatches (`app_id` → `appid`, `cluster_id` → `cluster`)
- Missing `request.reqid` field
- Authentication header format (not Bearer token)
- Edge Runtime crypto incompatibility

### Polish Voice Multilingual Expansion Fix
**Fixed**: ElevenLabs Polish voices not appearing in cache

**Root Cause**: `TypeError: locale.match is not a function`
- Some ElevenLabs voices had non-string values in `verified_languages` array
- `normalizeLanguageCode()` tried to call `.match()` on non-string
- Entire `/api/voice/list?provider=elevenlabs` request crashed with 500 error
- Cache builder received 0 voices instead of 71

**Solution**:
1. Added type guard to `normalizeLanguageCode()`:
   ```typescript
   if (typeof locale !== 'string' || !locale) {
     return "en";
   }
   ```

2. Added filtering in voice list route:
   ```typescript
   .filter((lang) => typeof lang === 'string' && lang)
   ```

**Result**: 25 Polish voices restored (from 71 total ElevenLabs voices)

### Voice Count Consistency Fixes
**Fixed**: Inconsistent voice counts between provider dropdown and status display

**Root Cause**: Two different counting systems
- Provider dropdown used `getVoiceCountsByRegion()` ✅ Included ByteDance
- Status text used `getVoicesByRegion()` ❌ Missing ByteDance in provider iteration

**Solution**:
- Updated `getVoicesByRegion()` to include ByteDance in provider loop
- Added ByteDance to `useVoiceManagerV2` VoiceCounts initialization
- Fixed `uploadVoiceToBlob()` type to accept 'bytedance' provider

**Files Modified**:
- `/src/services/voiceCatalogueService.ts:213` - Added 'bytedance' to provider iteration
- `/src/hooks/useVoiceManagerV2.ts:283` - Added bytedance count extraction
- `/src/hooks/useVoiceManagerV2.ts:88` - Added bytedance to initial state
- `/src/utils/blob-storage.ts:111` - Added 'bytedance' to type union

### Build Error Fixes
**Fixed**: TypeScript errors in admin routes

**Changes**:
- `/src/app/api/admin/voice-stats/route.ts`:
  - Replaced `any` types with proper type definitions
  - Changed `let` to `const` for immutable variables
  - Removed unused `totalVoicesByLanguage` variable
  - Added default values for optional voice properties

## August 2025

### Voice Management System Refactor (Complete Overhaul)
**Status**: ✅ Production

**Business Impact**:
- 1,111 total voices (was ~500)
- <50ms voice lookups (was 500ms+ API cascades)
- 99%+ project restoration success (was ~60%)
- 100+ regional accents for global markets

#### Phase 1: Redis Three-Tower Architecture
**Implemented**: Hierarchical voice storage system

**Architecture**:
```
voice_tower       # provider → language → region → accent → voice IDs
voice_data_tower  # catalogueId → full UnifiedVoice object
counts_tower      # language → region → accent → provider counts
```

**Benefits**:
- 3 Redis keys instead of 1000+ individual entries
- Instant voice filtering by language/region/accent
- Pre-computed counts for real-time UI updates
- Efficient project restoration

**Files Created**:
- `/src/services/voiceCatalogueService.ts` - Core Redis service
- `/src/app/api/voice-catalogue/route.ts` - Client-facing API
- `/src/app/api/admin/voice-cache/route.ts` - Cache builder

#### Phase 2: Language-First UI Flow
**Changed**: From provider-first to language-first selection

**Old Flow**:
```
Provider → Voice → (hope it works for your language)
```

**New Flow**:
```
Language → Region → Accent → Provider (auto-selected with counts)
```

**Implementation**:
- `/src/hooks/useVoiceManagerV2.ts` - New hook with Redis integration
- `/src/components/BriefPanel.tsx` - Redesigned UI flow
- `/src/utils/providerSelection.ts` - Smart provider selection logic

**Features**:
- Real-time provider counts update with accent selection
- "Any Provider" option showing total available voices
- Dialog format validation (2+ voices required)
- Chinese language priority: Qwen > ByteDance > ElevenLabs > OpenAI

#### Phase 3: Accent Discovery & Regional Coverage
**Breakthrough**: URL extraction from Lovo samples revealed hidden accents

**Discovery Method**:
```typescript
// Extract region from sample URL
const sampleUrl = "https://storage.googleapis.com/lovo-tts-public/samples/es-MX/maria.mp3"
const region = url.match(/samples\/([^\/]+)/)?.[1] // "es-MX"
```

**Results**:
- LATAM: Mexican, Argentinian, Colombian, Chilean Spanish
- MENA: Kuwaiti, Saudi, Egyptian, Moroccan Arabic
- Europe: Polish, Portuguese, Greek accents
- Asia: Cantonese, Taiwanese, Sichuan Chinese

**Accent Mappings Added**:
```typescript
{
  // Spanish
  mexican: "latin_america",
  castilian: "spain",
  argentinian: "latin_america",

  // Arabic
  kuwaiti: "gulf",
  saudi: "gulf",
  egyptian: "north_africa",

  // Chinese
  cantonese: "hong_kong",
  taiwanese: "taiwan",
}
```

#### Phase 4: Project Restoration Overhaul
**Fixed**: Broken project restoration causing 40% failure rate

**Root Cause**:
- API cascades on every restoration
- Voice ID mismatches after provider changes
- State dependencies causing race conditions

**Solution**:
- Direct voice passing from Redis
- Voice ID validation with fallback
- Bypass state updates during restoration
- AbortController for request cancellation

**Performance**:
- Before: 2-5s restoration with 40% failures
- After: <100ms restoration with 99%+ success

#### Phase 5: Legacy Cleanup
**Removed**: Old voice manager system (August 14, 2025)

**Deleted Files**:
- `/src/hooks/useVoiceManager.ts` (1000+ lines)
- All references to legacy voice manager
- Provider-first UI components

**Benefits**:
- Eliminated code duplication
- Reduced bundle size by ~50KB
- Cleaner architecture
- Single source of truth

### CTA (Call-to-Action) Integration
**Added**: Technical export compliance and CTA buttons

**Features**:
- Configurable CTA text and URL
- Spotify-specific regional compliance
- Export restrictions enforcement
- CTA validation in creative generation

### Pacing Instructions (OpenAI)
**Enhanced**: Speech pacing control for OpenAI voices

**Options**:
- `default`: Normal pacing
- `slow`: 75% speed for clarity

**Integration**: Passed to LLM for natural pacing instructions

### Time Limits Update
**Adjusted**: Campaign duration constraints

**Previous**: Fixed 30s limit
**Current**: Flexible based on format and market

### Better ElevenLabs Language Coverage
**Expanded**: Multilingual voice support

**Changes**:
- Added Polish language mappings (mazovian, warsaw → pl-PL)
- Implemented verified_languages expansion
- Created multiple voice entries per language
- Enhanced voice personality metadata

**Data Files Added**:
- `elevenlabs-raw-2025-09-18T08-37-22-692Z.json` (14,794 voices raw)
- `elevenlabs-processed-2025-09-18T09-41-19-518Z.json` (7,449 processed)

## July 2025

### Initial Voice Provider Integration
**Launched**: Multi-provider TTS system

**Providers**:
- ElevenLabs (premium quality)
- Lovo (wide language coverage)
- OpenAI (reliable fallback)

**Architecture**:
- Provider factory pattern
- Individual API routes per provider
- Vercel Blob storage for audio caching

### Music Generation Integration
**Added**: Loudly and Mubert for background music

**Features**:
- English text-to-music prompts
- 30s-60s track generation
- Fade in/out support
- Permanent URL caching

### Audio Mixing Pipeline
**Implemented**: Timeline-based audio mixing

**Capabilities**:
- Multi-track mixing (voice, music, sfx)
- Volume normalization
- Fade effects
- Export to single file

## Key Architectural Decisions

### Why Redis Over Individual Keys?
**Decision**: Use 3-tower structure instead of 1000+ individual voice keys

**Rationale**:
- **Performance**: 50ms vs 500ms for voice filtering
- **Memory**: 3 keys vs 1000+ keys reduces overhead
- **Maintenance**: Single cache rebuild vs individual updates
- **Scalability**: Adding providers doesn't multiply keys

**Trade-offs Accepted**:
- More complex cache building logic
- Requires full rebuild for provider updates
- Slightly larger individual key sizes

### Provider Priority Logic
**Decision**: Language-based provider hierarchy

**Chinese Priority**:
1. Qwen (native Chinese TTS)
2. ByteDance (Cantonese specialist)
3. ElevenLabs (multilingual quality)
4. OpenAI (fallback)

**Other Languages**:
1. ElevenLabs (best quality)
2. OpenAI (always available)

**Rationale**:
- Chinese content benefits from native TTS
- ElevenLabs provides best quality for dialog
- OpenAI ensures no language is unsupported
- Lovo disabled due to poor voice quality

### Edge Runtime vs Node.js
**Decision**: Mixed approach based on provider needs

**Edge Runtime** (when possible):
- Faster cold starts
- Lower latency
- Better scalability

**Node.js Runtime** (when required):
- Node-specific APIs (crypto, fs)
- Complex authentication
- Binary processing

**ByteDance Case Study**:
- Started with Edge Runtime
- Hit `crypto` module error
- Migrated auth to Web Crypto API
- Kept Edge Runtime for performance

### Server-Side Filtering
**Decision**: All voice filtering happens server-side

**Before** (client-side):
- Load all voices to client
- Filter in JavaScript
- Inconsistent results
- Poor performance

**After** (server-side):
- Filter in Redis queries
- Return only needed voices
- Consistent across components
- <50ms response time

**Benefits**:
- Single source of truth
- No client-side data processing
- Reduced network payload
- Better error handling

## Removed Features

### Lovo Provider (Disabled August 2025)
**Reason**: Poor voice quality compared to alternatives

**Status**: Excluded from provider options but kept in cache for legacy projects

**Voice Count**: 722 voices (no longer selectable)

### Legacy Voice Manager (Removed August 2025)
**Reason**: Superseded by VoiceManagerV2 with Redis integration

**Files Deleted**:
- `/src/hooks/useVoiceManager.ts`
- All legacy voice manager references

### Provider-First UI Flow (Removed August 2025)
**Reason**: Poor UX, users care about language first

**Replaced With**: Language → Region → Accent → Provider flow

## Future Considerations

### Potential Enhancements
1. **Voice Quality Ratings**: User feedback on voice quality
2. **A/B Testing**: Provider performance comparison
3. **Cost Optimization**: Provider selection based on pricing
4. **Caching Strategy**: Long-term audio cache with CDN
5. **Accent Learning**: ML-based accent preferences per market

### Known Limitations
1. **Lovo Disabled**: Lost 722 voices but improved quality
2. **Cache Rebuild**: Full rebuild needed for provider updates (2-3s)
3. **Edge Runtime**: Some providers require Node.js runtime
4. **Multilingual IDs**: ElevenLabs creates duplicate-looking voices with language suffix

### Migration Notes
- Old projects with Lovo voices will fallback to OpenAI
- Voice IDs changed for ElevenLabs multilingual (added language suffix)
- Cache format change requires full rebuild (automatic on deploy)