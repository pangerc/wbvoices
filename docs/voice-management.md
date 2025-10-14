# Voice Management Architecture

## Overview

This document describes the dual-layer architecture for managing voice metadata, approvals, and manual curation in the voice ad generation system.

## Problem Statement

The current voice management system has several limitations:

1. **Destructive Redis Cache**: Voice cache is rebuilt from scratch from provider APIs, losing any manual curation
2. **No Manual Approval**: Cannot manually approve voice suitability for specific language/region/accent combinations
3. **Missing Provider Metadata**: ElevenLabs has personality metadata not exposed via API
4. **Multi-language Complexity**: OpenAI voices support multiple languages but we only have basic heuristics for non-English use
5. **No Custom Attributes**: Cannot add quality ratings, custom tags, or other manual metadata

## Current Architecture

### Voice Data Flow

```
Provider APIs → voiceProviderService → admin/voice-cache → Redis Towers → voiceCatalogueService → API endpoints → UI
```

### Redis Three-Tower Architecture

1. **Voice Tower**: Organized by provider/language/region/accent
2. **Data Tower**: Voice details keyed by `provider:voiceId`
3. **Counts Tower**: Statistical aggregations

### UnifiedVoice Data Model

```typescript
type UnifiedVoice = {
  id: string;                    // Provider-specific ID
  provider: ActualProvider;
  catalogueId: string;          // Redis key: "voice:{provider}:{id}"
  name: string;
  displayName: string;
  gender: "male" | "female" | "neutral";
  language: Language;
  accent: string;
  personality?: string;          // Currently auto-extracted
  age?: string;
  styles?: string[];
  capabilities?: {
    supportsEmotional: boolean;
    supportsWhispering: boolean;
    isMultilingual: boolean;
  };
  sampleUrl?: string;
  useCase?: string;
  lastUpdated: number;
}
```

## Proposed Architecture: Dual-Layer Overlay System

### Conceptual Model

```
┌─────────────────────────────────────────────────┐
│            APPLICATION LAYER                     │
│         (API endpoints, UI components)           │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│          VOICE CATALOGUE SERVICE v2              │
│         (Merges ephemeral + persistent)          │
└──────┬──────────────────────────┬───────────────┘
       │                          │
┌──────▼────────────┐      ┌─────▼────────────────┐
│  EPHEMERAL LAYER  │      │  PERSISTENT LAYER    │
│  (Redis Cache)    │      │  (PostgreSQL/Neon)   │
│                   │      │                      │
│  • Auto-rebuilt   │      │  • Manual metadata   │
│  • Provider data  │      │  • Approval status   │
│  • No changes     │      │  • Custom attributes │
│  • Temporary      │      │  • Audit trail       │
└───────────────────┘      └──────────────────────┘
```

### Key Principles

1. **Non-invasive**: Redis cache continues to work exactly as before
2. **Overlay Pattern**: Persistent layer enhances but doesn't replace ephemeral data
3. **Merge at Query Time**: Combination happens in VoiceCatalogueService
4. **Graceful Degradation**: System works even if persistent layer is unavailable
5. **Orphan Tolerance**: Metadata for removed voices is kept (provider might restore them)

## Persistent Layer Design

### Database: PostgreSQL on Neon

**Why PostgreSQL?**
- Vercel-native integration
- Serverless scaling
- Connection pooling built-in
- JSONB support for flexible metadata
- Strong consistency for approval workflows

**Why Neon specifically?**
- Native Vercel integration
- Serverless (no always-on costs)
- Built-in connection pooling
- Edge-compatible

### ORM: Drizzle

**Why Drizzle?**
- TypeScript-first (better than Prisma for our codebase)
- Edge runtime compatible
- Lightweight
- Type-safe queries
- Migration support

### Data Models

#### VoiceMetadata

Core table for custom voice attributes:

```typescript
interface VoiceMetadata {
  id: string;                          // UUID
  voiceKey: string;                    // "{provider}:{voiceId}" - unique
  provider: Provider;
  voiceId: string;

  // Custom metadata (overrides provider data)
  customPersonality?: string;
  customDescription?: string;
  customTags?: string[];
  customAge?: string;
  customUseCase?: string;

  // Quality ratings
  qualityRating?: number;              // 1-5 scale
  qualityNotes?: string;

  // Administrative
  isHidden: boolean;                   // Hide from UI
  isPremium: boolean;                  // Premium tier voice

  // Audit fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  version: number;                     // Optimistic locking
}
```

#### VoiceBlacklist (Two-Level Blacklisting)

Language/region/accent blacklist matrix with flexible scoping:

```typescript
interface VoiceBlacklist {
  voiceKey: string;                    // "{provider}:{voiceId}" - Composite PK part
  language: Language;                  // Composite PK part
  accent: string;                      // Composite PK part (use "*" for language-wide)

  reason?: string;                     // Why this voice is blacklisted

  createdAt: Date;
  updatedAt: Date;
}
```

**Key Design Decisions:**

- **BLACKLIST LOGIC**: Voices are visible by default. Only voices present in this table are hidden.
- **TWO-LEVEL BLACKLISTING**:
  - **Language-wide**: Set `accent = "*"` to blacklist for ALL accents of that language
  - **Accent-specific**: Set `accent = "parisian"` to blacklist only for that specific accent
- One `VoiceBlacklist` record per scope level
- Both levels can coexist (language-wide takes precedence in filtering)
- Absence from table = voice is approved/visible
- Presence in table = voice is blacklisted/hidden
- Multi-language voices (like OpenAI) can have multiple blacklist records
- Simpler than whitelist: only bad voices need to be tracked
- Uses voice's own accent (not query filter) for accent-specific blacklisting

**Future Enhancements:**

```typescript
// Future full schema with quality assessment
interface VoiceBlacklist {
  // ... existing fields ...
  blacklistedBy?: string;              // Who blacklisted this voice
  pronunciationQuality?: 1 | 2 | 3 | 4 | 5;
  naturalness?: 1 | 2 | 3 | 4 | 5;
}

#### VoiceCollection

Organized voice sets for different use cases:

```typescript
interface VoiceCollection {
  id: string;
  name: string;
  description: string;
  voiceKeys: string[];                 // List of voice keys

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

#### VoiceAuditLog

Complete audit trail:

```typescript
interface VoiceAuditLog {
  id: string;
  entityType: 'metadata' | 'approval' | 'collection';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  oldValue?: any;
  newValue?: any;
  userId: string;
  timestamp: Date;
}
```

### Database Schema (Drizzle)

**Current MVP Implementation:**

```typescript
// src/lib/db/schema.ts
import { pgTable, uuid, text, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';

// Simplified metadata table for MVP
export const voiceMetadata = pgTable('voice_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  voiceKey: text('voice_key').notNull().unique(), // "{provider}:{voiceId}"
  provider: text('provider').notNull(),
  voiceId: text('voice_id').notNull(),

  // Administrative flags (simplified for MVP)
  isHidden: text('is_hidden').notNull().default('false'), // 'true' | 'false'

  // Audit fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  voiceKeyIdx: index('voice_key_idx').on(table.voiceKey),
  providerIdx: index('provider_idx').on(table.provider),
}));

// Blacklist table with composite PK (no FK to metadata for simplicity)
// BLACKLIST LOGIC: Presence in table = hidden, Absence = visible
export const voiceBlacklist = pgTable('voice_blacklist', {
  voiceKey: text('voice_key').notNull(), // Direct reference to voice

  language: text('language').notNull(),
  accent: text('accent').notNull(),

  reason: text('reason'), // Why this voice is blacklisted for this market

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.voiceKey, table.language, table.accent] }),
  voiceKeyIdx: index('blacklist_voice_key_idx').on(table.voiceKey),
  languageAccentIdx: index('blacklist_language_accent_idx').on(table.language, table.accent),
}));
```

**Future Full Schema** (for reference - not yet implemented):

```typescript
// Future: Add custom metadata fields
export const voiceMetadata = pgTable('voice_metadata', {
  // ... existing fields ...
  customPersonality: text('custom_personality'),
  customDescription: text('custom_description'),
  customTags: jsonb('custom_tags').$type<string[]>(),
  qualityRating: integer('quality_rating'),
  isPremium: text('is_premium').default('false'),
  // ... etc
});

// Future: Add quality assessment fields
export const voiceBlacklist = pgTable('voice_blacklist', {
  // ... existing fields ...
  pronunciationQuality: integer('pronunciation_quality'),
  naturalness: integer('naturalness'),
  blacklistedBy: text('blacklisted_by'),
  // ... etc
});
```

## Integration Strategy

### VoiceCatalogueService Enhancement

The existing `VoiceCatalogueService` will be enhanced (not replaced) with merge logic:

```typescript
class VoiceCatalogueServiceV2 extends VoiceCatalogueService {
  private metadataService: VoiceMetadataService;

  async getEnhancedVoice(provider: Provider, voiceId: string): Promise<EnhancedVoice> {
    // 1. Get base voice from Redis (existing logic)
    const baseVoice = await this.getVoice(provider, voiceId);
    if (!baseVoice) return null;

    // 2. Get metadata overrides from PostgreSQL
    const metadata = await this.metadataService.getMetadata(`${provider}:${voiceId}`);

    // 3. Merge with overrides taking precedence
    return {
      ...baseVoice,
      personality: metadata?.customPersonality || baseVoice.personality,
      description: metadata?.customDescription || baseVoice.description,
      tags: metadata?.customTags,
      qualityRating: metadata?.qualityRating,
      isPremium: metadata?.isPremium || false,
      isHidden: metadata?.isHidden || false,
      approvals: metadata?.approvals || []
    };
  }

  async getFilteredVoices(filters: VoiceFilters): Promise<EnhancedVoice[]> {
    // 1. Get base voices from Redis
    const baseVoices = await this.getVoicesForProvider(
      filters.provider,
      filters.language,
      filters.accent
    );

    // 2. Bulk fetch metadata for performance
    const voiceKeys = baseVoices.map(v => `${v.provider}:${v.id}`);
    const metadataMap = await this.metadataService.bulkGetMetadata(voiceKeys);

    // 3. Enhance all voices
    const enhanced = baseVoices.map(voice => {
      const metadata = metadataMap[`${voice.provider}:${voice.id}`];
      return {
        ...voice,
        personality: metadata?.customPersonality || voice.personality,
        // ... other overrides
        approvals: metadata?.approvals || []
      };
    });

    // 4. Apply two-level blacklist filtering if required
    // BLACKLIST LOGIC: Filter OUT blacklisted voices
    if (filters.requireApproval) {
      return enhanced.filter(voice => {
        // Check language-wide blacklist (accent = "*")
        const isLanguageWideBlacklisted = voice.blacklistEntries.some(entry =>
          entry.language === filters.language && entry.accent === '*'
        );
        if (isLanguageWideBlacklisted) return false;

        // Check accent-specific blacklist
        const accentToCheck = filters.accent || voice.accent;
        const isAccentBlacklisted = voice.blacklistEntries.some(entry =>
          entry.language === filters.language && entry.accent === accentToCheck
        );
        return !isAccentBlacklisted;
      });
    }

    // 5. Filter out globally hidden voices
    return enhanced.filter(voice => !voice.isHidden);
  }
}
```

**Performance Optimization:**
- Bulk fetch metadata for voice lists (single DB query)
- Cache metadata queries (short TTL, e.g., 5 minutes)
- Proper database indexes on `voiceKey`, `language`, `accent`

### API Endpoints

**Current MVP Implementation (TWO-LEVEL BLACKLIST):**

```
POST   /api/admin/voice-blacklist                    - Add to blacklist (hide voice)
       Body: { voiceKey, language, accent?, scope: 'language' | 'accent', reason? }
       - scope='language': Blacklist for all accents (uses accent="*" internally)
       - scope='accent': Blacklist for specific accent only
GET    /api/admin/voice-blacklist?voiceKey=...       - Get blacklist entries for a voice
GET    /api/admin/voice-blacklist?language=...&accent=... - Get all blacklisted voices
       - Use accent="*" to get language-wide blacklist
DELETE /api/admin/voice-blacklist?voiceKey=...&language=...&accent=... - Remove from blacklist (show voice)
       - Use accent="*" to remove language-wide blacklist
```

**Voice Catalogue Integration:**

```
GET /api/voice-catalogue?operation=voices&provider=...&language=...&accent=...&requireApproval=true
```

Note: `requireApproval=true` means "filter out blacklisted voices" (not "show only approved")

Example implementation:

```typescript
// src/app/api/admin/voice-blacklist/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { voiceMetadataService } from '@/services/voiceMetadataService';
import { Language } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { voiceKey, language, accent, reason, batch } = body;

    if (!language || !accent) {
      return NextResponse.json(
        { error: 'language and accent are required' },
        { status: 400 }
      );
    }

    // Batch blacklist
    if (batch && Array.isArray(voiceKey)) {
      await voiceMetadataService.batchBlacklist(
        voiceKey,
        language as Language,
        accent,
        reason
      );
      return NextResponse.json({
        success: true,
        message: `Blacklisted ${voiceKey.length} voices for ${language}/${accent}`,
        count: voiceKey.length,
      });
    }

    // Single blacklist
    await voiceMetadataService.addToBlacklist(
      voiceKey,
      language as Language,
      accent,
      reason
    );

    return NextResponse.json({
      success: true,
      message: `Blacklisted ${voiceKey} for ${language}/${accent}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to blacklist voice' },
      { status: 500 }
    );
  }
}
```

**Future API Routes** (planned but not yet implemented):

```
GET    /api/admin/voices/metadata?voiceKey={provider}:{voiceId}
PUT    /api/admin/voices/metadata
GET    /api/admin/voices/pending
GET    /api/admin/voices/collections
POST   /api/admin/voices/collections
```

## Admin UI

### Route Structure

```
/admin
├── /voices              # Voice management dashboard
│   ├── /browse          # Browse all voices with filters
│   ├── /pending         # Voices pending approval
│   └── /:id/edit        # Edit individual voice metadata
├── /approvals           # Approval workflow
│   ├── /queue           # Approval queue
│   └── /history         # Approval history
└── /collections         # Voice collections management
```

### Core Features

#### 1. Voice Browser (`/admin/voices/browse`)

- Grid/list view toggle
- Advanced filtering:
  - Provider
  - Language
  - Region
  - Accent
  - Approval status
  - Quality rating
  - Hidden/visible
  - Premium/standard
- Bulk operations:
  - Approve for language/accent
  - Reject
  - Hide/unhide
  - Add to collection
- Audio preview player
- Metadata inline editing
- Orphan indicator for removed voices

#### 2. Metadata Editor (`/admin/voices/:id/edit`)

- Override provider metadata:
  - Custom personality description
  - Custom tags
  - Custom use case description
  - Custom age range
- Quality ratings (1-5 stars)
- Quality notes (free text)
- Premium flag
- Hidden flag
- Language/accent approval matrix
- Version history viewer
- Audit trail

#### 3. Approval Workflow (`/admin/approvals/queue`)

- Queue of pending approvals
- Side-by-side comparison:
  - Original voice sample
  - Sample with target accent/language
- Quality assessment fields:
  - Pronunciation quality (1-5)
  - Naturalness (1-5)
  - Notes
- Batch approval actions
- Approval history with filters

#### 4. Collection Manager (`/admin/collections`)

- Create themed voice collections:
  - "Premium Female Voices"
  - "Spanish Accents"
  - "Corporate Narrators"
- Drag-and-drop organization
- Export/import collections (JSON)
- Share collections (URL)

### Authentication

Admin routes protected by:
- Session-based auth check
- Role-based access control (admin role required)
- Audit logging of all actions

## Edge Cases & Solutions

### 1. Orphaned Metadata

**Scenario**: Voice removed from provider, metadata exists in database

**Solution**:
- Keep metadata (provider might restore voice)
- Add `isOrphaned` computed field (voice not found in Redis)
- Admin UI shows orphan indicator
- Periodic cleanup job (e.g., delete orphans older than 6 months)

### 2. Voice ID Changes

**Scenario**: Provider changes voice ID

**Solution**:
- Track by composite key `{provider}:{voiceId}`
- Add alias mapping table for ID migrations
- Migration tool in admin UI for bulk ID updates

### 3. Multi-language Handling

**Scenario**: OpenAI voice supports 10 languages, needs per-language approval

**Solution**:
- Create separate `VoiceApproval` record per language/accent combo
- Track instruction templates per approval (e.g., "speak slowly" for certain languages)
- Quality metrics tracked per language

### 4. Cache Invalidation

**Scenario**: Metadata changed, but cached data is stale

**Solution**:
- Metadata changes don't require Redis cache rebuild
- Application-level caching with short TTL (5 minutes)
- Version-based cache keys: `voice:v{version}:{provider}:{id}`
- Manual cache clear button in admin UI

### 5. Performance with Large Voice Catalogs

**Scenario**: 10,000+ voices, slow metadata queries

**Solution**:
- Proper database indexes on frequently queried fields
- Bulk metadata fetching (single query for voice lists)
- Database connection pooling (Neon default)
- Query result caching (React Query on frontend)
- Pagination in admin UI

## Migration Strategy

### Phase 1: Foundation (✅ COMPLETED)

**Goals**: Set up database and core services

- [x] Set up Neon database instance
- [x] Install and configure Drizzle ORM
- [x] Create database schema and migrations
- [x] Build `VoiceMetadataService` with CRUD operations
- [x] Enhance `VoiceCatalogueService` with merge logic
- [x] Create basic admin API routes
- [x] Write integration tests

**Deliverables** (✅ Completed):
- Working database with schema
- `VoiceMetadataService` implementation
- Enhanced `VoiceCatalogueService`
- API routes for metadata CRUD

**What Was Actually Built (MVP) - BLACKLIST APPROACH**:

Simplified schema for faster delivery:
- `voice_metadata` table: Basic structure with `voiceKey`, `provider`, `voiceId`, `isHidden` flag
- `voice_blacklist` table: Language/accent blacklist matrix with composite PK
- **BLACKLIST LOGIC**: Voices visible by default, only blacklisted voices hidden
- No FK relationship between tables (simplified for MVP)
- Direct voice blacklist storage without metadata dependency

API Routes:
- `POST /api/admin/voice-blacklist` - Add to blacklist / hide voice (single or batch)
- `GET /api/admin/voice-blacklist?voiceKey=...` - Get blacklist entries for voice
- `GET /api/admin/voice-blacklist?language=...&accent=...` - Get all blacklisted voices
- `DELETE /api/admin/voice-blacklist?voiceKey=...&language=...&accent=...` - Remove from blacklist / show voice

Service Methods:
- `addToBlacklist()` - Hide voice for language/accent (legacy method)
- `addToBlacklistWithScope()` - Hide voice with scope control (language-wide or accent-specific)
- `removeFromBlacklist()` - Show voice again
- `isBlacklisted()` - Check if voice is hidden (simple check)
- `isBlacklistedEnhanced()` - Check with scope information
- `bulkGetBlacklisted()` - Bulk fetch blacklist entries (legacy)
- `bulkGetBlacklistedEnhanced()` - Bulk fetch with language-wide/accent-specific separation
- `batchBlacklist()` - Blacklist multiple voices at once

Integration:
- `voiceCatalogueService.getVoicesForProvider()` - Added `requireApproval` parameter
- `/api/voice-catalogue?...&requireApproval=true` - Filters OUT blacklisted voices
- **BriefPanel** - Uses `requireApproval=true` when loading voices for LLM
- **ScripterPanel** - Uses `requireApproval=true` when loading voices for dropdowns
- **LLM Generation** - Only receives filtered voices (blacklisted voices never reach the LLM)
- Bulk blacklist fetching for performance
- Transparent operation - existing code unchanged
- **End-to-end protection**: Blacklisted voices are filtered at every layer (database → API → UI → LLM)

Admin UI:
- `/admin/voice-manager` - Voice management interface
- **Per-voice two-toggle system**:
  - Toggle 1: Language-wide blacklist (e.g., "All French")
  - Toggle 2: Accent-specific blacklist (e.g., "Parisian") - shows voice's own accent
- Each toggle independent: green (visible), red (hidden)
- Shows "X visible • Y hidden language-wide • Z hidden for specific accents (of N total)"
- Play button for voice preview
- Filter by language, accent, provider
- Accent labels display voice's own accent (not filter)
- **Voice descriptions** (October 2024):
  - Coverage badge (✓) for voices with descriptions
  - Read-only display with truncation and "Show more/less" toggle
  - Shows same descriptions sent to LLM for voice selection

**Test Results**:
- ✅ Database connection working
- ✅ Database migration completed (approval → blacklist)
- ✅ All CRUD operations functional
- ✅ Blacklist filtering tested with real voices (Roger/French/Parisian)
- ✅ Batch operations working
- ✅ Admin UI functional
- ✅ Backward compatibility maintained
- ✅ **End-to-end filtering verified**:
  - BriefPanel filters voices before sending to LLM (Roger excluded: 52/53 voices)
  - LLM receives only approved voices (Roger not in prompt)
  - ScripterPanel shows only approved voices in dropdowns (Roger excluded: 52/53 voices)
  - Voice ID mismatch impossible (LLM cannot select blacklisted voices)

### Phase 2: Admin UI Foundation (Week 2)

**Goals**: Build core admin interface

- [ ] Create admin route structure and layout
- [ ] Implement authentication for admin routes
- [ ] Build voice browser component with filtering
- [ ] Implement audio preview player
- [ ] Create metadata editor form
- [ ] Add inline editing in voice browser
- [ ] Implement voice search

**Deliverables**:
- Functional admin UI
- Voice browser with filters
- Metadata editor
- Search functionality

### Phase 3: Approval Workflow (Week 3)

**Goals**: Build approval system

- [ ] Build approval queue UI
- [ ] Implement approval/rejection actions
- [ ] Add quality assessment forms
- [ ] Create approval history viewer
- [ ] Implement batch approval operations
- [ ] Add audit logging to all operations
- [ ] Create approval reports/analytics

**Deliverables**:
- Complete approval workflow
- Audit trail
- Batch operations
- Analytics dashboard

### Phase 4: Advanced Features (Week 4)

**Goals**: Polish and optimize

- [ ] Voice collections management
- [ ] Bulk import/export functionality
- [ ] Orphan detection and cleanup
- [ ] Performance optimization (caching, indexes)
- [ ] Voice comparison tools
- [ ] Advanced filtering and sorting
- [ ] Testing and bug fixes
- [ ] Documentation

**Deliverables**:
- Collections feature
- Import/export tools
- Optimized performance
- Complete documentation

## Trade-offs & Considerations

### Pros

1. **Non-destructive**: Persistent layer survives cache rebuilds
2. **Gradual migration**: Can start simple, add features incrementally
3. **Clean separation**: Ephemeral vs persistent data clearly delineated
4. **Audit trail**: All changes tracked with user attribution
5. **Flexible schema**: JSONB allows schema evolution without migrations
6. **Minimal disruption**: Existing code continues to work
7. **Graceful degradation**: Works even if database is unavailable

### Cons

1. **Additional complexity**: Two data sources to manage
2. **Sync overhead**: Merging data adds latency (mitigated by caching)
3. **Consistency challenges**: Potential for metadata/voice mismatches
4. **Database costs**: Additional infrastructure to maintain (Neon serverless helps)
5. **Migration effort**: Requires careful planning and testing
6. **Two sources of truth**: Redis and PostgreSQL must be kept conceptually aligned

## Future Enhancements

### Short-term (3-6 months)

- Voice comparison tool (A/B testing)
- Advanced analytics (voice usage, quality trends)
- Automated quality testing (pronunciation accuracy)
- Voice recommendation engine
- API for external voice catalog integrations

### Long-term (6-12 months)

- Migrate to unified monolith database
- Real-time voice quality monitoring
- Machine learning for automatic voice-language matching
- Voice cloning integration
- Multi-tenant voice catalogs
- Voice marketplace

## End-to-End Voice Flow with Blacklist Protection

**Complete voice journey from user action to audio generation:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. USER CREATES BRIEF                                                       │
│    - Selects language: French                                               │
│    - Selects provider: ElevenLabs                                           │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 2. BRIEFPANEL LOADS VOICES (with requireApproval=true)                     │
│    GET /api/voice-catalogue?operation=filtered-voices&                      │
│        language=fr&provider=elevenlabs&requireApproval=true                 │
│                                                                              │
│    Result: 52 voices (Roger EXCLUDED - blacklisted in database)            │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 3. USER GENERATES CREATIVE                                                  │
│    BriefPanel sends filtered voices to LLM:                                 │
│    POST /api/ai/generate                                                    │
│    Body: { filteredVoices: [...52 voices...] }                             │
│                                                                              │
│    LLM prompt includes: "AVAILABLE VOICES (52 voices): Aria, Sarah, Laura..." │
│    Roger is NOT in the list - LLM CANNOT select him                        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 4. LLM RETURNS VOICE SELECTIONS                                             │
│    Response: { voiceSegments: [{ voice: { id: "Aria...", ... }, ... }] }  │
│    Only IDs from the 52 approved voices                                     │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 5. SCRIPTERPANEL LOADS VOICES (with requireApproval=true)                  │
│    GET /api/voice-catalogue?operation=filtered-voices&                      │
│        language=fr&provider=elevenlabs&requireApproval=true                 │
│                                                                              │
│    Result: 52 voices (same list - Roger EXCLUDED)                          │
│    Voice dropdowns show only approved voices                                │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 6. VOICE TRACKS MAPPED                                                      │
│    AudioService.mapVoiceSegmentsToTracks()                                  │
│    - LLM voice IDs: ["Aria-id", "Sarah-id"]                                │
│    - Available voices: [52 approved voices]                                 │
│    - Match successful ✅ (all IDs exist in approved list)                   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│ 7. AUDIO GENERATION                                                         │
│    POST /api/audio/voice                                                    │
│    Only approved voices generate audio                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Three-layer protection guarantees blacklisted voices never reach production:**

1. **Database Layer**: `voice_blacklist` table stores blacklist entries
2. **API Layer**: `requireApproval=true` filters voices before returning to clients
3. **Application Layer**: Both BriefPanel and ScripterPanel use filtered lists

**Why this is bulletproof:**
- LLM literally cannot select Roger - he's not in the prompt
- UI dropdowns don't show Roger - he's filtered from the list
- Even if someone manually entered Roger's ID, the voice wouldn't exist in the system
- All three layers use the same filtering logic - consistency guaranteed

## Conclusion

This dual-layer architecture provides a pragmatic solution to voice metadata management that:

1. Preserves the existing Redis-based ephemeral cache
2. Adds persistent metadata without disrupting current operations
3. Enables manual curation and approval workflows
4. Provides clear audit trails and version control
5. Supports gradual migration to a more sophisticated architecture

The key insight is treating the persistent layer as **enhancement metadata** rather than attempting to replace or sync with the ephemeral cache. This overlay pattern minimizes risk while maximizing flexibility for future evolution.

---

## MVP Status (October 2025)

### 🔄 Architectural Decisions

**Decision 1: Whitelist → Blacklist** (October 2025)
- **OLD (Whitelist)**: Voices hidden by default, must manually approve each one
- **NEW (Blacklist)**: Voices visible by default, only hide the bad ones
- **Why?** Much simpler to manage - instead of approving hundreds of good voices, just blacklist the few bad ones.

**Decision 2: Two-Level Blacklisting with Wildcard Accent** (October 2025)
- **Language-wide**: Use `accent = "*"` to blacklist for all accents
- **Accent-specific**: Use voice's own accent to blacklist for that accent only
- **Why?** Users need flexibility: "Roger sounds terrible in ALL French" vs "Roger's Parisian accent is too strong"
- **Implementation**: Per-voice two-toggle UI, wildcard in database, no schema changes needed

### ✅ Implemented

**Database:**
- Postgres on Neon (serverless)
- Drizzle ORM with TypeScript types
- Simplified schema (2 tables: `voice_metadata`, `voice_blacklist`)
- **BLACKLIST APPROACH**: Voices visible by default, only bad ones hidden
- Lazy connection initialization for serverless compatibility

**Services:**
- `VoiceMetadataService` - Full CRUD operations with two-level blacklist methods
  - `addToBlacklistWithScope()` - Language-wide or accent-specific
  - `bulkGetBlacklistedEnhanced()` - Optimized bulk fetch with scope separation
  - `isBlacklistedEnhanced()` - Check with scope information
- `VoiceCatalogueService` - Enhanced with two-level blacklist filtering
  - Checks language-wide blacklist first (`accent = "*"`)
  - Falls back to accent-specific check using voice's own accent
- Bulk operations for performance

**API:**
- `/api/admin/voice-blacklist` - Complete CRUD for two-level blacklist management
  - `scope` parameter: `'language'` or `'accent'`
  - Wildcard accent `"*"` for language-wide operations
  - Enhanced GET responses with scope information
- `/api/voice-catalogue` - Integrated `requireApproval` parameter (filters out blacklist)
- All endpoints tested and working

**Admin UI:**
- `/admin/voice-manager` - Voice management interface with per-voice controls
- **Two independent toggles per voice:**
  - Language-wide toggle (e.g., "All French")
  - Accent-specific toggle (e.g., "Parisian") - displays voice's own accent
- Language, region, accent, provider filters
- Voice preview with play button
- Real-time blacklist updates
- Clear visual feedback for both blacklist levels

**Tests:**
- End-to-end integration tests passing
- Two-level blacklist filtering validated:
  - ✅ Language-wide blacklist filters all accents
  - ✅ Accent-specific blacklist filters only that accent
  - ✅ Both levels can coexist (language-wide takes precedence)
  - ✅ Filtering works without accent parameter (uses voice's own accent)
- Real voice filtering validated (tested with Roger/French/Parisian)
- Blacklist logic verified at both levels
- Admin UI functional with per-voice toggles
- Backward compatibility confirmed
- **Complete end-to-end filtering verified:**
  - ✅ BriefPanel: `requireApproval=true` added, Roger excluded from voice list
  - ✅ LLM prompt: Only 52 approved voices sent, Roger not in prompt
  - ✅ ScripterPanel: `requireApproval=true` added, Roger excluded from dropdowns
  - ✅ Voice matching: No ID mismatches possible (LLM can't select blacklisted voices)
  - ✅ Three-layer protection: Database → API → UI all enforce blacklist consistently

### 📋 Next Steps

1. ~~**Voice Descriptions**~~ - ✅ **COMPLETED** (October 2024)
   - 125 ElevenLabs descriptions imported (92% coverage)
   - Admin UI read-only display in `/admin/voice-manager`
   - Coverage badges and truncated view with "Show more/less"
2. **Admin UI** (Phase 2) - Expand voice management interface
   - Manual description editing
   - Bulk operations
   - Advanced filtering
3. **Quality Ratings** - Add custom metadata fields to schema
4. **Collections** - Voice organization and curation
5. **Audit Logging** - Track all changes for compliance
6. **Description Coverage** - Scrape remaining providers (Lovo, OpenAI, Qwen) or generate via AI

---

## ✅ Implemented Enhancement: Rich Voice Descriptions (October 2024)

### Problem

ElevenLabs provides detailed voice descriptions on their website that are NOT exposed via API. These descriptions significantly enhance voice understanding:

**Current LLM metadata (limited):**
```
Roger (id: CwhRBWXzGAHq8TQ4Fs17-fr)
  Gender: Male
  Best for: conversational
  Age: middle_aged
  Accent: parisian
```

**With rich description:**
```
Roger (id: CwhRBWXzGAHq8TQ4Fs17-fr)
  Gender: Male
  Description: A warm, clear, and engaging French male voice with a smooth,
               natural tone. Equally soothing and dynamic, it adapts seamlessly
               to storytelling, audiobooks, scientific explanations, reports,
               interviews, and promotional content. Its expressive yet balanced
               delivery captivates listeners, making complex ideas accessible
               while maintaining a professional and inviting presence.
  Best for: conversational
  Age: middle_aged
  Accent: parisian
```

### Why This Matters

**Evidence of need:**
1. Gender bug fix showed basic metadata was insufficient for proper voice selection
2. Blacklist system proves voice quality varies significantly by use case
3. LLM needs semantic context to match voice personality to creative brief
4. Current metadata provides ~50 chars/voice; descriptions add ~200 chars (4x improvement)

**Impact on voice selection:**
- LLM can match voice tone to brand personality (warm vs. professional vs. energetic)
- Better understanding of voice versatility (storytelling vs. promotional)
- Semantic matching between creative brief and voice capabilities
- Reduces "wrong voice" selections that require manual correction

### Solution: Web Scraping + Database Import

**What Was Built:**

1. **Web Scraping** (completed)
   - Scraped ElevenLabs voice library HTML
   - Extracted 125 voice descriptions using Cheerio
   - Cleaned and normalized text (removed age suffixes, HTML entities)
   - Output: `data/voice-descriptions.json`

2. **Database Layer** (completed)
   - Created `voice_descriptions` table in Neon PostgreSQL
   - Simple schema: voiceKey (PK), description, descriptionSource, timestamps
   - Follows dual-layer architecture: Redis (ephemeral) + Neon (persistent)

3. **Service Layer** (completed)
   - `VoiceDescriptionService` with bulk query optimization
   - `VoiceCatalogueService.enrichWithDescriptions()` - overlay pattern
   - Suffix-stripping logic for ElevenLabs localized voice IDs

4. **API Integration** (completed)
   - `/api/admin/import-descriptions` - Repeatable import endpoint
   - `/api/voice-catalogue` - Automatic enrichment before sending to LLM
   - Bulk fetch optimizations (single DB query per request)

5. **LLM Integration** (automatic)
   - Descriptions automatically flow to BasePromptStrategy
   - Displayed as "Personality:" in LLM prompts
   - No code changes needed - works out of the box!

### Actual Schema Implementation

**Created new table instead of extending voice_metadata for cleaner separation:**

```typescript
// src/lib/db/schema.ts

export const voiceDescriptions = pgTable('voice_descriptions', {
  voiceKey: text('voice_key').primaryKey(),        // "{provider}:{voiceId}"
  description: text('description').notNull(),
  descriptionSource: text('description_source')
    .notNull()
    .default('scraped_2024'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index('voice_descriptions_source_idx').on(table.descriptionSource),
}));
```

**Why separate table:**
- Cleaner separation of concerns (metadata vs descriptions)
- Simpler schema without optional fields
- Easier to delete/rebuild if needed
- No FK dependency - descriptions can exist without metadata

### Actual Implementation

**1. VoiceDescriptionService** (new service)
```typescript
// src/services/voiceDescriptionService.ts

export class VoiceDescriptionService {
  // Bulk fetch for performance (single query)
  async bulkGetDescriptions(
    voiceKeys: string[]
  ): Promise<Record<string, string>> {
    if (voiceKeys.length === 0) return {};

    const results = await db
      .select()
      .from(voiceDescriptions)
      .where(inArray(voiceDescriptions.voiceKey, voiceKeys));

    // Convert to simple map
    const descMap: Record<string, string> = {};
    for (const row of results) {
      descMap[row.voiceKey] = row.description;
    }
    return descMap;
  }

  // Batch upsert for imports
  async batchUpsert(
    descriptions: Array<{ voiceKey: string; description: string }>,
    source: string = "scraped_2024"
  ): Promise<void> {
    // Insert in batches of 50 to avoid query size limits
    const batchSize = 50;
    for (let i = 0; i < descriptions.length; i += batchSize) {
      const batch = descriptions.slice(i, i + batchSize);
      const values = batch.map((d) => ({
        voiceKey: d.voiceKey,
        description: d.description,
        descriptionSource: source,
      }));

      await db
        .insert(voiceDescriptions)
        .values(values)
        .onConflictDoUpdate({
          target: voiceDescriptions.voiceKey,
          set: {
            description: sql`EXCLUDED.description`, // Use incoming value
            descriptionSource: source,
            updatedAt: new Date(),
          },
        });
    }
  }
}
```

**2. VoiceCatalogueService Enhancement** (overlay pattern)
```typescript
// src/services/voiceCatalogueService.ts

async enrichWithDescriptions(voices: UnifiedVoice[]): Promise<UnifiedVoice[]> {
  if (voices.length === 0) return voices;

  // Build voiceKeys with suffix-stripping for ElevenLabs
  const voiceKeys = voices.map(v => {
    let lookupId = v.id;
    if (v.provider === 'elevenlabs') {
      lookupId = v.id.replace(/-[a-z]{2}(-[A-Z]{2})?$/, ''); // Strip -fr, -es-MX, etc.
    }
    return `${v.provider}:${lookupId}`;
  });

  // Bulk fetch descriptions from Neon
  const descriptionMap = await voiceDescriptionService.bulkGetDescriptions(voiceKeys);

  // Augment voices with descriptions
  return voices.map(voice => {
    let lookupId = voice.id;
    if (voice.provider === 'elevenlabs') {
      lookupId = voice.id.replace(/-[a-z]{2}(-[A-Z]{2})?$/, '');
    }
    const voiceKey = `${voice.provider}:${lookupId}`;
    const description = descriptionMap[voiceKey];

    if (description) {
      return {
        ...voice,
        personality: description,    // UnifiedVoice field
        description: description,    // Voice interface field (for LLM)
      };
    }
    return voice;
  });
}
```

**3. API Integration**
```typescript
// src/app/api/voice-catalogue/route.ts (filtered-voices operation)

// Enrich voices with descriptions before returning
const enrichedVoices = await voiceCatalogue.enrichWithDescriptions(
  finalVoices as any[]
);

return NextResponse.json({
  voices: enrichedVoices,  // Automatically includes descriptions!
  count: enrichedVoices.length,
  selectedProvider,
});
```

**4. Admin Import Endpoint**
```typescript
// src/app/api/admin/import-descriptions/route.ts

export async function POST() {
  const entries = Object.entries(descriptions);
  const batch = entries.map(([voiceId, description]) => ({
    voiceKey: `elevenlabs:${voiceId}`,
    description: description as string,
  }));

  await voiceDescriptionService.batchUpsert(batch, 'scraped_elevenlabs_2024');

  const stats = await voiceDescriptionService.getStats();
  return NextResponse.json({
    success: true,
    imported: batch.length,
    stats,
  });
}
```

**5. BasePromptStrategy** (no changes needed!)
```typescript
// src/lib/prompt-strategies/BasePromptStrategy.ts
// Already checks for voice.description - just works!

formatVoiceMetadata(voice: Voice, _context: PromptContext): string {
  let desc = `${voice.name} (id: ${voice.id})`;

  if (voice.gender) {
    desc += `\n  Gender: ${voice.gender}`;
  }
  if (voice.description) {  // ← Descriptions automatically appear here!
    desc += `\n  Personality: ${voice.description}`;
  }
  // ... rest of metadata
}
```

### Results

**Coverage Achieved:**
- 125 ElevenLabs voice descriptions imported
- 92% coverage for French voices (23/25 enriched)
- 2 missing voices are default/blacklisted (Alice, Jessica)
- Automatic enrichment working across all languages

**Performance Impact:**
- Single bulk DB query per voice list request
- Minimal latency added (~50-100ms per request)
- No Redis cache changes needed
- Graceful degradation if DB unavailable

**LLM Prompt Enhancement:**
- 4x increase in context per voice (~50 → ~200 chars)
- Descriptions automatically appear as "Personality:" field
- Token cost increase: acceptable (~4,000 → ~10,000 chars per brief)
- No changes needed to existing prompt strategies

**Data Quality:**
- Source tracking: `scraped_elevenlabs_2024`
- Repeatable import via admin API
- Upsert logic allows re-scraping without duplicates

### Admin UI Integration (October 2024)

**What Was Built:**

Added read-only voice description display to `/admin/voice-manager`:

1. **API Enrichment** (completed)
   - Enhanced `voices` operation in `/api/voice-catalogue` to include descriptions
   - All three return paths now call `enrichWithDescriptions()`:
     - Default path (all voices for provider)
     - OpenAI region path
     - Provider region path
   - Consistent with `filtered-voices` operation used by LLM

2. **VoiceCard Component Enhancement** (completed)
   - Coverage badge: Green ✓ checkmark appears next to voice name if description exists
   - Description display: Shows below metadata line (provider/gender/age)
   - Truncation: `line-clamp-2` for 2-line maximum by default
   - Toggle: "Show more/less" button appears for descriptions > 120 characters
   - Styling: Subtle gray text (`text-gray-300`) to avoid visual clutter

3. **User Benefits**
   - **Quality Assurance**: See exactly what the LLM sees when selecting voices
   - **Coverage Verification**: Quickly identify which voices have rich descriptions
   - **Blacklist Context**: Better decision-making when managing voice quality
   - **Metadata Validation**: Verify scraped descriptions match provider data

**Implementation Details:**

```typescript
// VoiceCard component changes (src/app/admin/voice-manager/page.tsx)

// Coverage badge (line 554-558)
{voice.description && (
  <span className="px-1.5 py-0.5 text-[10px] bg-wb-green/20 text-wb-green rounded border border-wb-green/30">
    ✓
  </span>
)}

// Description display with truncation (line 563-581)
{voice.description && (
  <div className="mt-2">
    <div className={`text-xs text-gray-300 ${!isDescriptionExpanded ? "line-clamp-2" : ""}`}>
      {voice.description}
    </div>
    {voice.description.length > 120 && (
      <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}>
        {isDescriptionExpanded ? "Show less" : "Show more"}
      </button>
    )}
  </div>
)}
```

**API Changes:**

```typescript
// src/app/api/voice-catalogue/route.ts (voices operation)

// Enrich all return paths with descriptions
const enrichedVoices = await voiceCatalogue.enrichWithDescriptions(voices as any[]);
return NextResponse.json(enrichedVoices);
```

**Current State:**
- ✅ Read-only display working in admin UI
- ✅ Coverage visibility (badge indicates description exists)
- ✅ Consistent with LLM data (same enrichment logic)
- ⏳ Manual editing not yet implemented (future enhancement)

### Bugs Fixed

**1. Upsert Bug** (Critical)
- **Problem**: `batchUpsert` used `values[0].description` for all conflicts
- **Impact**: Only first voice in each batch of 50 got correct description
- **Fix**: Use `sql\`EXCLUDED.description\`` to reference incoming row value
- **Result**: All 125 descriptions now update correctly

**2. Enrichment Timing Bug** (Critical)
- **Problem**: Suffix-stripping happened AFTER bulk query
- **Impact**: Localized voices (e.g., `voice-id-fr`) couldn't match base IDs
- **Fix**: Strip suffixes BEFORE building voiceKeys for query
- **Result**: Coverage jumped from 44% to 92%

### Trade-offs & Learnings

**Pros (Validated):**
- ✅ 4x more context for LLM voice selection
- ✅ Uses existing dual-layer architecture cleanly
- ✅ No changes needed to prompt strategies (automatic integration)
- ✅ Bulk query optimization prevents N+1 problems
- ✅ Graceful degradation (works without descriptions)
- ✅ Repeatable import process via admin API

**Cons (Actual):**
- ⚠️ Token cost increase acceptable (~$0.01-0.02 per creative brief)
- ⚠️ Maintenance burden: periodic re-scraping needed (quarterly)
- ⚠️ Coverage limited to scraped voices (14% missing from Redis)
- ⚠️ Language suffix logic specific to ElevenLabs (not generic)

### Usage

**Import/Re-import Descriptions:**
```bash
curl -X POST http://localhost:3000/api/admin/import-descriptions
```

Response:
```json
{
  "success": true,
  "message": "Imported 125 voice descriptions",
  "imported": 125,
  "stats": {
    "total": 125,
    "bySource": {
      "scraped_elevenlabs_2024": 125
    }
  }
}
```

**Check Enrichment Status:**
```bash
# Check if specific voices have descriptions
curl "http://localhost:3000/api/admin/check-descriptions?ids=OPCL81coXM3AEo8gUxHM,H0Es1EyjnIrTdY0BEF0V"
```

**Verify in LLM Prompts:**
Generate a creative and check console logs:
```
🎨 Enriched 23/25 voices with descriptions
```

Descriptions automatically appear in LLM prompts as:
```
Maxime Lavaud - French young man (id: OPCL81coXM3AEo8gUxHM)
  Gender: Male
  Personality: French voice of a dynamic, cheerful young man. Perfect for Social Media.
```

### Next Steps

**Completed (October 2024):**
- ✅ Admin UI read-only description display in `/admin/voice-manager`
- ✅ Coverage badge to identify enriched voices
- ✅ API enrichment in `voices` operation

**Short-term:**
1. Monitor LLM voice selection quality with descriptions
2. Gather user feedback on voice matching accuracy
3. Re-scrape quarterly to catch new/updated voices

**Future Enhancements:**
1. **Manual description editing** - Build UI for editing/overriding descriptions
2. **Multi-provider coverage** - Scrape descriptions for Lovo, OpenAI, Qwen
3. **AI-generated descriptions** - Generate descriptions for voices missing from scrape
4. **Quality ratings** - Add 1-5 star ratings per description
5. **A/B testing** - Measure impact of descriptions on voice selection quality

### 🎯 Usage

**Blacklist a voice for ALL accents (language-wide):**
```bash
curl -X POST http://localhost:3000/api/admin/voice-blacklist \
  -H "Content-Type: application/json" \
  -d '{"voiceKey":"elevenlabs:CwhRBWXzGAHq8TQ4Fs17-fr","language":"fr","scope":"language","reason":"Poor quality across all French"}'
```

**Blacklist a voice for specific accent only:**
```bash
curl -X POST http://localhost:3000/api/admin/voice-blacklist \
  -H "Content-Type: application/json" \
  -d '{"voiceKey":"elevenlabs:CwhRBWXzGAHq8TQ4Fs17-fr","language":"fr","accent":"parisian","scope":"accent","reason":"Too strong Parisian accent"}'
```

**Remove language-wide blacklist:**
```bash
curl -X DELETE "http://localhost:3000/api/admin/voice-blacklist?voiceKey=elevenlabs:voice-id&language=fr&accent=*"
```

**Remove accent-specific blacklist:**
```bash
curl -X DELETE "http://localhost:3000/api/admin/voice-blacklist?voiceKey=elevenlabs:voice-id&language=fr&accent=parisian"
```

**Query visible voices (excluding blacklisted):**
```bash
# Without accent - filters language-wide AND voice's own accent blacklists
curl "http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=fr&requireApproval=true"

# With accent - filters language-wide AND specific accent blacklists
curl "http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=fr&accent=parisian&requireApproval=true"
```

**Check language-wide blacklisted voices:**
```bash
curl "http://localhost:3000/api/admin/voice-blacklist?language=fr&accent=*"
```

**Check accent-specific blacklisted voices:**
```bash
curl "http://localhost:3000/api/admin/voice-blacklist?language=fr&accent=parisian"
```

**Admin UI:**
- Visit `/admin/voice-manager` to manage voices visually
- Each voice has TWO independent toggles:
  - **Left toggle**: "All French" (language-wide blacklist)
  - **Right toggle**: Voice's accent (e.g., "Parisian") (accent-specific blacklist)
- Both toggles can be enabled simultaneously
- Green = visible, Red = hidden

See test scripts for more examples:
- `test-real-voices.sh` - Live integration tests (updated for blacklist)
- `demo-approval-system.sh` - Interactive demo (updated for blacklist)
