# WB-Voices System Architecture

_Last Updated: September 2025_

## System Overview

WB-Voices generates AI-powered voice advertisements by combining LLM-generated scripts with multi-provider voice synthesis and professional audio mixing.

```
Creative Brief → LLM (GPT-4.1/o3) → Voice Selection → Multi-Provider TTS → Audio Mixing → Export
```

### Key Statistics
- **1,111 total voices** across 5 providers
- **100+ regional accents** for global markets
- **<50ms voice lookups** via Redis architecture
- **99%+ project restoration** success rate

## Voice Generation Pipeline

### 1. Creative Brief Input
Users provide:
- Client description
- Campaign format (ad_read or dialog)
- Language & region selection
- Optional creative direction

### 2. LLM Generation (`/api/ai/generate`)
**Models**: GPT-4.1 (gpt-4.1-2025-01-14), o3

**Input**: Enhanced voice metadata including personality, age, accent, use cases

**Output**: Structured JSON with:
- Voice segments with speaker assignments
- Music prompts (English descriptions)
- Sound effect cues
- Emotional dimensions per provider

### 3. Voice Selection
**Flow**: Language → Region → Accent → Provider

**Auto-Selection Logic**:
- Chinese (zh): Qwen > ByteDance > ElevenLabs > OpenAI
- Other languages: ElevenLabs > OpenAI (Lovo disabled for quality)
- Dialog format requires 2+ voices minimum

### 4. TTS Generation
Multi-provider with automatic failover:
- **ElevenLabs**: Multilingual expansion (71 voices)
- **Lovo**: Disabled (poor quality)
- **OpenAI**: Global fallback (290 voices)
- **Qwen**: Chinese specialist (14 voices)
- **ByteDance**: Cantonese + Chinese (14 voices)

### 5. Audio Mixing
- Timeline-based track mixing
- Music fading (in/out)
- Sound effect placement
- Export to Vercel Blob storage

## Voice Management System

### Redis Three-Tower Architecture

The system uses three Redis keys for instant voice lookups:

#### 1. Voice Tower (`voice_tower`)
Hierarchical organization for fast filtering:
```typescript
{
  [provider]: {
    [language]: {
      [region]: {
        [accent]: string[] // voice IDs
      }
    }
  }
}
```

#### 2. Data Tower (`voice_data_tower`)
Complete voice details:
```typescript
{
  [catalogueId]: UnifiedVoice // "voice:elevenlabs:kim-baker"
}
```

#### 3. Counts Tower (`counts_tower`)
Pre-computed counts for instant UI updates:
```typescript
{
  [language]: {
    [region]: {
      [accent]: {
        elevenlabs: number,
        lovo: number,
        openai: number,
        qwen: number,
        bytedance: number
      }
    }
  }
}
```

### Voice Data Structure

```typescript
type UnifiedVoice = {
  // Identifiers
  id: string;              // Provider-specific ID
  provider: Provider;      // "elevenlabs" | "lovo" | "openai" | "qwen" | "bytedance"
  catalogueId: string;     // Redis key: "voice:{provider}:{id}"

  // Display
  name: string;            // Original voice name
  displayName: string;     // "Rachel (ElevenLabs)"

  // Core attributes
  gender: "male" | "female" | "neutral";
  language: Language;      // ISO code (e.g., "es", "zh", "pl")
  accent: string;          // "mexican", "cantonese", "neutral"
  region: string;          // "latin_america", "hong_kong", "all"

  // Optional metadata
  personality?: string;    // "warm", "professional"
  age?: string;           // "young", "middle_aged"
  useCase?: string;       // "advertisement", "narration"
  sampleUrl?: string;

  // Timestamps
  lastUpdated: number;
}
```

### Provider Integration

#### ElevenLabs (Multilingual Specialist)
- **Voices**: 71 (including 25 Polish)
- **Feature**: Multilingual voice expansion
  - Voices with `verified_languages` create multiple entries
  - Example: One voice → Polish, English, Spanish variants
- **Quality**: Premium, prioritized when available
- **API**: `/api/voice/elevenlabs-v2`

#### Lovo (Disabled)
- **Status**: Excluded from provider options
- **Reason**: Poor voice quality
- **Historical count**: 722 voices (kept in cache for legacy projects)

#### OpenAI (Global Fallback)
- **Voices**: 290
- **Coverage**: All languages, synthetic "neutral" accent
- **Quality**: Consistent baseline
- **Special**: Always included regardless of region filtering
- **API**: `/api/voice/openai-v2`

#### Qwen (Chinese Specialist)
- **Voices**: 14
- **Languages**: Chinese (Mandarin)
- **Priority**: First choice for Chinese content
- **API**: `/api/voice/qwen-v2`

#### ByteDance (Cantonese Specialist)
- **Voices**: 14
- **Languages**: Chinese (Mandarin, Cantonese, Sichuan, Taiwanese), Japanese
- **Special**: Cantonese → Hong Kong region mapping
- **Authentication**: Custom headers (X-Api-App-Id, X-Api-Access-Key, X-Api-Resource-Id)
- **API**: `/api/voice/bytedance-v2`

### Language & Region System

#### Language Normalization
Converts provider-specific codes to unified base languages:
```typescript
// Examples:
"es-AR" → "es"  // Argentinian preserved in accent
"zh-HK" → "zh"  // Cantonese preserved in accent
"pl-PL" → "pl"  // Polish
```

**Type Safety**: Handles non-string values to prevent TypeError

#### Accent Mapping
Maps descriptive accents to regions:
```typescript
{
  // Chinese
  cantonese: "hong_kong",
  mandarin: "china",

  // Spanish
  mexican: "latin_america",
  castilian: "spain",

  // Polish
  polish: "poland",
  mazovian: "poland",
  warsaw: "poland"
}
```

#### Region-Based Filtering
- **Server-side**: `/api/voice-catalogue?operation=filtered-voices`
- **Client hook**: `useVoiceManagerV2`
- **Special case**: OpenAI voices always included (global coverage)

## Audio Pipeline

### Music Generation

#### Loudly (Premium)
- **Quality**: High-quality commercial music
- **API**: `/api/music/loudly`
- **Caching**: Vercel Blob storage
- **Input**: English text prompts
- **Output**: 30s-60s tracks with fade capabilities

#### Mubert (Alternative)
- **Quality**: AI-generated ambient/background
- **API**: `/api/music/mubert`
- **Status Check**: `/api/music/mubert/status`
- **Caching**: Vercel Blob with permanent URLs

### Sound Effects
- **Provider**: ElevenLabs
- **API**: `/api/sfx/elevenlabs-v2`
- **Duration**: Max 3 seconds per effect
- **Format**: English text prompts

### Audio Mixing (`/utils/audio-mixer.ts`)

Timeline-based mixing:
```typescript
type Track = {
  type: 'voice' | 'music' | 'sfx';
  url: string;
  startTime: number;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
}
```

**Default Volumes**:
- Voice: 1.0 (100%)
- Music: 0.15 (15%)
- SFX: 0.35 (35%)

**Mixing Process**:
1. Load all audio tracks
2. Apply volume normalization
3. Position on timeline
4. Apply fades (music/sfx)
5. Render to single file
6. Upload to Vercel Blob

## Project Persistence

### Redis-Based Storage
```typescript
type SavedProject = {
  id: string;
  name: string;
  language: Language;
  region?: string;
  accent?: string;
  provider: Provider;
  campaignFormat: CampaignFormat;

  // Complete state
  brief: string;
  creativeJson: object;
  audioUrls: AudioUrls;
  mixerState: MixerState;

  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

**Key**: `project:{projectId}`

### State Restoration
1. Load project data from Redis
2. Restore voice selections with direct voice passing
3. Reconstruct mixer timeline
4. Re-populate audio URLs
5. Skip unnecessary API calls (<50ms restoration)

## API Routes Reference

### Voice Catalogue (`/api/voice-catalogue`)

**Operations**:
- `stats`: Overall cache statistics
- `counts`: Voice counts per provider for a language
- `voices`: Get voices for specific provider/language
- `regions`: Available regions for a language
- `by-region`: Voices filtered by region
- `region-counts`: Provider counts for language+region
- `provider-options`: UI dropdown options with counts
- `filtered-voices`: Comprehensive server-side filtering

**Example**:
```
GET /api/voice-catalogue?operation=filtered-voices
  &language=zh
  &region=hong_kong
  &campaignFormat=dialog
  &exclude=lovo

Response:
{
  voices: [...],
  count: 2,
  selectedProvider: "bytedance",
  dialogReady: true
}
```

### Admin Operations

#### Voice Cache Builder (`/api/admin/voice-cache`)
- **POST**: Rebuild entire voice cache
- **GET**: Get cache statistics
- **Process**:
  1. Fetch from all provider APIs
  2. Normalize language codes
  3. Map accents to regions
  4. Build three-tower structure
  5. Persist to Redis

#### Voice Statistics (`/api/admin/voice-stats`)
- Language breakdown
- Provider totals
- Regional coverage
- Sample voices

### Provider-Specific Routes

All follow the pattern: `POST /api/voice/{provider}-v2`

**Request**:
```json
{
  "text": "Voice text to generate",
  "voiceId": "provider-specific-id",
  "style": "optional-style",
  "projectId": "project-id"
}
```

**Response**:
```json
{
  "success": true,
  "audioUrl": "https://blob.vercel-storage.com/...",
  "provider": "elevenlabs"
}
```

## Performance Characteristics

### Voice Lookups
- **Redis queries**: <50ms
- **Provider API calls**: Avoided during selection
- **Cache hit rate**: ~95%

### Audio Generation
- **TTS**: 2-5s per voice segment
- **Music**: 10-30s generation time
- **Mixing**: <2s for typical 30s ad

### Project Operations
- **Save**: <100ms (Redis write)
- **Load**: <50ms (Redis read)
- **Restoration**: <100ms (no API calls)

## Security & API Management

### Environment Variables
```bash
# LLM
OPENAI_API_KEY=sk-...

# Voice Providers
ELEVENLABS_API_KEY=...
LOVO_API_KEY=...
QWEN_API_KEY=...
BYTEDANCE_APP_ID=...
BYTEDANCE_ACCESS_TOKEN=...
BYTEDANCE_SECRET_KEY=...

# Music
LOUDLY_API_KEY=...
MUBERT_LICENSE=...

# Storage
BLOB_READ_WRITE_TOKEN=...
REDIS_URL=...
```

### API Key Protection
- All API calls server-side only
- No client exposure
- Edge Runtime compatibility for non-Node.js routes
- Web Crypto API for ByteDance auth

## Error Handling

### Voice Selection Fallbacks
1. Try selected provider
2. Fall back to OpenAI if selected provider fails
3. Return empty array if all providers fail
4. UI shows appropriate error messages

### Audio Generation Errors
- Retry logic for transient failures
- Provider failover for persistent issues
- Graceful degradation (continue without failed tracks)

### Project Restoration
- Validate voice IDs still exist
- Reconstruct from available data if voices missing
- Preserve as much state as possible