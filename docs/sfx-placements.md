# SoundFX Placement Issue - Intro Effects Playing Simultaneously with Voices

**Status**: Parked for future UX design
**Date**: 2025-01-12
**Severity**: Medium (functional but not ideal UX)

---

## The Issue

When a soundfx is placed with "At beginning (before all voices)", it currently plays **simultaneously WITH** the first voice track instead of **sequentially BEFORE** it.

**Expected behavior**:
```
[SoundFX: 0.0s - 1.1s] → [Gap] → [Voice 1 starts at 1.1s]
```

**Actual behavior**:
```
[SoundFX: 0.0s - 1.1s]
[Voice 1: 0.0s - 5.2s]  ← Both start at same time
```

### Visual Evidence

See screenshot showing soundfx track and voice track both starting at 0:00 on timeline.

---

## Root Cause Analysis

**Location**: `src/services/legacyTimelineCalculator.ts`

### The Flow

1. ✅ **Intro soundfx positioned correctly** (lines 165-212)
   - Soundfx with `playAfter: "start"` are positioned at 0:00
   - Their total duration is calculated: `startingOffset = currentEndTime` (line 208)

2. ❌ **Voice tracks ignore `startingOffset`** (lines 228-234, 260-263)
   - Voice tracks arrive with explicit `startTime: 0` property
   - Code prioritizes explicit `startTime` over calculated `startingOffset`
   - Result: Voices start at 0:00 instead of after intro soundfx

### Code Locations

**First voice positioning** (lines 260-263):
```typescript
const explicitStartTime =
  firstVoice.startTime !== undefined && !isNaN(firstVoice.startTime)
    ? firstVoice.startTime  // ❌ Uses 0, ignores startingOffset
    : startingOffset;        // ✅ Would use 1.1s if no explicit time
```

**Metadata startTime handling** (lines 228-234):
```typescript
if (track.metadata && "startTime" in track.metadata) {
  const explicitStartTime = track.metadata.startTime as number;  // ❌ Also ignores startingOffset
  // ...
}
```

---

## Proposed Fixes (With Risk Analysis)

### Option 1: Surgical Fix - Only Offset startTime === 0 (LOWEST RISK)

**Changes needed**: Lines 260-263 AND 228-234

```typescript
// Option 1: Only replace 0 with offset, preserve all other positions
const explicitStartTime =
  firstVoice.startTime !== undefined && !isNaN(firstVoice.startTime)
    ? firstVoice.startTime === 0 && startingOffset > 0
      ? startingOffset  // Replace 0 with offset
      : firstVoice.startTime  // Keep all non-zero positions unchanged
    : startingOffset;
```

**Risk**: **Low**
- Only touches default `startTime: 0` values
- Preserves saved mixer states with explicit positions
- Won't cause cascading failures
- Subsequent voices cascade correctly via `currentEndTime`

**Cons**: Doesn't handle edge cases where user might WANT concurrent playback

---

### Option 2: Check playAfter Relationship

```typescript
const explicitStartTime =
  firstVoice.playAfter  // Defer to relationship if exists
    ? startingOffset
    : firstVoice.startTime !== undefined && !isNaN(firstVoice.startTime)
      ? firstVoice.startTime
      : startingOffset;
```

**Risk**: **Low-Medium**
- Cleaner logic but changes behavior for tracks with `playAfter`
- May affect other placement scenarios

---

### Option 3: Fix at Source (DON'T SET startTime: 0)

**Idea**: Prevent voice tracks from having `startTime: 0` during creation in `AudioService`

**Risk**: **Medium-High**
- Need to find all track creation paths
- May break if explicit `startTime` is intentional elsewhere
- More investigation required
- Least surgical approach

---

## Why This is Parked

The current implementation **lacks semantic distinction** between:
1. **Sequential placement**: "Play BEFORE voice X" (soundfx finishes, THEN voice starts)
2. **Concurrent placement**: "Play WITH voice X" (soundfx and voice overlap/simultaneous)

The UI currently only offers:
- "At beginning (before all voices)" - implies sequential
- "After voice X" - sequential
- "At end (after all voices)" - sequential

**But users might want**:
- "Before voice 1" - sequential ✅
- "With voice 1" - concurrent ❌ (not available)
- "During voice 1" - concurrent ❌ (not available)

---

## Future Enhancement Plan

### Expand SoundFxPanel Placement Picker

**Location**: `src/components/SoundFxPanel.tsx` (placement listbox around line 236)

**Current options**:
```typescript
[
  { value: "start", label: "At beginning (before all voices)" },
  { value: "afterVoice-0", label: "After voice 1" },
  { value: "afterVoice-1", label: "After voice 2" },
  { value: "end", label: "At end (after all voices)" },
]
```

**Proposed enhancement**:
```typescript
[
  { value: "start", label: "At beginning (before all voices)" },
  { value: "withVoice-0", label: "WITH voice 1 (simultaneous)" },      // NEW
  { value: "beforeVoice-0", label: "BEFORE voice 1 (sequential)" },    // NEW
  { value: "afterVoice-0", label: "AFTER voice 1 (sequential)" },
  { value: "withVoice-1", label: "WITH voice 2 (simultaneous)" },      // NEW
  { value: "beforeVoice-1", label: "BEFORE voice 1 (sequential)" },    // NEW
  { value: "afterVoice-1", label: "AFTER voice 2 (sequential)" },
  { value: "end", label: "At end (after all voices)" },
]
```

### Type System Update

**File**: `src/types/index.ts`

Add new placement intent types:
```typescript
export type SoundFxPlacementIntent =
  | { type: "start" }
  | { type: "beforeVoice"; index: number }  // NEW: Sequential before voice X
  | { type: "withVoice"; index: number }    // NEW: Concurrent with voice X
  | { type: "afterVoice"; index: number }
  | { type: "end" }
  | { type: "legacy"; playAfter: string };
```

### Timeline Calculator Updates

**File**: `src/services/legacyTimelineCalculator.ts`

Implement placement resolution:
- `beforeVoice-X`: Calculate voice X start time, place soundfx BEFORE (voice.startTime - soundfx.duration)
- `withVoice-X`: Place soundfx at same startTime as voice X (concurrent)
- `afterVoice-X`: Keep current logic (soundfx after voice finishes)

---

## Workaround for Users (Current)

If users want intro soundfx to play BEFORE voices (not simultaneously):
1. Generate soundfx with "At beginning" placement
2. Go to mixer panel
3. Manually adjust voice track positions to start after soundfx ends
4. Note: Positions won't persist if timeline is recalculated

**This is why we need proper semantic placement options.**

---

## Related Code Locations

- **Placement UI**: `src/components/SoundFxPanel.tsx` line 236-254
- **Placement types**: `src/types/index.ts` line 96-100
- **Timeline calculator**: `src/services/legacyTimelineCalculator.ts`
  - Intro soundfx: lines 165-212
  - Voice positioning: lines 228-234, 260-274
  - Placement intent resolution: lines 495-506
- **AudioService track creation**: `src/services/audioService.ts` line 233-251

---

## Testing Notes

When implementing the fix, test these scenarios:
1. ✅ Intro soundfx → voices start after (sequential)
2. ✅ No intro soundfx → voices start at 0 (baseline)
3. ✅ Saved mixer state with explicit positions → preserved
4. ✅ Multiple intro soundfx → voices start after all complete
5. ✅ Concurrent placement (future) → soundfx and voice overlap
6. ✅ afterVoice placement → still works correctly

---

## Decision Log

**2025-01-12**: Parked this issue in favor of:
1. Completing Phase 3 (multiple soundfx support)
2. Designing proper UX for sequential vs concurrent placement
3. Implementing comprehensive placement options

**Rationale**: Current behavior is functional (soundfx plays, just simultaneously). The fix requires broader UX thinking about placement semantics. Better to design it right than patch it now.
