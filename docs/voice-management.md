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

#### VoiceBlacklist (Implemented as Blacklist, not Whitelist)

Language/region/accent blacklist matrix:

```typescript
interface VoiceBlacklist {
  voiceKey: string;                    // "{provider}:{voiceId}" - Composite PK part
  language: Language;                  // Composite PK part
  accent: string;                      // Composite PK part

  reason?: string;                     // Why this voice is blacklisted

  createdAt: Date;
  updatedAt: Date;
}
```

**Key Design Decisions:**

- **BLACKLIST LOGIC**: Voices are visible by default. Only voices present in this table are hidden.
- One `VoiceBlacklist` record per voice/language/accent combination that should be HIDDEN
- Absence from table = voice is approved/visible
- Presence in table = voice is blacklisted/hidden
- Multi-language voices (like OpenAI) can have multiple blacklist records
- Region is optional (language + accent may be sufficient)
- Simpler than whitelist: only bad voices need to be tracked

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

    // 4. Apply blacklist filtering if required
    // BLACKLIST LOGIC: Filter OUT blacklisted voices
    if (filters.requireApproval) {
      return enhanced.filter(voice => {
        // Keep voice if NOT in blacklist for this language/accent
        const isBlacklisted = voice.blacklistEntries.some(entry =>
          entry.language === filters.language &&
          (!filters.accent || entry.accent === filters.accent)
        );
        return !isBlacklisted;
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

**Current MVP Implementation (BLACKLIST APPROACH):**

```
POST   /api/admin/voice-blacklist                    - Add to blacklist (hide voice)
GET    /api/admin/voice-blacklist?voiceKey=...       - Get blacklist entries for a voice
GET    /api/admin/voice-blacklist?language=...&accent=... - Get all blacklisted voices
DELETE /api/admin/voice-blacklist?voiceKey=...&language=...&accent=... - Remove from blacklist (show voice)
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
- `addToBlacklist()` - Hide voice for language/accent
- `removeFromBlacklist()` - Show voice again
- `isBlacklisted()` - Check if voice is hidden
- `bulkGetBlacklisted()` - Bulk fetch blacklist entries
- `batchBlacklist()` - Blacklist multiple voices at once

Integration:
- `voiceCatalogueService.getVoicesForProvider()` - Added `requireApproval` parameter
- `/api/voice-catalogue?...&requireApproval=true` - Filters OUT blacklisted voices
- Bulk blacklist fetching for performance
- Transparent operation - existing code unchanged

Admin UI:
- `/admin/voice-blacklist` - Voice management interface
- Green toggles by default (visible)
- Red toggles when blacklisted (hidden)
- Shows "X visible, Y hidden (of Z total)"
- Play button for voice preview
- Filter by language, accent, provider

**Test Results**:
- ✅ Database connection working
- ✅ Database migration completed (approval → blacklist)
- ✅ All CRUD operations functional
- ✅ Blacklist filtering tested with real voices
- ✅ Batch operations working
- ✅ Admin UI functional
- ✅ Backward compatibility maintained

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

### 🔄 Architectural Decision: Whitelist → Blacklist

**Key Change**: Flipped from approval/whitelist to blacklist approach for better UX:

- **OLD (Whitelist)**: Voices hidden by default, must manually approve each one
- **NEW (Blacklist)**: Voices visible by default, only hide the bad ones

**Why?** Much simpler to manage - instead of approving hundreds of good voices, just blacklist the few bad ones.

### ✅ Implemented

**Database:**
- Postgres on Neon (serverless)
- Drizzle ORM with TypeScript types
- Simplified schema (2 tables: `voice_metadata`, `voice_blacklist`)
- **BLACKLIST APPROACH**: Voices visible by default, only bad ones hidden
- Lazy connection initialization for serverless compatibility

**Services:**
- `VoiceMetadataService` - Full CRUD operations with blacklist methods
- `VoiceCatalogueService` - Enhanced with blacklist filtering
- Bulk operations for performance

**API:**
- `/api/admin/voice-blacklist` - Complete CRUD for blacklist management
- `/api/voice-catalogue` - Integrated `requireApproval` parameter (filters out blacklist)
- All endpoints tested and working

**Admin UI:**
- `/admin/voice-blacklist` - Voice management interface
- Language, region, accent, provider filters
- Voice preview with play button
- Toggle switches (green = visible, red = hidden)
- Real-time blacklist updates

**Tests:**
- End-to-end integration tests passing
- Real voice filtering validated
- Blacklist logic verified
- Admin UI functional
- Backward compatibility confirmed

### 📋 Next Steps

1. **Admin UI** (Phase 2) - Build browser interface for voice management
2. **Quality Ratings** - Add custom metadata fields to schema
3. **Collections** - Voice organization and curation
4. **Audit Logging** - Track all changes for compliance

### 🎯 Usage

**Blacklist a voice (hide it):**
```bash
curl -X POST http://localhost:3000/api/admin/voice-blacklist \
  -H "Content-Type: application/json" \
  -d '{"voiceKey":"elevenlabs:voice-id","language":"es","accent":"mexican","reason":"Poor pronunciation"}'
```

**Remove from blacklist (show it again):**
```bash
curl -X DELETE "http://localhost:3000/api/admin/voice-blacklist?voiceKey=elevenlabs:voice-id&language=es&accent=mexican"
```

**Query visible voices (excluding blacklisted):**
```bash
curl "http://localhost:3000/api/voice-catalogue?operation=voices&provider=elevenlabs&language=es&accent=mexican&requireApproval=true"
```

**Check blacklisted voices:**
```bash
curl "http://localhost:3000/api/admin/voice-blacklist?language=es&accent=mexican"
```

**Admin UI:**
- Visit `/admin/voice-blacklist` to manage voices visually
- All voices show as green/visible by default
- Toggle to red to blacklist/hide a voice

See test scripts for more examples:
- `test-real-voices.sh` - Live integration tests (updated for blacklist)
- `demo-approval-system.sh` - Interactive demo (updated for blacklist)
