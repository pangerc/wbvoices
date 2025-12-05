# Mixer V3: Timeline Architecture Redesign

**Status:** In Progress (Foundation Laid)
**Created:** 2025-10-03
**Last Updated:** 2025-12-05
**Author:** Architecture Team
**Version:** 1.1

---

## Executive Summary

The current mixer timeline system suffers from excessive recalculations (4+ per track addition), fragile regeneration behavior, and architectural limitations that will block future manual editing features. This proposal outlines a redesign using semantic IDs, command patterns, and batched calculations to create a stable foundation for both LLM-generated and manually-edited audio timelines.

### Key Improvements

- **4+ calculations → 1 calculation** per user action through batching
- **Stable track references** that survive regeneration (semantic IDs)
- **Predictable behavior** with no reactive cascades
- **Backward compatible** with existing Redis projects
- **Foundation for manual editing** (drag-and-drop, undo/redo)

---

## Progress (Dec 2025)

### Completed: Exact Duration Tracking

A major source of hyper-reactivity has been eliminated: **audio duration measurement no longer triggers recalculations**.

**What Changed:**
- Added `generatedDuration` field to `VoiceTrack` type
- Voice providers (ElevenLabs, Lovo) now measure actual audio duration using `music-metadata` package
- Duration is stored in Redis at generation time, not measured client-side
- Server uses real durations for timeline positioning (no more word-count estimation)

**Impact on Cascade Problem:**
```
BEFORE (4+ calculations):
Audio loads → setAudioDuration() → calculateTimings() → re-render → ...

AFTER (0 client-side calculations from duration):
Duration already in Redis → Server calculates once → Client hydrates
```

**Files:**
- `src/types/versions.ts` - `VoiceTrack.generatedDuration` field
- Voice provider routes - Duration measurement with `music-metadata`
- `src/lib/mixer/rebuilder.ts` - Uses `generatedDuration` in timeline calculation

### Completed: Server-Authoritative Mixer

The mixer is now **server-authoritative** - calculations happen once on the server:

```
Version Activated
    ↓
rebuildMixer() (src/lib/mixer/rebuilder.ts)
    ↓
LegacyTimelineCalculator computes positions
    ↓
Redis: mixer state with calculatedTracks
    ↓
SWR: /api/ads/{id}/mixer
    ↓
MixerPanel: hydrates Zustand from SWR (no recalculation!)
```

**Key Behaviors:**
- Hydration compares track **URLs**, not just IDs (handles re-generation with different providers)
- Audio elements update `src` when URL changes
- Server is source of truth; client doesn't recalculate timings

**Files:**
- `src/lib/mixer/rebuilder.ts` - Server-side calculation
- `src/components/MixerPanel.tsx` - URL-aware hydration
- `src/hooks/useMixerData.ts` - SWR subscription

### Remaining Goals

From the original proposal, these are still pending:

| Feature | Status | Benefit |
|---------|--------|---------|
| Semantic IDs | ⏳ Pending | Relationships survive regeneration |
| Command Pattern | ⏳ Pending | Atomic operations, undo/redo foundation |
| Batching Layer | ⏳ Pending | Multiple changes → single calculation |
| Manual Editing | ⏳ Pending | Drag-and-drop timeline positions |

The duration tracking and server-authoritative model provide a **stable foundation** for these future enhancements.

---

## Current Architecture Analysis

### How It Works Today

```
User Action (add track)
  ↓
Zustand mixerStore.addTrack()
  ↓
State update → React re-render
  ↓
Audio element loads → setAudioDuration()
  ↓
State update → calculateTimings() [1st]
  ↓
calculatedTracks updated → React re-render
  ↓
useEffect fires → calculateTimings() [2nd]
  ↓
Save callback fires → project update
  ↓
Project load → calculateTimings() [3rd]
  ↓
Duration measurement completes → calculateTimings() [4th]
```

**Result:** Single track addition triggers 4+ full timeline recalculations.

### Why This Happens

1. **Reactive State Model (Zustand)**

   - Every state change immediately broadcasts to all subscribers
   - No transaction boundaries or batching
   - Perfect for UI state, wrong tool for timeline calculations

2. **Mixed Concerns**

   - Timeline logic in `legacyTimelineCalculator.ts`
   - State management in `mixerStore.ts`
   - Audio measurement triggers in `audioService.ts`
   - Final rendering in `audio-mixer.ts`
   - No clear separation of concerns

3. **Circular Dependencies**

   ```
   Audio duration loaded
     → setAudioDuration()
       → calculateTimings()
         → state update
           → React re-render
             → audio element remounts
               → duration loaded again...
   ```

4. **No Debouncing/Batching**
   - Each change triggers immediate calculation
   - No way to group related changes (e.g., "regenerate voice + update duration")

### Critical Problems

#### Problem 1: Track Regeneration Breaks Relationships

**Scenario:**

```typescript
// Initial state
tracks = [
  { id: "voice-abc123", label: "Voice 1" },
  { id: "voice-xyz789", label: "Voice 2" },
  { id: "sfx-def456", playAfter: "voice-xyz789" }, // SFX after Voice 2
];

// User regenerates Voice 2
// New voice gets new ID: "voice-pqr999"

// PROBLEM: SFX still references "voice-xyz789" (deleted!)
tracks = [
  { id: "voice-abc123", label: "Voice 1" },
  { id: "voice-pqr999", label: "Voice 2 (regenerated)" },
  { id: "sfx-def456", playAfter: "voice-xyz789" }, // BROKEN REFERENCE!
];
```

**Current "Miraculous" Behavior:**

- System eventually settles through 4+ recalculations
- Sometimes works, sometimes breaks
- No guarantees

#### Problem 2: Console Log Avalanche

Real console output from adding a single music track:

```
Using Legacy Timeline Calculator (heuristic-based) [1]
Using Legacy Timeline Calculator (heuristic-based) [2]
Recalculating track timings. Available durations: {...}
Processing 2 voice tracks...
Using measured duration for Shimmer: 4.752s
Using measured duration for Ballad: 7.512s
Using explicit duration for Music: 30s
No ending sound effects detected — extending music 2s for fade-out
Positioning music track Music: "Light bubbly pop melody with a..." (30s) with duration 14.11199999999998s
Legacy track timing calculation complete: {...}
Total timeline duration: 14.5 (exact end time: 14.11199999999998)
Setting accurate duration for track music-1759482585746-owlu2ku (Music: "Light bubbly pop melody with a..." (30s)): 30s
Using Legacy Timeline Calculator (heuristic-based) [3]
Using Legacy Timeline Calculator (heuristic-based) [4]
[... continues ...]
```

Each event triggers full recalculation with `O(n)` track processing.

#### Problem 3: Blocks Manual Editing

**Future Requirement:** Drag-and-drop timeline editing

- Dragging a track = 60+ position updates per second
- Current system = 60+ × 4 = 240+ calculations per second
- UI would freeze completely

**Missing Features:**

- No undo/redo (every change overwrites state)
- No transaction boundaries (can't preview then commit)
- No validation layer (can't enforce rules like "max 3 concurrent voices")

#### Problem 4: Sound Effects Cannot Create Timeline Gaps

**Scenario:**

User places a sound effect "after voice 1" with the expectation that voice 2 will wait until the sound effect finishes, creating a clean sequence: Voice 1 → SFX → Voice 2.

**What Actually Happens:**

```
Voice 1: [0s ─────── 5s]
Voice 2:             [5s ─────── 10s]  ← Positioned immediately after Voice 1
SFX:                 [5s ── 8s]         ← Also positioned after Voice 1, overlays Voice 2!
```

**Root Cause:**

The legacy timeline calculator processes track types in a **fixed order**:

1. **Intro sound effects** (`playAfter: "start"`) → positioned first
2. **Voice tracks** → positioned sequentially (lines 148-305)
3. **Music tracks** → positioned at start
4. **Remaining sound effects** → positioned last (lines 472+)

By the time step 4 executes, voice tracks are already positioned and immutable. The SFX is placed "after voice 1" at 5s, but voice 2 is also at 5s, causing an overlay instead of creating a gap.

**Why Intro SFX Work but Mid-Timeline SFX Don't:**

- Intro SFX are processed in step 1, **before** voices are positioned
- Voice positioning respects the `startingOffset` created by intro SFX
- Mid-timeline SFX are processed in step 4, **after** voices are immutable
- No mechanism to push subsequent voices forward

**User Expectation vs Reality:**

| User Expectation                                | Reality                                     |
| ----------------------------------------------- | ------------------------------------------- |
| Voice 1 → [SFX plays alone] → Voice 2           | Voice 1 → [SFX + Voice 2 simultaneously]    |
| Timeline gaps preserve audio clarity            | Overlay creates muddy audio mix             |
| Placement selector creates gaps between tracks  | Placement selector creates overlays         |

**Current Workaround:**

- Documented as known limitation (see `legacyTimelineCalculator.ts:472-490`)
- Works for intro/outro SFX (before all voices / after all voices)
- Breaks for mid-timeline SFX (between voice tracks)

**Proper Fix in Mixer V3:**

With semantic IDs and dependency-aware positioning:

```typescript
// Build dependency graph
const dependencies = {
  'voice-1': { playAfter: 'start' },
  'sfx-1': { playAfter: 'voice-1' },      // SFX after voice 1
  'voice-2': { playAfter: 'sfx-1' },      // Voice 2 waits for SFX!
};

// Topological sort determines correct order
const sortedTracks = ['voice-1', 'sfx-1', 'voice-2'];

// Single-pass calculation respects all dependencies
sortedTracks.forEach(track => {
  if (track.playAfter) {
    const refTrack = findBySemanticId(track.playAfter);
    startTime = refTrack.endTime - (track.overlap || 0);
  }
});
```

**Result:** Voice 2 naturally positions after SFX finishes, creating the expected gap.

---

## Critical Requirements

### 1. Track Regeneration Must Preserve Relationships

**User Flow:**

1. User has ad with Voice 1, Voice 2, SFX (plays after Voice 2)
2. User regenerates Voice 2 (new text, new voice actor)
3. Voice 2 gets new URL, new duration, new track ID
4. **SFX must still play after the NEW Voice 2**

**Challenge:** Track IDs change but semantic relationships must survive.

### 2. Redis Persistence Must Support Both Systems

**Current Redis Format:**

```typescript
{
  projectId: "fast-harbor-228",
  voiceTracks: [{ voiceId, text, style, playAfter?, overlap? }],
  generatedTracks: {
    voiceUrls: ["url1", "url2"],
    musicUrl: "url3"
  },
  musicPrompt: "upbeat latin pop"
}
```

**Requirements:**

- New system must read old projects (backward compat)
- Old system must still work as fallback
- No forced migration (load-time migration is OK)
- Timeline state survives save/load

### 3. Foundation for Manual Editing (Weeks Away)

**Future Features:**

- Drag tracks to reposition
- Multi-select and batch move
- Undo/redo
- Validation (e.g., prevent excessive overlap)
- Concurrent voice tracks ("happy birthday" chorus)

**Architecture must support:**

- Transaction boundaries (preview while dragging)
- Command history (for undo)
- Performance (no calculations during drag)

---

## Proposed Solution

### Core Innovation: Semantic IDs + Command Pattern + Batching

#### 1. Semantic ID System

**Problem:** Ephemeral track IDs break on regeneration
**Solution:** Stable semantic identifiers that survive regeneration

```typescript
// Old system (IDs change on regeneration)
{
  id: "voice-1759482257085-kif0im3",  // New ID each time
  playAfter: "voice-1759482259543-8ffekj6"  // Breaks when referenced track regenerates!
}

// New system (semantic IDs are stable)
{
  id: "voice-1-v1759482257085",      // Version-specific ID
  semanticId: "voice-1",              // Stable semantic ID
  playAfter: "voice-2",               // References semantic ID (survives regeneration!)
  version: 3                           // This voice has been regenerated 3 times
}
```

**Semantic ID Format:**

- Voice tracks: `voice-1`, `voice-2`, `voice-3`
- Music tracks: `music-1`
- Sound effects: `sfx-1`, `sfx-2`

**Version-Specific ID Format:**

- `{semanticId}-v{timestamp}`
- Example: `voice-1-v1678901234`

**Relationship Resolution:**

```typescript
// When calculating timeline:
if (track.playAfter === "voice-2") {
  // Find track with semanticId === "voice-2" (regardless of version)
  const refTrack = tracks.find((t) => t.semanticId === "voice-2");
  // Use its actual position for calculation
}
```

#### 2. Command Pattern for Changes

**Problem:** Direct state mutations trigger immediate cascades
**Solution:** Queue commands, batch execute

```typescript
interface TimelineCommand {
  execute(state: TimelineState): TimelineState;
  undo(state: TimelineState): TimelineState; // For future undo/redo
}

// Example: Regenerate voice command
class RegenerateTrackCommand implements TimelineCommand {
  constructor(
    private semanticId: string,
    private newTrackData: Partial<MixerTrack>
  ) {}

  execute(state: TimelineState): TimelineState {
    // Find track by semantic ID (not ephemeral ID)
    const oldTrack = state.tracks.find((t) => t.semanticId === this.semanticId);

    // Create new version with same semantic ID
    const newTrack = {
      ...oldTrack,
      ...this.newTrackData,
      id: `${this.semanticId}-v${Date.now()}`,
      semanticId: this.semanticId, // PRESERVE semantic ID
      version: (oldTrack.version || 0) + 1,
    };

    // Replace track while preserving array position
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.semanticId === this.semanticId ? newTrack : t
      ),
    };
  }
}
```

#### 3. Batching Layer

**Problem:** Each change triggers immediate calculation
**Solution:** Queue commands, execute after 100ms of inactivity

```typescript
class CommandBatcher {
  private queue: TimelineCommand[] = [];
  private timer: NodeJS.Timeout | null = null;

  queue(command: TimelineCommand) {
    this.queue.push(command);

    // Reset batch timer
    if (this.timer) clearTimeout(this.timer);

    // Execute after 100ms of inactivity
    this.timer = setTimeout(() => {
      this.executeBatch();
    }, 100);
  }

  private executeBatch() {
    const commands = [...this.queue];
    this.queue = [];

    // Execute all commands in sequence
    let newState = this.currentState;
    for (const cmd of commands) {
      newState = cmd.execute(newState);
    }

    // SINGLE timeline calculation for ALL changes
    this.calculateTimeline(newState);
  }
}
```

**Result:**

```
User regenerates voice
  → Queue: [RegenerateCommand]
  → Wait 100ms
Audio loads
  → Queue: [UpdateDurationCommand]
  → Wait 100ms (no more changes)
  → Execute batch: both commands
  → Calculate timeline ONCE
```

Instead of:

```
Regenerate → calc [1]
  → Audio loads → calc [2]
    → State update → calc [3]
      → Save triggers → calc [4]
```

#### 4. Pure Timeline Calculator

**Problem:** Calculation mixed with side effects
**Solution:** Pure function (input → output, no side effects)

```typescript
class PureTimelineCalculator {
  // No dependencies, no state, no side effects
  calculate(tracks: MixerTrack[]): CalculatedTrack[] {
    const result: CalculatedTrack[] = [];

    // Build semantic reference map
    const semanticMap = new Map<string, MixerTrack>();
    tracks.forEach((t) => semanticMap.set(t.semanticId, t));

    // Process each track
    for (const track of tracks) {
      let startTime = 0;

      // Resolve playAfter using semantic ID
      if (track.playAfter && track.playAfter !== "start") {
        const refTrack = semanticMap.get(track.playAfter);
        if (refTrack) {
          const refCalculated = result.find(
            (r) => r.semanticId === track.playAfter
          );
          if (refCalculated) {
            startTime =
              refCalculated.actualStartTime +
              refCalculated.actualDuration -
              (track.overlap || 0);
          }
        }
      }

      result.push({
        ...track,
        actualStartTime: startTime,
        actualDuration: track.duration || this.getDefaultDuration(track.type),
      });
    }

    return result;
  }
}
```

Benefits:

- Testable (no mocking required)
- Predictable (same input = same output)
- Fast (no async, no side effects)
- Debuggable (pure function)

#### 5. Timeline Controller (Orchestration Layer)

**Problem:** Logic scattered across multiple files
**Solution:** Single controller orchestrates everything

```typescript
class TimelineController {
  private timeline: TimelineState;
  private calculator: PureTimelineCalculator;
  private batcher: CommandBatcher;

  // User actions
  async regenerateTrack(semanticId: string, voiceData: VoiceTrack) {
    // 1. Generate new audio
    const audioUrl = await AudioService.generate(voiceData);

    // 2. Queue regeneration command (doesn't execute yet)
    this.batcher.queue(
      new RegenerateTrackCommand(semanticId, {
        url: audioUrl,
        label: voiceData.voice.name,
      })
    );

    // 3. When audio loads, queue duration update
    const audio = new Audio(audioUrl);
    audio.onloadedmetadata = () => {
      this.batcher.queue(new UpdateDurationCommand(semanticId, audio.duration));
      // Batch will execute after 100ms of no more changes
    };
  }

  addTrack(track: MixerTrack) {
    this.batcher.queue(new AddTrackCommand(track));
  }

  removeTrack(semanticId: string) {
    this.batcher.queue(new RemoveTrackCommand(semanticId));
  }

  // Internal: batch execution
  private executeBatch(commands: TimelineCommand[]) {
    // Apply all commands
    let newState = this.timeline;
    for (const cmd of commands) {
      newState = cmd.execute(newState);
    }

    // Calculate timeline ONCE
    const calculated = this.calculator.calculate(newState.tracks);

    // Update Zustand store (for UI)
    useMixerStore.getState().setCalculatedTracks(calculated);

    // Save to Redis
    this.saveProject(newState);

    this.timeline = newState;
  }
}
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         User Actions                         │
│  (regenerate voice, add track, update duration)             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Timeline Controller                        │
│  • Validates commands                                        │
│  • Queues to batcher                                         │
│  • Orchestrates flow                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Command Batcher                           │
│  • Queues commands                                           │
│  • Waits 100ms after last command                            │
│  • Executes batch                                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Timeline Commands                           │
│  • RegenerateTrackCommand                                    │
│  • AddTrackCommand                                           │
│  • UpdateDurationCommand                                     │
│  • Uses semantic IDs                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                Pure Timeline Calculator                      │
│  • Stateless pure function                                   │
│  • Resolves semantic references                              │
│  • Calculates positions                                      │
│  • No side effects                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Zustand Store (UI only)                     │
│  • calculatedTracks                                          │
│  • totalDuration                                             │
│  • UI state (selected, dragging, etc.)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Hybrid Persistence Model

### Problem

Current Redis format is optimized for LLM generation, not timeline editing:

- Stores `voiceUrls` array but no track metadata
- Stores generation params (`musicPrompt`) but not timeline state
- No semantic IDs or version tracking

### Solution: Additive Enhancement

**Enhance existing format without breaking legacy:**

```typescript
export type Project = {
  // ========== EXISTING (unchanged) ==========
  id: string;
  headline: string;
  timestamp: number;
  brief: ProjectBrief;
  voiceTracks: VoiceTrack[]; // LLM-generated voice segments
  musicPrompt: string;
  soundFxPrompt: SoundFxPrompt | null;
  generatedTracks: {
    voiceUrls: string[];
    musicUrl?: string;
    soundFxUrl?: string;
  };

  // ========== NEW (additive) ==========
  timelineState?: {
    version: 2; // Schema version for migration
    tracks: Array<{
      id: string; // Version-specific: "voice-1-v1678901234"
      semanticId: string; // Stable: "voice-1"
      version: number; // Regeneration counter
      url: string;
      label: string;
      type: "voice" | "music" | "soundfx";
      duration?: number;
      volume?: number;

      // Relationships use semantic IDs
      playAfter?: string; // References semantic ID
      overlap?: number;

      // Track metadata
      metadata?: {
        sourceVoiceTrackIndex?: number; // Maps to voiceTracks[index]
        regeneratedFrom?: string; // Previous version ID
        regeneratedAt?: number;
        voiceId?: string;
        scriptText?: string;
      };
    }>;
    totalDuration?: number;
    lastCalculated?: number;
  };
};
```

### Migration Strategy

**Loading Projects:**

```typescript
async function loadProject(projectId: string): Promise<Project> {
  const project = await fetchFromRedis(projectId);

  // Check if project has new timeline state
  if (project.timelineState?.version >= 2) {
    // Modern project with semantic IDs
    return project;
  }

  // Legacy project - migrate on the fly
  return migrateLegacyProject(project);
}

function migrateLegacyProject(project: Project): Project {
  const semanticTracks: TimelineTrack[] = [];

  // Migrate voice tracks with semantic IDs
  project.voiceTracks.forEach((voiceTrack, index) => {
    const semanticId = `voice-${index + 1}`;
    semanticTracks.push({
      id: `${semanticId}-v${Date.now()}`,
      semanticId,
      version: 1,
      url: project.generatedTracks.voiceUrls[index],
      label: voiceTrack.voice?.name || `Voice ${index + 1}`,
      type: "voice",
      playAfter: mapPlayAfterToSemantic(voiceTrack.playAfter, index),
      overlap: voiceTrack.overlap,
      metadata: {
        sourceVoiceTrackIndex: index,
        voiceId: voiceTrack.voice?.id,
        scriptText: voiceTrack.text,
      },
    });
  });

  // Migrate music track
  if (project.generatedTracks.musicUrl) {
    semanticTracks.push({
      id: `music-1-v${Date.now()}`,
      semanticId: "music-1",
      version: 1,
      url: project.generatedTracks.musicUrl,
      label: "Background Music",
      type: "music",
    });
  }

  // Migrate sound effects
  if (project.generatedTracks.soundFxUrl) {
    semanticTracks.push({
      id: `sfx-1-v${Date.now()}`,
      semanticId: "sfx-1",
      version: 1,
      url: project.generatedTracks.soundFxUrl,
      label: "Sound Effect",
      type: "soundfx",
      playAfter: mapSoundFxPlayAfter(project.soundFxPrompt),
      overlap: project.soundFxPrompt?.overlap,
    });
  }

  return {
    ...project,
    timelineState: {
      version: 2,
      tracks: semanticTracks,
      lastCalculated: Date.now(),
    },
  };
}
```

**Saving Projects:**

```typescript
async function saveProject(
  projectId: string,
  timeline: TimelineState
): Promise<void> {
  const existing = await fetchFromRedis(projectId);

  const updated: Project = {
    ...existing,

    // Update timeline state (new format)
    timelineState: {
      version: 2,
      tracks: timeline.tracks,
      totalDuration: timeline.totalDuration,
      lastCalculated: Date.now(),
    },

    // Also update generatedTracks for backward compat
    generatedTracks: {
      voiceUrls: timeline.tracks
        .filter((t) => t.type === "voice")
        .sort((a, b) => {
          // Sort by semantic ID number
          const aNum = parseInt(a.semanticId.split("-")[1]);
          const bNum = parseInt(b.semanticId.split("-")[1]);
          return aNum - bNum;
        })
        .map((t) => t.url),
      musicUrl: timeline.tracks.find((t) => t.type === "music")?.url,
      soundFxUrl: timeline.tracks.find((t) => t.type === "soundfx")?.url,
    },

    lastModified: Date.now(),
  };

  await saveToRedis(projectId, updated);
}
```

**Backward Compatibility:**

| Scenario         | Old System (Legacy Calculator)     | New System (Mixer V3)            |
| ---------------- | ---------------------------------- | -------------------------------- |
| Load old project | ✅ Works (ignores `timelineState`) | ✅ Works (migrates on load)      |
| Load new project | ✅ Works (uses `generatedTracks`)  | ✅ Works (uses `timelineState`)  |
| Save from old    | ✅ Works (saves `generatedTracks`) | N/A (feature flag off)           |
| Save from new    | ✅ Works (updates both formats)    | ✅ Works (saves `timelineState`) |

No forced migration required. Old and new systems coexist peacefully.

---

## Implementation Phases

### Phase 1: Foundation (Week 1) - NO BREAKING CHANGES

**Goal:** Build new system alongside legacy, feature flag OFF by default

**Tasks:**

1. Create `src/services/timeline/` directory structure
2. Implement `PureTimelineCalculator` (pure functions, tested)
3. Implement `TimelineCommand` interfaces and base classes
4. Implement `CommandBatcher` with 100ms window
5. Implement `TimelineController` with semantic ID support
6. Add semantic ID generation to new tracks
7. Add migration logic for loading legacy projects
8. Add feature flag: `ENABLE_MIXER_V3=false` (default)

**Testing:**

- Unit tests for `PureTimelineCalculator`
- Unit tests for each command type
- Integration tests for migration logic
- All tests pass, no production impact

**Files Created:**

```
src/services/timeline/
├── PureTimelineCalculator.ts
├── TimelineController.ts
├── CommandBatcher.ts
├── commands/
│   ├── TimelineCommand.ts (interface)
│   ├── AddTrackCommand.ts
│   ├── RemoveTrackCommand.ts
│   ├── RegenerateTrackCommand.ts
│   ├── UpdateDurationCommand.ts
│   └── index.ts
├── types.ts
└── index.ts
```

**Success Criteria:**

- All new code has 90%+ test coverage
- Legacy system still works perfectly
- Feature flag toggles between systems

### Phase 2: Integration & Testing (Week 2)

**Goal:** Enable for NEW projects only, monitor behavior

**Tasks:**

1. Integrate `TimelineController` with `mixerStore.ts`
2. Update `audioService.ts` to use semantic IDs
3. Add console logging for debugging (# of calculations, batch sizes)
4. Enable feature flag for new projects created after specific date
5. Test regeneration flow extensively
6. Monitor production for issues

**Feature Flag Logic:**

```typescript
function shouldUseMixerV3(project: Project): boolean {
  // Environment override
  if (process.env.ENABLE_MIXER_V3 === "false") return false;
  if (process.env.ENABLE_MIXER_V3 === "true") return true;

  // Use V3 for projects with timelineState
  if (project.timelineState?.version >= 2) return true;

  // Use V3 for new projects created after cutoff date
  const CUTOFF = new Date("2025-01-15").getTime();
  if (project.timestamp > CUTOFF) return true;

  // Default to legacy for safety
  return false;
}
```

**Testing Scenarios:**

- ✅ Fresh project generation
- ✅ Regenerate single voice track
- ✅ Regenerate all voice tracks
- ✅ Regenerate music
- ✅ Save and load project
- ✅ Load old project (migration)
- ✅ Relationships preserved after regeneration
- ✅ Console logs show 1 calculation instead of 4+

**Success Criteria:**

- No user-reported bugs
- Calculation count reduced by 75%
- Regeneration preserves relationships 100% of time

### Phase 3: Full Rollout (Week 3)

**Goal:** Enable for all projects, deprecate legacy calculator

**Tasks:**

1. Migrate existing projects in Redis (batch script)
2. Update feature flag default to `true`
3. Add telemetry for monitoring
4. Keep legacy calculator as fallback for 2 weeks
5. Final deprecation of legacy calculator

**Batch Migration Script:**

```typescript
async function migrateAllProjects() {
  const projects = await redis.keys("project:*");

  for (const key of projects) {
    const project = await redis.get(key);

    // Skip if already migrated
    if (project.timelineState?.version >= 2) continue;

    // Migrate and save
    const migrated = migrateLegacyProject(project);
    await redis.set(key, migrated);

    console.log(`Migrated ${project.id}`);
  }
}
```

**Rollback Plan:**

1. Set `ENABLE_MIXER_V3=false` in environment
2. System immediately switches to legacy calculator
3. Projects still load (backward compatible)
4. Monitor for 24 hours
5. Investigate root cause

**Success Criteria:**

- All projects migrated successfully
- No increase in error rates
- User-facing performance improvement visible
- Foundation ready for manual editing features

---

## Code Examples

### Complete Track Regeneration Flow

```typescript
// ========== User clicks "Regenerate Voice 2" ==========

// 1. Component calls controller
await timelineController.regenerateTrack('voice-2', {
  voice: newVoiceActor,
  text: newScript
});

// ========== Inside TimelineController ==========

async regenerateTrack(semanticId: string, voiceData: VoiceTrack) {
  // 2. Generate new audio
  this.mixerStore.setTrackLoading(semanticId, true);
  const result = await AudioService.generateVoiceAudio([voiceData]);

  // 3. Queue regeneration command (doesn't execute yet!)
  this.commandBatcher.queue(
    new RegenerateTrackCommand(semanticId, {
      url: result.url,
      label: voiceData.voice.name,
      metadata: {
        scriptText: voiceData.text,
        regeneratedAt: Date.now()
      }
    })
  );

  // 4. When audio loads, queue duration update
  const audio = new Audio(result.url);
  audio.onloadedmetadata = () => {
    this.commandBatcher.queue(
      new UpdateDurationCommand(semanticId, audio.duration)
    );
    // After 100ms of no more changes, batch executes
  };

  this.mixerStore.setTrackLoading(semanticId, false);
}

// ========== Inside CommandBatcher ==========

queue(command: TimelineCommand) {
  this.commandQueue.push(command);

  // Reset timer
  if (this.timer) clearTimeout(this.timer);

  // Wait 100ms after last command
  this.timer = setTimeout(() => {
    this.executeBatch();
  }, 100);
}

executeBatch() {
  console.log(`Executing batch of ${this.commandQueue.length} commands`);

  // Apply all commands
  let state = this.controller.getTimelineState();
  for (const cmd of this.commandQueue) {
    state = cmd.execute(state);
  }

  // Clear queue
  this.commandQueue = [];

  // Notify controller: SINGLE calculation for ALL changes
  this.controller.handleBatchExecuted(state);
}

// ========== Inside RegenerateTrackCommand ==========

execute(state: TimelineState): TimelineState {
  // Find track by SEMANTIC ID (not ephemeral ID!)
  const oldTrack = state.tracks.find(t => t.semanticId === this.semanticId);
  if (!oldTrack) return state;

  // Create new version
  const newTrack: MixerTrack = {
    ...oldTrack,           // Preserve relationships, metadata
    ...this.newData,       // Apply new url, label
    id: `${this.semanticId}-v${Date.now()}`,  // New version ID
    semanticId: this.semanticId,               // SAME semantic ID
    version: (oldTrack.version || 0) + 1       // Increment version
  };

  // Replace in array (preserves position)
  return {
    ...state,
    tracks: state.tracks.map(t =>
      t.semanticId === this.semanticId ? newTrack : t
    )
  };
}

// ========== Inside PureTimelineCalculator ==========

calculate(tracks: MixerTrack[]): CalculatedTrack[] {
  const calculated: CalculatedTrack[] = [];

  // Build semantic reference map
  const semanticMap = new Map<string, MixerTrack>();
  tracks.forEach(t => semanticMap.set(t.semanticId, t));

  for (const track of tracks) {
    let startTime = 0;

    // Resolve playAfter using SEMANTIC ID
    if (track.playAfter && track.playAfter !== 'start') {
      const refTrack = semanticMap.get(track.playAfter);
      if (refTrack) {
        const refCalc = calculated.find(c => c.semanticId === track.playAfter);
        if (refCalc) {
          startTime = refCalc.actualStartTime +
                     refCalc.actualDuration -
                     (track.overlap || 0);
        }
      }
    }

    calculated.push({
      ...track,
      actualStartTime: startTime,
      actualDuration: track.duration || 3
    });
  }

  return calculated;
}

// ========== Result ==========
// Voice 2 regenerated with new URL, new duration
// SFX still plays after Voice 2 (relationship preserved!)
// Only 1 timeline calculation for both commands
// Console log:
//   "Executing batch of 2 commands"
//   "Timeline calculated in 2ms"
```

### Adding Feature Flag Support

```typescript
// src/store/mixerStore.ts

export const useMixerStore = create<MixerState>((set, get) => ({
  // ... existing state ...

  calculateTimings: () => {
    const { tracks, audioDurations } = get();

    // Check feature flag
    const useMixerV3 = shouldUseMixerV3();

    if (useMixerV3) {
      console.log("🎯 Using Mixer V3 (command-based)");
      // New system: commands already executed, this is just for manual trigger
      timelineController.recalculate();
    } else {
      console.log("🔧 Using Legacy Timeline Calculator (heuristic-based)");
      // Old system: direct calculation
      const result = LegacyTimelineCalculator.calculateTimings(
        tracks,
        audioDurations
      );

      set({
        calculatedTracks: result.calculatedTracks,
        totalDuration: result.totalDuration,
      });
    }
  },
}));

function shouldUseMixerV3(): boolean {
  // Environment override
  if (typeof window !== "undefined") {
    const override = window.localStorage.getItem("ENABLE_MIXER_V3");
    if (override === "true") return true;
    if (override === "false") return false;
  }

  // Server-side environment variable
  if (process.env.NEXT_PUBLIC_ENABLE_MIXER_V3 === "true") return true;
  if (process.env.NEXT_PUBLIC_ENABLE_MIXER_V3 === "false") return false;

  // Check current project
  const project = useProjectHistoryStore.getState().currentProject;
  if (project?.timelineState?.version >= 2) return true;

  // Default to legacy for safety
  return false;
}
```

---

## Risk Assessment & Mitigation

### High-Risk Areas

#### Risk 1: Migration Logic Breaks Old Projects

**Probability:** Medium
**Impact:** High (users can't load projects)
**Mitigation:**

- Extensive testing with real production project data
- Migration is non-destructive (adds `timelineState`, keeps `generatedTracks`)
- Legacy system can still load projects (ignores `timelineState`)
- Rollback via feature flag takes < 5 minutes

**Validation:**

```typescript
// Test suite
describe("Project Migration", () => {
  test("migrates project with 2 voices + music", () => {
    const legacy = createLegacyProject();
    const migrated = migrateLegacyProject(legacy);
    expect(migrated.timelineState.tracks).toHaveLength(3);
    expect(migrated.timelineState.tracks[0].semanticId).toBe("voice-1");
  });

  test("preserves relationships after migration", () => {
    const legacy = createProjectWithSFX();
    const migrated = migrateLegacyProject(legacy);
    const sfx = migrated.timelineState.tracks.find((t) => t.type === "soundfx");
    expect(sfx.playAfter).toBe("voice-2");
  });

  test("legacy system can still load migrated project", () => {
    const migrated = createMigratedProject();
    const result = LegacyTimelineCalculator.calculateTimings(
      extractTracksForLegacy(migrated)
    );
    expect(result.calculatedTracks).toHaveLength(3);
  });
});
```

#### Risk 2: Batching Causes UI Lag

**Probability:** Low
**Impact:** Medium (users see 100ms delay)
**Mitigation:**

- 100ms is imperceptible to humans
- Can tune batch window (50ms, 150ms)
- Can add "immediate" mode for critical operations
- Monitor actual batch sizes in production

**Monitoring:**

```typescript
class CommandBatcher {
  private metrics = {
    batchSizes: [] as number[],
    avgBatchSize: 0,
    maxBatchSize: 0,
  };

  executeBatch() {
    const batchSize = this.commandQueue.length;
    this.metrics.batchSizes.push(batchSize);
    this.metrics.maxBatchSize = Math.max(this.metrics.maxBatchSize, batchSize);

    // Log stats every 10 batches
    if (this.metrics.batchSizes.length % 10 === 0) {
      console.log("Batch metrics:", {
        avg:
          this.metrics.batchSizes.reduce((a, b) => a + b) /
          this.metrics.batchSizes.length,
        max: this.metrics.maxBatchSize,
      });
    }

    // Execute batch...
  }
}
```

#### Risk 3: Semantic IDs Conflict

**Probability:** Very Low
**Impact:** High (relationships break)
**Mitigation:**

- Semantic IDs generated deterministically from position
- Controller validates uniqueness before adding
- Migration logic handles edge cases (missing tracks, gaps)

**Validation:**

```typescript
function addTrackWithSemanticId(track: MixerTrack): void {
  // Ensure semantic ID is unique
  const existingTrack = this.timeline.tracks.find(
    (t) => t.semanticId === track.semanticId
  );

  if (existingTrack) {
    console.error(`Semantic ID collision: ${track.semanticId}`);
    // Auto-resolve: increment suffix
    let suffix = 2;
    while (
      this.timeline.tracks.some(
        (t) => t.semanticId === `${track.semanticId}-${suffix}`
      )
    ) {
      suffix++;
    }
    track.semanticId = `${track.semanticId}-${suffix}`;
  }

  this.commandBatcher.queue(new AddTrackCommand(track));
}
```

### Medium-Risk Areas

#### Risk 4: Redis Memory Usage Increases

**Probability:** Low
**Impact:** Low (slight cost increase)
**Mitigation:**

- `timelineState` adds ~5KB per project
- 1000 projects = ~5MB (negligible for Redis)
- Can add compression if needed
- Can implement TTL for old versions

#### Risk 5: Legacy Calculator Diverges

**Probability:** Medium
**Impact:** Low (inconsistent results between systems)
**Mitigation:**

- Maintain parity during transition period
- Add integration tests comparing both calculators
- Deprecate legacy after 2 weeks of monitoring

**Parity Test:**

```typescript
test("V3 produces same results as legacy for simple project", () => {
  const tracks = createSimpleTracks();

  // Calculate with legacy
  const legacyResult = LegacyTimelineCalculator.calculateTimings(tracks, {});

  // Calculate with V3
  const v3Result = PureTimelineCalculator.calculate(tracks);

  // Compare positions (allow 10ms tolerance for rounding)
  expect(v3Result[0].actualStartTime).toBeCloseTo(
    legacyResult[0].actualStartTime,
    2
  );
  expect(v3Result[1].actualStartTime).toBeCloseTo(
    legacyResult[1].actualStartTime,
    2
  );
});
```

---

## Success Metrics

### Performance Metrics

| Metric                     | Current (Legacy)        | Target (V3)    | How to Measure         |
| -------------------------- | ----------------------- | -------------- | ---------------------- |
| Calculations per track add | 4-6                     | 1              | Console logs           |
| Calculation time           | ~5-10ms × 4 = 20-40ms   | ~2ms × 1 = 2ms | Performance.now()      |
| Regeneration reliability   | ~95% (sometimes breaks) | 100%           | Error tracking         |
| Redis payload size         | ~15KB                   | ~20KB          | redis-cli memory usage |

### Functional Metrics

| Feature                              | Current   | Target             | Validation             |
| ------------------------------------ | --------- | ------------------ | ---------------------- |
| Regeneration preserves relationships | Sometimes | Always             | Automated tests        |
| Load old projects                    | ✅        | ✅                 | Backward compat tests  |
| Undo/redo                            | ❌        | Ready (not impl)   | Command history exists |
| Manual editing                       | ❌        | Ready (foundation) | Architecture supports  |

### Monitoring Dashboard

```typescript
// Add to mixerStore.ts
const metrics = {
  calculationsCount: 0,
  totalCalculationTime: 0,
  regenerationsSuccessful: 0,
  regenerationsFailed: 0,

  track() {
    const start = performance.now();
    // ... calculation ...
    const elapsed = performance.now() - start;

    this.calculationsCount++;
    this.totalCalculationTime += elapsed;

    if (this.calculationsCount % 10 === 0) {
      console.log("Mixer V3 Metrics:", {
        calculations: this.calculationsCount,
        avgTime: this.totalCalculationTime / this.calculationsCount,
        successRate:
          this.regenerationsSuccessful /
          (this.regenerationsSuccessful + this.regenerationsFailed),
      });
    }
  },
};
```

---

## Future Enhancements (Post-V3)

### Phase 4: Manual Editing Support

Once V3 is stable, enable drag-and-drop editing:

1. **Drag Preview:**

   ```typescript
   onDragMove(semanticId: string, newStartTime: number) {
     // Update UI immediately (optimistic)
     this.uiStore.setDragPreview(semanticId, newStartTime);

     // Don't queue command yet (preview only)
   }

   onDragEnd(semanticId: string, finalStartTime: number) {
     // Commit change
     this.commandBatcher.queue(
       new MoveTrackCommand(semanticId, finalStartTime)
     );
   }
   ```

2. **Undo/Redo:**

   ```typescript
   class TimelineController {
     private commandHistory: TimelineCommand[] = [];
     private historyIndex = -1;

     undo() {
       if (this.historyIndex < 0) return;

       const command = this.commandHistory[this.historyIndex];
       this.timeline = command.undo(this.timeline);
       this.historyIndex--;

       this.calculateTimeline();
     }

     redo() {
       if (this.historyIndex >= this.commandHistory.length - 1) return;

       this.historyIndex++;
       const command = this.commandHistory[this.historyIndex];
       this.timeline = command.execute(this.timeline);

       this.calculateTimeline();
     }
   }
   ```

3. **Multi-Select:**

   ```typescript
   moveMultipleTracks(semanticIds: string[], deltaTime: number) {
     const commands = semanticIds.map(id =>
       new MoveTrackCommand(id, /* new time */)
     );

     // Batch command wraps multiple commands
     this.commandBatcher.queue(new BatchCommand(commands));
     // Results in single calculation for all moves
   }
   ```

### Phase 5: Advanced Features

- **Validation Layer:** Prevent invalid states (e.g., excessive overlaps)
- **Snapping:** Auto-snap to grid or other tracks
- **Grouping:** Group tracks for synchronized editing
- **Templates:** Save/load timeline arrangements
- **Event Sourcing:** Full audit trail for debugging

---

## Conclusion

Mixer V3 represents a fundamental architectural shift from reactive state management to command-based orchestration. By introducing semantic IDs, batching, and pure calculations, we eliminate the cascade problem while building a foundation for future manual editing.

The migration is designed to be **low-risk** (backward compatible, feature flagged, gradual rollout) while delivering **immediate value** (4× fewer calculations, reliable regeneration, maintainable codebase).

### Decision Points

**Do we proceed with Mixer V3?**

✅ **YES** if we want:

- Reliable regeneration that always works
- Foundation for manual editing (weeks away)
- Cleaner, maintainable codebase
- Elimination of "miraculous" behaviors

⛔ **NO** if we prefer:

- Keep current fragile system that "mostly works"
- Accept 4+ calculations per action
- Delay manual editing features indefinitely
- Continue patching the legacy calculator

### Next Steps

1. **Review this proposal** with team
2. **Approve architecture** and get alignment
3. **Create GitHub issues** for Phase 1 tasks
4. **Set up feature flag** infrastructure
5. **Begin Week 1 implementation** (foundation only, no prod impact)

---

**Document Version:** 1.1
**Last Updated:** 2025-12-05
**Status:** Foundation Laid - Exact duration tracking and server-authoritative mixer implemented. Semantic IDs, command pattern, and manual editing remain as future enhancements.
