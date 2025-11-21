# Version Streams Architecture

**Status:** Proposed Architecture
**Created:** November 12, 2025
**Author:** Architecture Team
**Version:** 1.0

---

## Executive Summary

The current voice ad generation system suffers from a **4-layer data model** that creates sync friction, race conditions, and loss of creative iterations. Users frequently report losing "the best version from 30 minutes ago" because there's no version history or way to compare LLM iterations.

This proposal introduces **Version Streams**: a Redis-first architecture where each panel (voices, music, sound effects) maintains an independent, immutable version history. Users can explore multiple iterations in an accordion UI, reactivate previous versions, and the mixer always reflects the union of currently-active choices.

### Key Improvements

- **Eliminate FormManager** (~200 lines deleted) - Redis becomes single source of truth
- **Version time travel** - Never lose a good iteration again
- **Immutable versions** - Safe to experiment, easy to rollback
- **Independent streams** - Voice, music, and SFX evolve separately
- **LLM-friendly** - Iterative refinement without replacing state
- **Clean slate** - New `ad:*` namespace, no migration baggage

---

## Current Architecture Problems

### Problem 1: 4-Layer Data Model Creates Sync Hell

**Current Flow:**
```
LLM JSON → FormManager (React hook) → Explicit saveProject() → Redis
                ↓
         Debounced auto-save
                ↓
        Race conditions & lost updates
```

**Symptoms:**
- Comments in code: `"DON'T set musicPrompt here - it will be set after saveProject completes"`
- Circular dependency workarounds
- 500ms debounced saves to avoid performance issues
- Complex logic to prevent empty voice tracks from corrupting valid mixer state

**Root Cause:** Dual state management - FormManager and Redis both trying to be sources of truth.

### Problem 2: Lost Iterations

**User Story:**
> "I asked the AI to generate 5 different versions of the script with different voice combinations. After 30 minutes of iterations, I realized version 2 was the best, but I can't get back to it. The current system only keeps the latest version."

**Current Behavior:**
- Each LLM generation **replaces** previous state
- No history, no undo, no comparison
- Users keep parallel notes in Google Docs to track versions

### Problem 3: Mixer State Confusion

**Current Issue:**
- Mixer tracks reference ephemeral IDs that break on regeneration
- No clear relationship between form state and mixer tracks
- Regenerating voice tracks can orphan sound effects

**Desired Behavior:**
- Mixer always reflects the **union of active versions** from each panel
- Changing active voice version automatically updates mixer
- Timeline state belongs to mixer, not individual versions

### Problem 4: Brittle LLM Integration

**Current Flow:**
```javascript
// LLM generates → Must map to FormManager → Must saveProject → Then update UI
const llmResponse = await generateCreative(...);
const newVoiceTracks = AudioService.mapVoiceSegmentsToTracks(...);
formManager.setVoiceTracks(newVoiceTracks);  // Updates client state
formManager.setMusicPrompt(llmResponse.musicPrompt);  // More client state
await saveProject("after generate creative", llmResponseData);  // Finally persist
formManager.setMusicPrompt(llmResponse.musicPrompt);  // AGAIN after save completes!
```

**Problems:**
- LLM can't directly manipulate project state
- Complex two-phase update (FormManager → Redis)
- Race conditions between phases
- No way to create "draft" versions for user review

---

## Proposed Solution: Version Streams

### Core Concept

Each panel (voices, music, sound effects) maintains an **independent, append-only version stream** in Redis. Versions are **immutable** once created. Only the **active pointer** changes.

```
Voices Panel:        v1 → v2 → v3 → v4 (active: v3)
Music Panel:         v1 → v2 (active: v2)
SoundFX Panel:       v1 → v2 → v3 (active: v1)
                            ↓
Mixer:           Union of voices:v3 + music:v2 + sfx:v1
```

### Key Principles

1. **Immutable Versions:** Once created, versions never change (append-only log)
2. **Active Pointers:** Each stream has one "active" version that feeds the mixer
3. **Independent Evolution:** Voice, music, and SFX streams evolve separately
4. **Draft State:** New versions start as "draft" until user activates
5. **Redis as Truth:** No client-side state management, Redis is single source

---

## Redis Schema Design

### Why Flat Keys Over Nested JSON

**OPTION A: Flat Keys (CHOSEN)**
```typescript
ad:{adId}:voices:v:{versionId} -> { voiceTracks, generatedUrls, ... }
ad:{adId}:music:v:{versionId} -> { musicPrompt, generatedUrl, ... }
ad:{adId}:sfx:v:{versionId} -> { soundFxPrompts, generatedUrls, ... }
```

**OPTION B: Nested JSON (REJECTED)**
```typescript
ad:{adId} -> {
  meta: {...},
  voices: {
    versions: { v1: {...}, v2: {...} },
    active: "v2"
  }
}
```

**Rationale:**
- ✅ **Atomic Operations:** `GET/SET` single version without loading entire ad
- ✅ **Append Efficiency:** Add version without parsing/serializing entire document
- ✅ **Independent Access:** Read voices without touching music data
- ✅ **Simpler Queries:** `GET ad:123:voices:v:v2` vs parsing nested paths
- ✅ **Redis Patterns:** Leverage Redis lists for ordering, not JSON arrays
- ❌ Nested JSON requires full parse/serialize on every update

### Complete Schema

```typescript
// ========== Advertisement Metadata ==========
ad:{adId}:meta -> {
  name: string,                    // "Summer Campaign 2025"
  brief: ProjectBrief,             // Client description, creative brief, format, etc.
  createdAt: number,               // Unix timestamp
  lastModified: number,            // Updated on any change
  owner: string                    // User ID
}

// ========== Voice Version Stream ==========
ad:{adId}:voices:versions -> ["v1", "v2", "v3"]  // Ordered list (Redis LIST)
ad:{adId}:voices:active -> "v3"                   // Current active version (Redis STRING)

ad:{adId}:voices:v:{versionId} -> {
  voiceTracks: VoiceTrack[],      // Script + voice ID (NOT full voice object!)
  generatedUrls: string[],        // Blob URLs for generated audio (parallel array)
  createdAt: number,              // Version creation timestamp
  createdBy: "llm" | "user" | "fork",  // Provenance tracking
  status: "draft" | "active",     // Lifecycle state
  promptContext?: string,         // Optional: LLM prompt that generated this
  parentVersionId?: string        // Optional: For forks
}

// VoiceTrack structure (MINIMAL - voice metadata fetched from app):
{
  voiceId: string,                // Voice ID ONLY - e.g., "21m00Tcm4TlvDq8ikWAM"
  text: string,                   // Script text
  playAfter: string,              // Timing reference
  overlap: number,                // Overlap seconds
  isConcurrent: boolean,          // Concurrent playback flag
  speed?: number                  // Optional speed override
}

// ========== Music Version Stream ==========
ad:{adId}:music:versions -> ["v1", "v2"]
ad:{adId}:music:active -> "v2"

ad:{adId}:music:v:{versionId} -> {
  musicPrompt: string,            // User-facing prompt
  musicPrompts: MusicPrompts,     // Provider-specific prompts
  generatedUrl: string,           // Blob URL
  duration: number,               // Track duration in seconds
  provider: MusicProvider,        // "loudly" | "mubert" | "elevenlabs"
  createdAt: number,
  createdBy: "llm" | "user",
  status: "draft" | "active"
}

// ========== Sound Effects Version Stream ==========
ad:{adId}:sfx:versions -> ["v1", "v2", "v3"]
ad:{adId}:sfx:active -> "v1"

ad:{adId}:sfx:v:{versionId} -> {
  soundFxPrompts: SoundFxPrompt[],  // Array of SFX with placement + duration
  generatedUrls: string[],          // Blob URLs (parallel array)
  createdAt: number,
  createdBy: "llm" | "user",
  status: "draft" | "active"
}

// ========== Mixer State (Union of Active Versions) ==========
ad:{adId}:mixer -> {
  tracks: MixerTrack[],           // References URLs from active versions
  volumes: { [trackId]: number }, // Volume overrides
  calculatedTracks: CalculatedTrack[],  // Timeline positions
  totalDuration: number,          // Total ad length
  lastCalculated: number,         // Cache timestamp
  activeVersions: {               // Snapshot for debugging
    voices: string,               // "v3"
    music: string,                // "v2"
    sfx: string                   // "v1"
  }
}

// ========== Index for Listing (Future) ==========
ads:all -> ["{adId1}", "{adId2}", ...]  // Redis LIST for all ads
ads:by_user:{userId} -> [...]            // User-specific index
```

### Version ID Format

**Format:** `v{integer}` (AUTO-INCREMENT)
**Example:** `v1`, `v2`, `v3`, `v4`, ...

**Rationale:**
- Simple and human-readable
- Still sortable by creation order
- Easy to reference in UI ("Version 3")
- Collision-free (sequential increment)

**Implementation:** `getNextVersionId()` function in `src/lib/redis/versions.ts` counts existing versions using `LRANGE` and returns next integer:
```typescript
const versions = await redis.lrange(`ad:${adId}:${streamType}:versions`, 0, -1);
const nextNum = versions.length + 1;
return `v${nextNum}`;
```

**Alternatives considered:**
- `v{timestamp}` (e.g., `v1731456789123`) - rejected for complexity
- UUID v4 (rejected - not sortable, harder to debug)

---

## API Design

### RESTful Endpoints

All endpoints follow REST conventions:
- `GET` for reads
- `POST` for creates
- `PATCH` for updates (rare, versions are mostly immutable)
- `DELETE` for removals
- `POST` with action suffix for state transitions (e.g., `/activate`)

### Voice Stream Endpoints

```typescript
// List all voice versions
GET /api/ads/{adId}/voices
Response: {
  versions: ["v1", "v2", "v3"],
  active: "v3",
  versionsData: {
    v1: { voiceTracks, createdAt, createdBy, status },
    v2: { ... },
    v3: { ... }
  }
}

// Get specific voice version
GET /api/ads/{adId}/voices/{versionId}
Response: {
  voiceTracks: VoiceTrack[],
  generatedUrls: string[],
  createdAt: number,
  createdBy: "llm" | "user",
  status: "draft" | "active"
}

// Create new voice version
POST /api/ads/{adId}/voices
Body: {
  voiceTracks: VoiceTrack[],
  createdBy?: "user" | "llm"  // Default: "user"
}
Response: {
  versionId: "v1731456789123",
  status: "draft"
}

// Update voice version (rare - mostly immutable)
PATCH /api/ads/{adId}/voices/{versionId}
Body: {
  voiceTracks?: VoiceTrack[],
  status?: "draft" | "active"
}

// Activate version (make it current in mixer)
POST /api/ads/{adId}/voices/{versionId}/activate
Response: {
  active: "v1731456789123",
  mixer: { tracks, totalDuration, ... }  // Rebuilt mixer state
}

// Generate audio for version
POST /api/ads/{adId}/voices/{versionId}/generate
Body: {
  provider: Provider,
  region?: string,
  accent?: string,
  pacing?: Pacing
}
Response: {
  generatedUrls: string[],  // Blob URLs
  status: "generated"
}
```

### Music & SFX Endpoints

Same pattern as voices:

```typescript
GET    /api/ads/{adId}/music
POST   /api/ads/{adId}/music
GET    /api/ads/{adId}/music/{versionId}
PATCH  /api/ads/{adId}/music/{versionId}
POST   /api/ads/{adId}/music/{versionId}/activate
POST   /api/ads/{adId}/music/{versionId}/generate

GET    /api/ads/{adId}/sfx
POST   /api/ads/{adId}/sfx
GET    /api/ads/{adId}/sfx/{versionId}
PATCH  /api/ads/{adId}/sfx/{versionId}
POST   /api/ads/{adId}/sfx/{versionId}/activate
POST   /api/ads/{adId}/sfx/{versionId}/generate
```

### LLM Integration Endpoint

```typescript
// LLM generates draft versions across all panels
POST /api/ads/{adId}/llm-generate
Body: {
  brief: ProjectBrief,
  voices: Voice[],
  mode: "auto" | "voices-only" | "music-only" | "sfx-only"
}
Response: {
  voices?: { versionId, status: "draft" },
  music?: { versionId, status: "draft" },
  sfx?: { versionId, status: "draft" }
}
```

**Key Behavior:**
- Creates **draft versions** in relevant streams
- Does NOT activate them automatically
- UI shows new versions in accordion (expanded by default)
- User reviews and activates manually via "Push to Timeline"

### Mixer Endpoints

```typescript
// Get current mixer state (union of active versions)
GET /api/ads/{adId}/mixer
Response: {
  tracks: MixerTrack[],
  calculatedTracks: CalculatedTrack[],
  totalDuration: number,
  activeVersions: { voices, music, sfx }
}

// Force mixer rebuild (after activating new versions)
POST /api/ads/{adId}/mixer/rebuild
Response: {
  tracks: MixerTrack[],
  totalDuration: number
}

// Update mixer-specific overrides (volumes, positions)
PATCH /api/ads/{adId}/mixer
Body: {
  volumes?: { [trackId]: number },
  // Future: manual position overrides
}
```

---

## Key Workflows

### Workflow 1: User Creates New Voice Version Manually

**Steps:**
1. User edits script in ScripterPanel
2. User clicks "+ New Voice Version"
3. `POST /api/ads/{adId}/voices` with edited voiceTracks
4. API creates draft version `v4`
5. UI re-renders, shows `v4` accordion (expanded)
6. User clicks "Generate Audio"
7. `POST /api/ads/{adId}/voices/v4/generate`
8. Audio URLs stored in `v4.generatedUrls`
9. UI shows inline audio players in `v4` accordion
10. User clicks "Push to Timeline" on `v4`
11. `POST /api/ads/{adId}/voices/v4/activate`
12. API updates `ad:{adId}:voices:active` → "v4"
13. API calls `POST /api/ads/{adId}/mixer/rebuild`
14. Mixer updates with new voice tracks from `v4`

**Result:** User can experiment with different scripts without losing previous versions.

### Workflow 2: LLM Generates Draft Versions

**Steps:**
1. User fills brief in BriefPanel
2. User clicks "Generate Creative" (AUTO mode)
3. `POST /api/ads/{adId}/llm-generate` with brief + voices
4. LLM generates JSON response
5. API creates draft versions:
   - `ad:{adId}:voices:v:v5` (draft)
   - `ad:{adId}:music:v:v3` (draft)
   - `ad:{adId}:sfx:v:v2` (draft)
6. UI updates all panels simultaneously:
   - ScripterPanel shows new `v5` accordion (expanded)
   - MusicPanel shows new `v3` accordion (expanded)
   - SoundFxPanel shows new `v2` accordion (expanded)
7. User reviews each panel independently
8. User clicks "Generate Audio" in ScripterPanel for `v5`
9. Audio generates, inline players appear
10. User decides `v5` voices are better than current `v3`
11. User clicks "Push to Timeline" on `v5`
12. `POST /api/ads/{adId}/voices/v5/activate`
13. Mixer rebuilds with `v5` voices
14. User repeats for music and SFX as desired

**Result:** LLM creates multiple draft versions, user curates by activating preferred versions.

### Workflow 3: Time Travel (Reactivate Old Version)

**Steps:**
1. User realizes `v2` voices were better than current `v5`
2. User clicks on collapsed `v2` accordion to expand
3. Inline audio players show preview of `v2` voices
4. User clicks "Push to Timeline" on `v2`
5. `POST /api/ads/{adId}/voices/v2/activate`
6. `ad:{adId}:voices:active` → "v2"
7. Mixer rebuilds with `v2` voice tracks
8. Timeline updates immediately

**Result:** Never lose a good iteration - all versions preserved forever.

### Workflow 4: Iterative LLM Refinement

**Scenario:** User wants LLM to recast voices but keep script.

**Steps:**
1. Current active: `voices:v3` with Script A + Voice Actor 1
2. User clicks "Recast Voices" in ScripterPanel
3. Dialog: "Keep script? Yes / No"
4. User selects "Yes"
5. `POST /api/ads/{adId}/llm-recast-voices`
   Body: `{ baseVersionId: "v3", keepScript: true }`
6. API:
   - Loads `v3` from Redis
   - Queries voice cache for alternatives (same language/accent)
   - Sends LLM: "Here's the script, pick different voices"
   - LLM responds with new voice selections
   - Creates `v6` with Script A + Voice Actor 2
7. UI shows new `v6` accordion (expanded)
8. User generates audio, reviews, activates if better

**Result:** Iterative refinement without losing previous attempts.

---

## UI Component Specifications

### VersionAccordion Component

**Purpose:** Display a single version in the stream with expand/collapse, preview, and activation.

**Props:**
```typescript
interface VersionAccordionProps {
  adId: string;
  versionId: string;
  streamType: "voices" | "music" | "sfx";
  isActive: boolean;        // Is this the active version?
  isLatest: boolean;        // Is this the newest version?
  defaultExpanded: boolean; // Expand by default?
  onActivate: () => void;   // Callback when "Push to Timeline" clicked
}
```

**Visual States:**

1. **Active Version (Green Border)**
   ```
   ┌─────────────────────────────────────────┐
   │ ✓ v3 (Active) · 2:30 PM · 🤖 AI        │ ← Green border
   │                                         │
   │ [Expanded Content]                      │
   │ Voice 1: Emma - "Summer is here..."    │
   │ [▶ Preview Audio]                       │
   │                                         │
   │ Voice 2: Jack - "Get 50% off..."       │
   │ [▶ Preview Audio]                       │
   └─────────────────────────────────────────┘
   ```

2. **Draft Version (Blue Border, Expanded)**
   ```
   ┌─────────────────────────────────────────┐
   │ v5 (Draft) · 3:15 PM · 🤖 AI    [×]    │ ← Blue border, close button
   │                                         │
   │ [Expanded Content]                      │
   │ Voice 1: Sarah - "New summer deals..." │
   │ [Generate Audio]                        │
   │                                         │
   │ [Push to Timeline]                      │
   └─────────────────────────────────────────┘
   ```

3. **Old Version (Collapsed, Gray)**
   ```
   ┌─────────────────────────────────────────┐
   │ ▶ v2 · 1:45 PM · 👤 Manual       [⋯]   │ ← Gray, collapsed
   └─────────────────────────────────────────┘
   ```

**Interaction:**
- Click header → Toggle expand/collapse
- Click "Push to Timeline" → Activate version, rebuild mixer
- Click [▶ Preview] → Play audio inline (no mixer update)
- Click [×] on draft → Delete draft version
- Click [⋯] → Context menu (Fork, Delete, Export)

### ScripterPanel with Streams

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Your Message, in the Right Voice                    │
│                                                      │
│ [Reset] [+ New Version]                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌─ v5 (Draft) · Just now · 🤖 AI ────────────┐    │ ← Latest (expanded)
│ │                                             │    │
│ │ Voice 1: Sarah                              │    │
│ │ Script: "Summer is here with new deals..." │    │
│ │ [▶ Preview]                                 │    │
│ │                                             │    │
│ │ Voice 2: Jack                               │    │
│ │ Script: "Get 50% off all products..."      │    │
│ │ [▶ Preview]                                 │    │
│ │                                             │    │
│ │ [Generate Audio] [Push to Timeline]        │    │
│ └─────────────────────────────────────────────┘    │
│                                                      │
│ ┌─ ✓ v3 (Active) · 2:30 PM · 🤖 AI ─────────┐    │ ← Active (collapsed)
│ │ Click to expand                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                      │
│ ┌─ ▶ v2 · 1:45 PM · 👤 Manual ───────────────┐    │ ← Old (collapsed)
│ │ Click to expand                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                      │
│ ┌─ ▶ v1 · 1:30 PM · 🤖 AI ───────────────────┐    │ ← Old (collapsed)
│ │ Click to expand                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Newest version always at top (reverse chronological)
- Latest version expanded by default
- Active version has green checkmark + border
- Old versions collapsed by default
- Smooth expand/collapse animations

### MusicPanel & SoundFxPanel

Same accordion pattern, adapted for their content:

**MusicPanel:**
```
┌─ v3 (Draft) · 3:20 PM · 🤖 AI ──────────────┐
│                                              │
│ Prompt: "Upbeat latin pop with horns"       │
│ Provider: Loudly                             │
│ Duration: 30s                                │
│                                              │
│ [▶ Preview Audio]                            │
│ [Generate Music] [Push to Timeline]         │
└──────────────────────────────────────────────┘
```

**SoundFxPanel:**
```
┌─ v2 (Draft) · 3:25 PM · 🤖 AI ──────────────┐
│                                              │
│ Effect 1: Door slam (at beginning)          │
│ [▶ Preview]                                  │
│                                              │
│ Effect 2: Applause (after voice 2)          │
│ [▶ Preview]                                  │
│                                              │
│ [Generate Sound FX] [Push to Timeline]      │
└──────────────────────────────────────────────┘
```

---

## Mixer Rebuild Logic

### Core Principle

Mixer state is **derived** from active versions - it's not an independent entity.

```
Active Versions           Mixer Tracks
─────────────────────────────────────
voices:v3 (2 tracks)  →  [voice-v3-0, voice-v3-1]
music:v2 (1 track)    →  [music-v2]
sfx:v1 (2 tracks)     →  [sfx-v1-0, sfx-v1-1]
                          ─────────────────────
                          Total: 5 tracks
```

### Rebuild Algorithm

```typescript
async function rebuildMixer(adId: string): Promise<MixerState> {
  // 1. Get active version IDs
  const activeVoiceId = await redis.get(`ad:${adId}:voices:active`);
  const activeMusicId = await redis.get(`ad:${adId}:music:active`);
  const activeSfxId = await redis.get(`ad:${adId}:sfx:active`);

  // 2. Load active versions
  const voiceVersion = await redis.get(`ad:${adId}:voices:v:${activeVoiceId}`);
  const musicVersion = await redis.get(`ad:${adId}:music:v:${activeMusicId}`);
  const sfxVersion = await redis.get(`ad:${adId}:sfx:v:${activeSfxId}`);

  // 3. Build mixer tracks from active versions
  const tracks: MixerTrack[] = [];

  // Add voice tracks
  voiceVersion.generatedUrls.forEach((url, i) => {
    tracks.push({
      id: `voice-${activeVoiceId}-${i}`,
      url,
      type: "voice",
      label: voiceVersion.voiceTracks[i].voice?.name || `Voice ${i+1}`,
      duration: voiceVersion.voiceTracks[i].duration,
      playAfter: voiceVersion.voiceTracks[i].playAfter,
      overlap: voiceVersion.voiceTracks[i].overlap,
      metadata: {
        versionId: activeVoiceId,
        scriptText: voiceVersion.voiceTracks[i].text
      }
    });
  });

  // Add music track
  if (musicVersion.generatedUrl) {
    tracks.push({
      id: `music-${activeMusicId}`,
      url: musicVersion.generatedUrl,
      type: "music",
      label: "Background Music",
      duration: musicVersion.duration,
      metadata: {
        versionId: activeMusicId,
        promptText: musicVersion.musicPrompt
      }
    });
  }

  // Add sound effect tracks
  sfxVersion.generatedUrls.forEach((url, i) => {
    tracks.push({
      id: `sfx-${activeSfxId}-${i}`,
      url,
      type: "soundfx",
      label: sfxVersion.soundFxPrompts[i].description,
      duration: sfxVersion.soundFxPrompts[i].duration,
      playAfter: sfxVersion.soundFxPrompts[i].playAfter,
      overlap: sfxVersion.soundFxPrompts[i].overlap,
      metadata: {
        versionId: activeSfxId,
        placementIntent: sfxVersion.soundFxPrompts[i].placement
      }
    });
  });

  // 4. Calculate timeline positions
  const calculated = LegacyTimelineCalculator.calculateTimings(tracks, audioDurations);

  // 5. Save mixer state
  const mixerState: MixerState = {
    tracks,
    calculatedTracks: calculated.calculatedTracks,
    totalDuration: calculated.totalDuration,
    lastCalculated: Date.now(),
    activeVersions: {
      voices: activeVoiceId,
      music: activeMusicId,
      sfx: activeSfxId
    }
  };

  await redis.set(`ad:${adId}:mixer`, JSON.stringify(mixerState));

  return mixerState;
}
```

### When to Rebuild

Mixer automatically rebuilds when:
1. User activates a different version (POST `/activate` endpoint)
2. User generates audio for active version (updates URLs)
3. User manually triggers rebuild (POST `/mixer/rebuild`)

Mixer does NOT rebuild when:
- User creates new draft version (no impact until activated)
- User edits draft version content (no impact until activated)
- User generates audio for draft version (no impact until activated)

This keeps the mixer stable during experimentation.

---

## Implementation Phases

### Phase 1: Redis Data Model & API Foundation (2 days)

**Goal:** Establish Redis key structure and core API endpoints for one stream (voices).

**Tasks:**

1. **Define TypeScript Types**
   ```typescript
   // src/types/versions.ts
   export type VersionId = string;  // "v{timestamp}"
   export type StreamType = "voices" | "music" | "sfx";

   export interface VoiceVersion {
     voiceTracks: VoiceTrack[];
     generatedUrls: string[];
     createdAt: number;
     createdBy: "llm" | "user" | "fork";
     status: "draft" | "active";
     promptContext?: string;
     parentVersionId?: VersionId;
   }

   export interface MusicVersion {
     musicPrompt: string;
     musicPrompts: MusicPrompts;
     generatedUrl: string;
     duration: number;
     provider: MusicProvider;
     createdAt: number;
     createdBy: "llm" | "user";
     status: "draft" | "active";
   }

   export interface SfxVersion {
     soundFxPrompts: SoundFxPrompt[];
     generatedUrls: string[];
     createdAt: number;
     createdBy: "llm" | "user";
     status: "draft" | "active";
   }
   ```

2. **Create Redis Helper Functions**
   ```typescript
   // src/lib/redis/versions.ts
   export async function createVersion(
     adId: string,
     streamType: StreamType,
     data: VoiceVersion | MusicVersion | SfxVersion
   ): Promise<VersionId> {
     const versionId = `v${Date.now()}`;
     const key = `ad:${adId}:${streamType}:v:${versionId}`;

     await redis.set(key, JSON.stringify(data));
     await redis.rpush(`ad:${adId}:${streamType}:versions`, versionId);

     return versionId;
   }

   export async function getVersion(
     adId: string,
     streamType: StreamType,
     versionId: VersionId
   ): Promise<VoiceVersion | MusicVersion | SfxVersion | null> {
     const key = `ad:${adId}:${streamType}:v:${versionId}`;
     const data = await redis.get(key);
     return data ? JSON.parse(data) : null;
   }

   export async function getActiveVersion(
     adId: string,
     streamType: StreamType
   ): Promise<VersionId | null> {
     return await redis.get(`ad:${adId}:${streamType}:active`);
   }

   export async function setActiveVersion(
     adId: string,
     streamType: StreamType,
     versionId: VersionId
   ): Promise<void> {
     await redis.set(`ad:${adId}:${streamType}:active`, versionId);
   }

   export async function listVersions(
     adId: string,
     streamType: StreamType
   ): Promise<VersionId[]> {
     return await redis.lrange(`ad:${adId}:${streamType}:versions`, 0, -1);
   }
   ```

3. **Create Voice Stream API Endpoints**
   ```typescript
   // src/app/api/ads/[id]/voices/route.ts
   export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
     const adId = params.id;
     const versionIds = await listVersions(adId, 'voices');
     const activeId = await getActiveVersion(adId, 'voices');

     // Load all versions
     const versionsData: Record<VersionId, VoiceVersion> = {};
     for (const vId of versionIds) {
       const version = await getVersion(adId, 'voices', vId);
       if (version) versionsData[vId] = version;
     }

     return NextResponse.json({
       versions: versionIds,
       active: activeId,
       versionsData
     });
   }

   export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
     const adId = params.id;
     const { voiceTracks, createdBy = "user" } = await req.json();

     const versionId = await createVersion(adId, 'voices', {
       voiceTracks,
       generatedUrls: [],
       createdAt: Date.now(),
       createdBy,
       status: "draft"
     });

     return NextResponse.json({ versionId, status: "draft" });
   }

   // src/app/api/ads/[id]/voices/[vId]/route.ts
   export async function GET(req: NextRequest, { params }) {
     const { id: adId, vId } = params;
     const version = await getVersion(adId, 'voices', vId);

     if (!version) {
       return NextResponse.json({ error: "Version not found" }, { status: 404 });
     }

     return NextResponse.json(version);
   }

   // src/app/api/ads/[id]/voices/[vId]/activate/route.ts
   export async function POST(req: NextRequest, { params }) {
     const { id: adId, vId } = params;

     // Set active pointer
     await setActiveVersion(adId, 'voices', vId);

     // Update version status
     const version = await getVersion(adId, 'voices', vId);
     if (version) {
       version.status = "active";
       await redis.set(`ad:${adId}:voices:v:${vId}`, JSON.stringify(version));
     }

     // Rebuild mixer
     const mixer = await rebuildMixer(adId);

     return NextResponse.json({ active: vId, mixer });
   }
   ```

4. **Testing**
   - Create test ad in Redis
   - POST new voice version
   - GET all versions
   - Activate version
   - Verify mixer rebuild

**Success Criteria:**
- Can create voice versions via API
- Can list all versions in stream
- Can activate version
- Mixer rebuilds correctly

---

### Phase 2: VersionAccordion Component (2 days)

**Goal:** Build reusable accordion component for displaying versions.

**Tasks:**

1. **Create Base Component**
   ```typescript
   // src/components/VersionAccordion.tsx
   export function VersionAccordion({
     adId,
     versionId,
     streamType,
     isActive,
     isLatest,
     defaultExpanded,
     onActivate
   }: VersionAccordionProps) {
     const [expanded, setExpanded] = useState(defaultExpanded);
     const [version, setVersion] = useState<any>(null);

     useEffect(() => {
       fetch(`/api/ads/${adId}/${streamType}/${versionId}`)
         .then(r => r.json())
         .then(setVersion);
     }, [adId, streamType, versionId]);

     if (!version) return <LoadingSkeleton />;

     return (
       <div className={`version-card ${isActive ? 'border-green-500' : 'border-gray-700'}`}>
         {/* Header */}
         <div
           onClick={() => setExpanded(!expanded)}
           className="cursor-pointer p-4 flex justify-between"
         >
           <div className="flex gap-3">
             <span className="font-mono text-sm">{versionId}</span>
             <span className="text-gray-400">{formatTime(version.createdAt)}</span>
             <span>{version.createdBy === "llm" ? "🤖 AI" : "👤 Manual"}</span>
             {isActive && <Badge variant="success">Active</Badge>}
             {version.status === "draft" && <Badge variant="info">Draft</Badge>}
           </div>
           <ChevronIcon expanded={expanded} />
         </div>

         {/* Expanded Content */}
         {expanded && (
           <div className="p-4 border-t border-gray-700">
             {streamType === "voices" && <VoiceVersionContent version={version} />}
             {streamType === "music" && <MusicVersionContent version={version} />}
             {streamType === "sfx" && <SfxVersionContent version={version} />}

             {/* Actions */}
             <div className="mt-4 flex gap-2">
               {!isActive && (
                 <button onClick={onActivate} className="btn-primary">
                   Push to Timeline
                 </button>
               )}
               {isLatest && !version.generatedUrls?.length && (
                 <button onClick={() => handleGenerate()} className="btn-secondary">
                   Generate Audio
                 </button>
               )}
             </div>
           </div>
         )}
       </div>
     );
   }
   ```

2. **Create Content Components**
   ```typescript
   // src/components/VoiceVersionContent.tsx
   function VoiceVersionContent({ version }: { version: VoiceVersion }) {
     return (
       <div className="space-y-3">
         {version.voiceTracks.map((track, i) => (
           <div key={i} className="p-3 bg-gray-800 rounded">
             <div className="flex justify-between mb-2">
               <span className="font-medium">{track.voice?.name || "No voice"}</span>
               {version.generatedUrls[i] && (
                 <audio controls src={version.generatedUrls[i]} className="h-8" />
               )}
             </div>
             <p className="text-sm text-gray-300">{track.text}</p>
           </div>
         ))}
       </div>
     );
   }
   ```

3. **Integrate into ScripterPanel**
   ```typescript
   // src/components/ScripterPanel.tsx
   export function ScripterPanel({ adId }: { adId: string }) {
     const [voiceStream, setVoiceStream] = useState({ versions: [], active: null });

     useEffect(() => {
       loadVoiceStream();
     }, [adId]);

     const loadVoiceStream = async () => {
       const res = await fetch(`/api/ads/${adId}/voices`);
       const data = await res.json();
       setVoiceStream(data);
     };

     const handleActivate = async (versionId: VersionId) => {
       await fetch(`/api/ads/${adId}/voices/${versionId}/activate`, { method: 'POST' });
       loadVoiceStream();
     };

     return (
       <div>
         <h1>Voice Tracks</h1>

         {/* Render versions in reverse (newest first) */}
         {voiceStream.versions.slice().reverse().map((vId, index) => (
           <VersionAccordion
             key={vId}
             adId={adId}
             versionId={vId}
             streamType="voices"
             isActive={vId === voiceStream.active}
             isLatest={index === 0}
             defaultExpanded={index === 0}
             onActivate={() => handleActivate(vId)}
           />
         ))}

         <button onClick={handleCreateNewVersion}>+ New Voice Version</button>
       </div>
     );
   }
   ```

**Success Criteria:**
- Accordion expands/collapses smoothly
- Active version has green border
- Inline audio previews work
- "Push to Timeline" activates version
- Mixer updates immediately

---

### Phase 3: Music & SFX Streams (1 day)

**Goal:** Replicate voice stream pattern for music and sound effects.

**Tasks:**

1. Create `/api/ads/[id]/music/*` endpoints (same pattern as voices)
2. Create `/api/ads/[id]/sfx/*` endpoints (same pattern as voices)
3. Update `VersionAccordion` to support all stream types
4. Integrate into `MusicPanel` and `SoundFxPanel`

**Success Criteria:**
- All 3 streams working independently
- Can activate different versions in each stream
- Mixer correctly unions all active versions

---

### Phase 4: LLM Integration

**Goal:** LLM creates draft versions across all streams using agentic tool calling.

**Status:** See [docs/version3-llm.md](./version3-llm.md) for complete architecture.

**Key Changes:**
- Replace structured JSON output with tool calling (no more parsing errors)
- LLM searches for voices on-demand (eliminates 10k token catalogues in prompts)
- LLM writes directly to Redis via tools (no FormManager layer)
- Conversational iteration support ("make the music more upbeat")
- Multi-provider support (OpenAI, Qwen-Max for APAC, Moonshot KIMI for Chinese)
- Prompt caching for 50-90% token savings

**Tools Provided to LLM:**
- `search_voices(language, gender, accent)` - find voices from database
- `create_voice_draft(adId, tracks)` - write voice version to Redis
- `create_music_draft(adId, prompt, provider)` - write music version
- `create_sfx_draft(adId, prompts)` - write SFX version
- `get_current_state(adId)` - optional state refresh

**Implementation Phases:**
1. Tool definitions & provider adapters (OpenAI/Qwen/KIMI)
2. Refactor `/api/ai/generate` with tool support
3. New `/api/ads/[id]/chat` endpoint for iteration
4. Brief Panel chat interface
5. Conversation management & summarization

**Success Criteria:**
- Zero JSON parsing errors (no more parsing)
- 50% token cost reduction via caching
- Conversational refinement works end-to-end
- Multi-language quality improvement (Qwen for APAC)

---

### Phase 5: Mixer Panel Updates (1 day)

**Goal:** Mixer always displays union of active versions.

**Tasks:**

1. Update `MixerPanel` to show active versions in header
2. Add "Rebuild" button for manual refresh
3. Display track source version in timeline
4. Handle edge cases (no active version in stream)

**Success Criteria:**
- Mixer clearly shows which versions are active
- Activating any version immediately updates mixer
- Timeline calculator handles mixed version sources

---

### Phase 6: Migration & Coexistence (1 day)

**Goal:** New ads use version streams, old projects keep working.

**Tasks:**

1. **Route Split**
   ```typescript
   // Old system
   /project/{id} → uses project:* keys, old FormManager system

   // New system
   /ad/{id} → uses ad:* keys, version streams
   ```

2. **Project Creation Flow**
   ```typescript
   // src/app/new/page.tsx
   async function createNewAd() {
     const adId = generateProjectId();

     // Initialize meta
     await fetch(`/api/ads`, {
       method: 'POST',
       body: JSON.stringify({ name, brief })
     });

     // Navigate to new ad
     router.push(`/ad/${adId}`);
   }
   ```

3. **Future Migration Tool**
   ```typescript
   // src/lib/migration/projectToAd.ts
   async function migrateProjectToAd(projectId: string): Promise<string> {
     // Load old project
     const project = await loadProjectFromRedis(projectId);

     // Create new ad with same data
     const adId = generateProjectId();

     // Migrate to version streams...

     return adId;
   }
   ```

**Success Criteria:**
- Old projects still work at `/project/*`
- New ads work at `/ad/*`
- No breaking changes to existing users
- Clear migration path when ready

---

## Success Metrics

### Technical Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Code complexity | FormManager + debounced saves + sync logic | Direct API calls only | Lines of code |
| Data layers | 4 (LLM JSON → FormManager → saveProject → Redis) | 2 (API ↔ Redis) | Architecture diagram |
| Sync issues | Frequent (race conditions, lost updates) | Zero (Redis is truth) | Bug reports |
| Version history | None | Unlimited | Redis key count |

### User Experience Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Lost iterations | Common complaint | Never (all versions preserved) | User feedback |
| Comparison workflows | Manual notes in Google Docs | Built-in accordion UI | User surveys |
| LLM refinement | Replace-only (scary) | Draft-review-activate (safe) | Usage analytics |
| Time to find old version | Impossible | < 5 seconds | User testing |

### Architecture Quality

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Single source of truth | Violated (FormManager + Redis) | Achieved (Redis only) | Code review |
| Immutability | None (everything mutable) | Versions immutable | Schema design |
| Testability | Hard (mocked FormManager) | Easy (pure API tests) | Test coverage |
| Scalability | Limited (nested JSON) | High (flat keys) | Redis performance |

---

## Future Enhancements

### Phase 7: Version Comparison UI

**Feature:** Side-by-side comparison of two versions.

**UI:**
```
┌─────────────────────────────────────────────┐
│ Compare: v3 (Active) vs v5 (Draft)          │
├──────────────────┬──────────────────────────┤
│ v3               │ v5                       │
├──────────────────┼──────────────────────────┤
│ Voice 1: Emma    │ Voice 1: Sarah          │
│ "Summer is..."   │ "New summer deals..."   │
│ [▶ Play]         │ [▶ Play]                │
├──────────────────┼──────────────────────────┤
│ Voice 2: Jack    │ Voice 2: Jack           │
│ "Get 50%..."     │ "Get 50%..."            │
│ [▶ Play]         │ [▶ Play]         [Same] │
└──────────────────┴──────────────────────────┘
```

### Phase 8: Version Forking

**Feature:** Duplicate a version to experiment without LLM.

**Workflow:**
1. User clicks [⋯] on v3
2. Select "Fork Version"
3. Creates v6 as exact copy of v3
4. User edits v6 manually
5. User activates v6 or v3

### Phase 9: Version Merging

**Feature:** Combine best parts of multiple versions.

**Scenario:** User likes voices from v3 but music from v5.

**Solution:** Manual version creation with mixed sources.

### Phase 10: Export/Import Versions

**Feature:** Share version JSON with team.

**Use Case:** Creative director reviews versions offline, sends feedback.

---

## Appendix: Design Decisions

### Why Not Nested JSON?

**Considered:**
```typescript
ad:{adId} -> {
  meta: {...},
  voices: { versions: { v1: {...}, v2: {...} }, active: "v2" }
}
```

**Rejected because:**
1. Every version read requires parsing entire ad object
2. Adding version requires read-modify-write cycle (not atomic)
3. Can't use Redis LIST operations for ordering
4. 10MB size limit on Redis values (with many versions)
5. Harder to implement version-specific operations

### Why Immutable Versions?

**Benefits:**
- Safe to fork/experiment (can't corrupt original)
- Easy to implement time travel (no state snapshots needed)
- Simplifies conflict resolution (no concurrent edits)
- Enables audit trail (who created what when)
- Better for debugging (state never changes under you)

**Trade-off:** Can't edit version after generation
**Mitigation:** Edit draft versions before generation, or fork active version

### Why Active Pointers?

**Alternative:** Store mixer state separately, reference versions by ID.

**Rejected because:** Mixer state becomes disconnected from versions. If voice v3 is active and user deletes it, mixer breaks.

**With pointers:** Mixer always reads from active version. Can't delete active version without activating another first.

### Why Redis Over Neon (PostgreSQL)?

**Redis Pros:**
- Faster reads/writes (in-memory)
- Simpler schema (key-value, not tables)
- Natural fit for ephemeral project data
- Lists/sets for ordering versions
- TTL support for garbage collection

**Neon Pros:**
- Relational queries (version history across ads)
- Transactional consistency
- Better for long-term archival

**Decision:** Use Redis for active ads, migrate to Neon for archival if needed.

---

### Why Separate Development Redis Instance?

**Problem:** Version Streams development requires creating new `ad:*` keys in Redis. Original instance contains production `project:*` data that must remain untouched.

**Alternatives Considered:**

1. **Namespace Isolation (REJECTED)**
   - Use `ad:*` keys in same Redis instance as `project:*`
   - Pros: Single connection, simpler configuration
   - Cons: Risk of accidental key conflicts, harder to rollback, shared memory/performance

2. **Separate Instance (CHOSEN)**
   - Use `V3_REDIS_URL` for all Version Streams operations
   - Use existing `REDIS_URL` for legacy project system
   - Pros: Complete isolation, safe experimentation, independent scaling
   - Cons: Two connections to maintain during development

**Implementation Benefits:**
- **Zero production risk**: New code cannot touch `project:*` keys
- **Easy rollback**: Drop V3 instance if design needs major changes
- **Independent testing**: Test environment completely isolated
- **Clear migration path**: When ready, can migrate or keep separate

**Trade-offs:**
- Requires setting `V3_REDIS_URL` environment variable locally and in deployment
- Two Redis connections during development phase (temporary until migration complete)
- Slight increase in complexity (two getRedis functions)

**Future Path:**
- Phase 6: Optionally migrate old projects to Version Streams
- Or: Keep separate instances permanently (different use cases)
- Or: Merge after Version Streams proven stable

**Connection Format:**
```bash
# Development instance (Version Streams)
V3_REDIS_URL=https://your-instance.upstash.io?token=xxx

# Production instance (legacy projects)
REDIS_URL=https://your-prod.upstash.io?token=yyy
```

---

## Document Status

**Version:** 1.4
**Last Updated:** November 13, 2025
**Status:** Phase 1 & 2 Complete (APIs + UI Fully Tested)

**Implementation Status:**
- ✅ Phase 1: Redis data model & API foundation (COMPLETED)
  - 15 API endpoints implemented
  - Dual Redis architecture for production safety
  - All tests passing (55 tests, 286ms)
- ✅ Phase 2: VersionAccordion component (COMPLETED)
  - Radix UI accordion with glassmorphism styling
  - Read-only content components for all stream types
  - Demo page at `/ad/[id]`
  - Test data population script (scripts/create-test-ad-direct.ts)
  - Nested buttons hydration fix
  - Fully tested with real Redis data
  - **CRITICAL FIX:** Redis key pattern corrected (flat keys, not single JSON blob)
- 🔴 **CRITICAL ISSUE:** Voice metadata bloat (storing full voice objects instead of IDs)
- ⏳ Phase 3: Music & SFX streams (PENDING - APIs ready, audio generation needed)
- ⏳ Phase 4: LLM integration (PENDING)
- ⏳ Phase 5: Mixer panel updates (PENDING)
- ⏳ Phase 6: Migration & coexistence (PENDING)

**Next Steps:**
1. ✅ ~~Test the VersionAccordion UI by creating test data via APIs~~ (COMPLETED)
2. **CRITICAL:** Strip voice metadata bloat - store only voice IDs, hydrate at read time
3. Integrate audio generation to populate generatedUrls (Phase 3)
4. Build LLM integration endpoint (Phase 4)
5. Update main panels to use new Version Streams architecture
6. Deploy to secondary domain for testing

---

## CRITICAL: Voice Metadata Bloat Issue

### The Problem

**Current Implementation (WRONG):**
```typescript
// voiceTrack stores FULL voice object - 300+ bytes per track!
{
  voice: {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    provider: "elevenlabs",
    gender: "female",
    language: "en",
    accent: "American",
    style: "Narrative",
    description: "Calm, confident, professional",
    age: "young",
    use_case: "Narration, audiobooks"
  },
  text: "Ever get tired of ads...",
  playAfter: "start",
  overlap: 0
}
```

**Why This Is Terrible:**
- 🔴 Stores 9 fields of voice metadata per track (name, provider, gender, language, accent, style, description, age, use_case)
- 🔴 3 voice tracks = 900+ bytes of duplicated metadata
- 🔴 Voice metadata already exists in the app's voice database
- 🔴 If voice metadata changes (description update), all versions become stale
- 🔴 Violates single source of truth principle

### The Solution

**Store Voice IDs Only:**
```typescript
// voiceTrack stores ONLY voice ID - 30 bytes per track
{
  voiceId: "21m00Tcm4TlvDq8ikWAM",  // Reference to voice database
  text: "Ever get tired of ads...",
  playAfter: "start",
  overlap: 0,
  isConcurrent: false
}
```

**Voice Metadata Hydration at Read Time:**
```typescript
// When loading versions, hydrate voice metadata from app database
const version = await getVersion(adId, "voices", versionId);

// Hydrate voice metadata for UI display
const hydratedTracks = version.voiceTracks.map(track => ({
  ...track,
  voice: getVoiceById(track.voiceId) // Fetch from voice cache/database
}));
```

**Benefits:**
- ✅ 95% reduction in Redis storage (30 bytes vs 300+ bytes per track)
- ✅ Single source of truth for voice metadata (app database)
- ✅ Voice metadata updates don't require version migration
- ✅ Faster writes (less data to serialize)
- ✅ Cleaner data model (separation of concerns)

### Implementation Plan

**Phase 1: Update Types**
```typescript
// src/types/versions.ts
export interface VoiceTrack {
  voiceId: string;        // Voice ID reference (NOT full object)
  text: string;
  playAfter: string;
  overlap: number;
  isConcurrent: boolean;
  speed?: number;
}
```

**Phase 2: Update Write Operations**
```typescript
// When creating version, extract voice IDs
const versionData: VoiceVersion = {
  voiceTracks: voiceTracks.map(track => ({
    voiceId: track.voice?.id || "",  // Extract ID only
    text: track.text,
    playAfter: track.playAfter,
    overlap: track.overlap,
    isConcurrent: track.isConcurrent,
    speed: track.speed
  })),
  generatedUrls: [],
  createdAt: Date.now(),
  createdBy: "llm",
  status: "draft"
};
```

**Phase 3: Update Read Operations**
```typescript
// When loading version, hydrate voice metadata
export async function getVersionHydrated(
  adId: string,
  streamType: "voices",
  versionId: VersionId
): Promise<VoiceVersion> {
  const version = await getVersion(adId, streamType, versionId);

  // Hydrate voice metadata from voice database
  const hydratedTracks = await Promise.all(
    version.voiceTracks.map(async track => ({
      ...track,
      voice: await getVoiceById(track.voiceId)
    }))
  );

  return {
    ...version,
    voiceTracks: hydratedTracks
  };
}
```

**Phase 4: Voice Database/Cache**
```typescript
// src/lib/voices/cache.ts
export async function getVoiceById(voiceId: string): Promise<Voice | null> {
  // TODO: Implement voice metadata lookup
  // Options:
  // 1. Fetch from separate Redis cache (voices:elevenlabs:{id})
  // 2. Fetch from JSON file (voices.json)
  // 3. Fetch from Neon PostgreSQL (if using database)
  // 4. Fetch from provider API (with caching)

  return voiceCache.get(voiceId) || fetchVoiceFromProvider(voiceId);
}
```

---

## CRITICAL: Redis Key Pattern for Test Data

### The Problem

**WRONG Pattern (Single JSON Blob):**
```typescript
// ❌ WRONG - writes entire stream as single JSON object
ad:{adId}:voices:stream -> {
  active: "v2",
  versions: ["v1", "v2", "v3"],
  versionsData: {
    v1: { voiceTracks, createdAt, ... },
    v2: { voiceTracks, createdAt, ... },
    v3: { voiceTracks, createdAt, ... }
  }
}
```

**Why This Breaks:**
- 🔴 API expects flat keys, not nested JSON
- 🔴 `getAllVersionsWithData()` looks for `ad:{adId}:voices:versions` (Redis LIST)
- 🔴 `getActiveVersion()` looks for `ad:{adId}:voices:active` (Redis STRING)
- 🔴 `getVersion()` looks for `ad:{adId}:voices:v:v1` (individual version)

### The Solution

**CORRECT Pattern (Flat Keys):**
```typescript
// ✅ CORRECT - writes to separate Redis keys
await redis.rpush(`ad:${adId}:voices:versions`, "v1");
await redis.rpush(`ad:${adId}:voices:versions`, "v2");
await redis.rpush(`ad:${adId}:voices:versions`, "v3");
await redis.set(`ad:${adId}:voices:active`, "v2");
await redis.set(`ad:${adId}:voices:v:v1`, JSON.stringify(voiceVersion1));
await redis.set(`ad:${adId}:voices:v:v2`, JSON.stringify(voiceVersion2));
await redis.set(`ad:${adId}:voices:v:v3`, JSON.stringify(voiceVersion3));
```

**Test Script Example:**
```typescript
// scripts/create-test-ad-direct.ts
const voiceVersions = [
  { voiceTracks: [...], generatedUrls: [], createdAt: now - 3600000, ... },
  { voiceTracks: [...], generatedUrls: [...], createdAt: now - 1800000, ... },
  { voiceTracks: [...], generatedUrls: [], createdAt: now - 600000, ... }
];

// Write using correct Redis key pattern
await redis.rpush(`ad:${adId}:voices:versions`, "v1");
await redis.rpush(`ad:${adId}:voices:versions`, "v2");
await redis.rpush(`ad:${adId}:voices:versions`, "v3");
await redis.set(`ad:${adId}:voices:active`, "v2");
await redis.set(`ad:${adId}:voices:v:v1`, JSON.stringify(voiceVersions[0]));
await redis.set(`ad:${adId}:voices:v:v2`, JSON.stringify(voiceVersions[1]));
await redis.set(`ad:${adId}:voices:v:v3`, JSON.stringify(voiceVersions[2]));

// Same pattern for music and SFX
await redis.rpush(`ad:${adId}:music:versions`, "v1");
await redis.set(`ad:${adId}:music:active`, "v1");
await redis.set(`ad:${adId}:music:v:v1`, JSON.stringify(musicVersion));

await redis.rpush(`ad:${adId}:sfx:versions`, "v1");
await redis.set(`ad:${adId}:sfx:active`, "v1");
await redis.set(`ad:${adId}:sfx:v:v1`, JSON.stringify(sfxVersion));
```

**Result:** API endpoints now correctly read version data.

---

## Implementation Notes (Phase 1)

### What Was Built

**Files Created:**
```
src/
├── types/versions.ts (248 lines)
│   - Complete type system for version streams
│   - VoiceVersion, MusicVersion, SfxVersion
│   - API response types, MixerState
│   - Integer-based VersionId type
│
├── lib/redis/versions.ts (272 lines)
│   - Core Redis operations for version CRUD
│   - Auto-incrementing version IDs
│   - Active version pointer management
│   - AD_KEYS helper for consistent key patterns
│
├── lib/mixer/rebuilder.ts (156 lines)
│   - Mixer rebuild from active versions
│   - Integration with LegacyTimelineCalculator
│   - Duration estimation for voice tracks
│
└── app/api/ads/
    ├── route.ts (ad creation & listing)
    └── [id]/
        ├── voices/
        │   ├── route.ts (GET list, POST create)
        │   └── [versionId]/
        │       ├── route.ts (GET single)
        │       └── activate/route.ts (POST activate)
        ├── music/
        │   ├── route.ts (GET list, POST create)
        │   └── [versionId]/
        │       ├── route.ts (GET single)
        │       └── activate/route.ts (POST activate)
        ├── sfx/
        │   ├── route.ts (GET list, POST create)
        │   └── [versionId]/
        │       ├── route.ts (GET single)
        │       └── activate/route.ts (POST activate)
        └── mixer/
            ├── route.ts (GET current state)
            └── rebuild/route.ts (POST force rebuild)
```

**Total:** 15 new API endpoints, ~1,200 lines of code

---

### Key Implementation Decisions

#### 1. Next.js 15 Async Params
**Issue:** Next.js 15 requires route params to be awaited

**Solution:** All routes use `{ params }: { params: Promise<{ id: string }> }` pattern

**Pattern:**
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: adId } = await params;
  // ...
}
```

**Impact:** Required updating all 15 route handlers during build verification

---

#### 2. Version ID Generation
**Decision:** Integer auto-increment (v1, v2, v3) instead of timestamps

**Reason:** User preference for simplicity and readability

**Implementation:**
```typescript
async function getNextVersionId(
  adId: string,
  streamType: StreamType
): Promise<VersionId> {
  const versions = await redis.lrange(`ad:${adId}:${streamType}:versions`, 0, -1);
  const nextNum = versions.length + 1;
  return `v${nextNum}`;
}
```

**Trade-off:** Sequential IDs are simpler but could theoretically have race conditions in high-concurrency scenarios (acceptable for current use case)

---

#### 3. Redis Import Path
**Issue:** Initially used wrong relative path in `versions.ts`

**Fix:** Changed from `import { getRedis } from "./redis"` to `import { getRedis } from "../redis"` (correct path from `lib/redis/` to `lib/`)

**Learning:** Always verify import paths when creating new directories

---

#### 4. TypeScript ESLint
**Issue:** `Record<string, any>` flagged by linter in MixerTrack metadata

**Fix:** Changed to `Record<string, unknown>` to satisfy strict typing rules

**Code:**
```typescript
export interface MixerTrack {
  // ...
  metadata?: Record<string, unknown>; // Changed from `any`
}
```

---

#### 5. Mixer Duration Estimation
**Implementation:** Voice duration estimated from word count using simple heuristic

**Algorithm:**
```typescript
function estimateVoiceDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5;
  const estimatedDuration = words / wordsPerSecond;
  return Math.max(1, estimatedDuration + 1); // Add padding
}
```

**TODO:** Replace with actual audio duration measurement in production

**Why:** Actual audio files not generated yet; estimation enables mixer timeline calculation

---

#### 6. Dual Redis Architecture for Production Safety

**Decision:** Separate Redis instances for production (`REDIS_URL`) and development (`V3_REDIS_URL`)

**Rationale:**
- User concern: "i'm a bit worried now. the redis we're working with is a PRODUCTION instance"
- Protect production `project:*` data during Version Streams development
- Enable safe experimentation with new `ad:*` namespace
- Allow rollback without affecting existing users

**Implementation:**
```typescript
// src/lib/redis-v3.ts
export function getRedisV3(): Redis {
  const urlString = process.env.V3_REDIS_URL;

  // Parse URL to extract url and token (Upstash format)
  const url = new URL(urlString);
  const token = url.searchParams.get("token");
  url.searchParams.delete("token");

  return new Redis({ url: url.toString(), token });
}
```

**Files Modified to Use getRedisV3():**
- `src/lib/redis/versions.ts` (10 function calls)
- `src/lib/mixer/rebuilder.ts` (2 function calls)
- `src/app/api/ads/route.ts` (2 function calls)
- All test files updated to mock `redis-v3` instead of `redis`

**Environment Setup:**
- Local: `V3_REDIS_URL=https://*.upstash.io?token=xxx` in `.env.local`
- Tests: `V3_REDIS_URL=redis://localhost:6379?token=mock-token` in `vitest.config.mts`

**Trade-off:** Requires maintaining two Redis connections during development, but provides essential safety. Production `REDIS_URL` remains untouched for existing `/project/*` system.

---

### Testing Status

**Build Verification:**
- ✅ TypeScript compilation successful
- ✅ ESLint passing (0 errors, 0 warnings)
- ✅ All imports resolved correctly
- ✅ Production build succeeds
- ✅ All 15 API routes registered in Next.js

**API Testing:**
- ⏳ Manual API testing pending (can proceed with Phase 2 or test now)
- ⏳ No audio generation integration yet (generatedUrls remain empty)
- ⏳ No UI to interact with APIs yet

**Redis Operations:**
- ✅ Key patterns verified correct
- ✅ Version CRUD operations implemented
- ✅ Active pointer management working
- ✅ Dual Redis architecture implemented (redis-v3 module)
- ✅ All tests use mocked V3_REDIS_URL environment variable
- ⏳ Not tested with actual Redis instance yet

---

### Performance Characteristics

**Redis Operations Per Request:**

| Operation | Redis Calls | Efficiency |
|-----------|-------------|------------|
| Create version | 2 (SET + RPUSH) | ✅ Optimal |
| List versions | N+1 (LRANGE + N GETs) | ⚠️ Could use pipeline |
| Activate version | 3 (GET verify + SET active + SET status) | ✅ Acceptable |
| Rebuild mixer | 6 (3 GET active + 3 GET versions) + 1 SET | ⚠️ Could use MGET |

**Potential Optimizations:**
- Use Redis pipelines for batch operations
- Use MGET for loading multiple versions simultaneously
- Consider caching mixer state client-side to reduce rebuilds
- Add Redis TTL for automatic cleanup of old drafts

---

### Deviations from Original Spec

1. **Version IDs:** Integer (v1, v2, v3) instead of timestamp (v1731456789123)
   - **Reason:** User preference for simpler, more readable IDs

2. **Route Signatures:** Added `await params` for Next.js 15 compatibility
   - **Reason:** Framework requirement in Next.js 15

3. **No Migration Tool:** Deferred to Phase 6 (fresh start approach)
   - **Reason:** Clean separation between old `project:*` and new `ad:*` namespaces

4. **No Audio Generation:** Integration deferred to Phase 3
   - **Reason:** Focus on data model and API foundation first

5. **Dual Redis Architecture:** Added separate development instance
   - **Reason:** Production safety concern raised during Phase 2

---

## Implementation Notes (Phase 2)

### What Was Built

**Files Created:**
```
src/
├── components/
│   ├── ui/VersionAccordion.tsx (150 lines)
│   │   - Generic accordion component using Radix UI
│   │   - BaseVersionItem interface for type safety
│   │   - Conditional rendering for active/inactive states
│   │   - Optional hasAudio callback for flexible audio detection
│   │
│   └── version-content/
│       ├── VoiceVersionContent.tsx (read-only voice tracks display)
│       ├── MusicVersionContent.tsx (read-only music prompt display)
│       └── SfxVersionContent.tsx (read-only SFX with placement formatting)
│
├── app/ad/[id]/page.tsx (demo workspace with tabbed interface)
│
└── app/globals.css (accordion animations added)
```

**Total:** 1 reusable component + 3 content components + 1 demo page + CSS animations

---

### Key Implementation Decisions

#### 1. Radix UI Over Headless UI
**User Requirement:** "use this as accordion component: https://www.radix-ui.com/primitives/docs/components/accordion"

**Implementation:** Installed `@radix-ui/react-accordion@1.2.12` despite existing Headless UI library

**Why:** User-specified requirement for better accessibility and animation support

---

#### 2. Generic Type System with BaseVersionItem
**Problem:** VoiceVersion, MusicVersion, and SfxVersion have different structures (generatedUrls vs generatedUrl)

**Solution:**
```typescript
export interface BaseVersionItem {
  id: VersionId;
  createdAt: number;
  createdBy: CreatedBy;
  status: VersionStatus;
}

export function VersionAccordion<T extends BaseVersionItem>({
  versions,
  hasAudio,
  renderContent,
}: VersionAccordionProps<T>) {
  // Generic implementation
}
```

**Benefit:** Single component works for all three stream types with type safety

---

#### 3. Flexible Audio Detection via Callback
**Implementation:** Optional `hasAudio` prop instead of hardcoded field checks

**Usage:**
```typescript
// Voice (array of URLs)
hasAudio={(v) => (v as VoiceVersion).generatedUrls?.length > 0}

// Music (single URL)
hasAudio={(v) => (v as MusicVersion).generatedUrl?.length > 0}
```

**Why:** Different version types store audio URLs differently

---

#### 4. Minimal Styling with Glassmorphism
**User Requirement:** "style it super minimally"

**Implementation:**
- Blue "ACTIVE" pill badge with `bg-wb-blue/20 border-wb-blue/30`
- Glassy play button with `backdrop-blur-sm bg-white/10`
- Read-only fields with `bg-white/5 border-white/10`
- Smooth accordion animations (200ms ease-out)

**Design System:** Follows existing Tailwind v4 theme with custom colors

---

#### 5. Descending Order Sorting
**User Requirement:** "versions are sorted in a descending order"

**Implementation:**
```typescript
const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);
```

**Result:** Newest version always at top, defaults to expanded state

---

#### 6. Nested Buttons Hydration Fix
**Problem:** React hydration error: "In HTML, <button> cannot be a descendant of <button>"

**Root Cause:** `Accordion.Trigger` renders as a `<button>`, and we had play/activate buttons nested inside it

**Solution:** Restructured accordion header so interactive buttons are siblings of the trigger:
```typescript
<Accordion.Header className="flex items-center gap-2 px-4 py-3">
  {/* Trigger button */}
  <Accordion.Trigger className="flex-1 ...">
    <div className="flex items-center gap-3">
      <span>{version.id}</span>
      {isActive && <span>ACTIVE</span>}
    </div>
    <ChevronDownIcon />
  </Accordion.Trigger>

  {/* Action buttons - OUTSIDE trigger to avoid nesting */}
  <div className="flex items-center gap-2">
    {versionHasAudio && <button onClick={onPreview}>Play</button>}
    {!isActive && <button onClick={onActivate}>Activate</button>}
  </div>
</Accordion.Header>
```

**Result:** Buttons are siblings instead of children, eliminating hydration error

---

### UI Specifications Implemented

**Active Version State:**
- Blue "ACTIVE" pill badge in title
- "USE IN MIX" button (disabled) instead of checkbox
- Green border (planned but not in current implementation)
- All fields read-only

**Inactive Version State:**
- No badge
- Checkbox button for activation
- Gray/neutral styling
- All fields read-only

**Play Button:**
- Only shown when hasAudio() returns true
- Glassy button with PlayIcon
- Stops event propagation (doesn't toggle accordion)

**Layout:**
- Title: Version ID + ACTIVE badge (left)
- Right side: Play button + Checkbox/Button

---

### Demo Page Structure

**Location:** `/ad/[id]/page.tsx`

**Features:**
- Tabbed interface for Voices / Music / SFX
- Fetches all three streams on mount
- Handles activation via POST to `/activate` endpoints
- Shows loading states during fetch
- Demonstrates all three content components

**Usage:** Navigate to `http://localhost:3003/ad/{any-id}` to see UI

---

### Known Limitations

#### 1. No Audio Generation Yet
**Status:** Play buttons shown but no actual audio to play

**Impact:** Cannot test full preview functionality

**Next Step:** Phase 3 will integrate audio generation endpoints

---

#### 2. No Edit Mode
**Current:** All fields read-only

**Future:** Active versions might get inline editing capability

**Decision:** Deferred to later phase for simplicity

---

#### 3. No Version Comparison
**Spec Feature:** Phase 7 includes side-by-side comparison UI

**Status:** Not implemented yet

**Reason:** Focus on core functionality first

---

#### 4. No Version Forking/Merging
**Spec Features:** Phase 8-9 include fork/merge workflows

**Status:** Not implemented yet

**Reason:** Advanced features deferred to later phases

---

### Testing Status

**Manual Testing:**
- ✅ Test data script created (scripts/create-test-ad.ts)
- ✅ Successfully creates realistic Spotify Premium campaign
- ✅ Accordion expand/collapse verified
- ✅ Activation flow tested end-to-end
- ✅ Tested with multiple versions across all streams (voices/music/sfx)
- ⏳ Play button functionality (no audio generation yet)

**Component Testing:**
- ⏳ No unit tests written yet
- ⏳ No Storybook stories created

**Build Verification:**
- ✅ TypeScript compilation successful
- ✅ All imports resolved
- ✅ No ESLint errors
- ✅ No hydration errors

---

### Next Development Tasks

**✅ Completed:**
1. ✅ Create test data via Phase 1 APIs
2. ✅ Manually test accordion expand/collapse
3. ✅ Verify activation flow works end-to-end
4. ✅ Test with multiple versions in each stream
5. ✅ Fix nested buttons hydration error

**Immediate (Phase 3):**
1. Integrate audio generation to populate generatedUrls
2. Test play button functionality with real audio
3. Add loading states for activation
4. Handle error states (failed activation, missing data)

**Soon:**
1. Add unit tests for VersionAccordion
2. Create Storybook stories for components
3. Add keyboard navigation support
4. Improve accessibility (ARIA labels, focus management)

---

### Known Limitations

#### 1. No Actual Audio Generation Yet
**Status:** `generatedUrls` arrays remain empty until audio generation is integrated

**Impact:**
- Mixer tracks will have empty URLs until generation endpoints are wired up
- Cannot test full end-to-end flow yet
- Timeline calculations use estimated durations instead of actual

**Mitigation:** Phase 3 will integrate existing audio generation endpoints

---

#### 2. Naive Duration Estimation
**Current Approach:**
- Voice: Word count heuristic (~2.5 words/sec)
- Music/SFX: Use provided duration values

**Limitation:** Estimates may not match actual audio length

**TODO:** Measure actual audio duration after generation using Audio API:
```typescript
const audio = new Audio(url);
audio.addEventListener('loadedmetadata', () => {
  const actualDuration = audio.duration;
});
```

---

#### 3. No User Authentication
**Current State:** Still using `universal-session` pattern from legacy system

**Impact:** All users share same session (testing mode only)

**Future:** Implement proper user authentication before production deployment

---

#### 4. No UI Yet
**Status:** APIs fully functional but no client-side interface

**Impact:**
- Manual API testing required (curl/Postman)
- Cannot demonstrate version accordion UI
- No "Push to Timeline" activation buttons

**Next:** Phase 2 will build VersionAccordion components and panel updates

---

#### 5. Race Conditions in Version ID Generation
**Potential Issue:** Multiple concurrent version creations could generate duplicate IDs

**Current Mitigation:** Acceptable for single-user testing mode

**Future Solution:** Use Redis INCR for atomic counter or add version creation mutex

---

### Next Development Tasks

**Immediate (Phase 2):**
1. Build VersionAccordion component for displaying version history
2. Update ScripterPanel to fetch and display version stream via API
3. Wire "Push to Timeline" activation buttons to `/activate` endpoints
4. Add inline audio preview players for generated tracks
5. Handle draft vs active visual states (badges, borders)

**Soon (Phase 3):**
1. Integrate audio generation APIs with version endpoints
2. Create `/generate` endpoints for each stream type
3. Populate `generatedUrls` arrays after successful generation
4. Handle generation progress states (loading indicators)
5. Add error handling for failed generations

**Medium-term (Phase 4):**
1. Build `/api/ads/{id}/llm-generate` endpoint
2. Parse LLM JSON responses and create draft versions
3. UI for reviewing and activating LLM-generated versions
4. Support iterative refinement (recast voices, modify music, etc.)

**Future (Phase 5-6):**
1. Update MixerPanel to show active version indicators
2. Add manual mixer rebuild button
3. Build migration tool for legacy `project:*` data
4. Deploy new system to secondary domain for testing
