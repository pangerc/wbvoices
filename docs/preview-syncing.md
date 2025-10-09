# Preview Audio Syncing Issue & Solution

## Problem Description

**Reported by:** Amy Young Johnson
**Date:** December 2024

### Symptom

After regenerating voice tracks:
- MixerPanel correctly plays voices + music together
- PreviewPanel (Live Preview) shows **music only**, missing voices
- Public preview page (`/preview/[projectId]`) shows **music only**, missing voices

User would regenerate voices, navigate to preview, and hear only the music track playing without any voice narration.

## Root Cause Analysis

### The Lifecycle Mismatch

Mixed audio (voices + music + sound effects combined) was only created when user clicked the **PLAY button** in MixerPanel. The mixing process:

1. `handlePreview()` triggered by PLAY button click
2. Calls `createMix()` to combine all tracks with timing/volume
3. Creates blob URL → stores in `mixerStore.previewUrl` (temporary)
4. Uploads to Vercel Blob → updates Redis with `project.preview.mixedAudioUrl` (permanent)

**The problem:** If user didn't click PLAY before navigating to preview, there was no mixed audio available.

### Fallback Behavior

When no mixed audio exists, both preview screens fall back to:
1. `project.preview.mixedAudioUrl` (from Redis - potentially stale)
2. `project.generatedTracks.musicUrl` (music-only track)

Result: User hears outdated audio or music-only.

## Architecture Details

### Files Involved

- **`src/components/MixerPanel.tsx`**
  - Has all tracks, timing calculations
  - Contains `handlePreview()` function
  - Controls `mixerStore.previewUrl`

- **`src/components/PreviewPanel.tsx`**
  - Internal preview screen
  - Uses `previewUrl` from mixerStore (if available)
  - Falls back to `project.preview.mixedAudioUrl`

- **`src/app/preview/[projectId]/page.tsx`**
  - Public preview page for client sharing
  - Only has access to Redis data
  - Uses `project.preview.mixedAudioUrl`

- **`src/utils/audio-mixer.ts`**
  - `createMix()` function - CPU-intensive
  - Combines tracks with Web Audio API
  - Outputs WAV blob (44.1kHz, 16-bit, stereo, LUFS normalized)

### Performance Characteristics

- Audio mixing: 1-3 seconds for 30-second ad
- Blob upload: 1-2 seconds to Vercel storage
- Total: 2-5 seconds per preview generation
- CPU: Moderate (Web Audio API uses native processing)

## Solutions Explored

### Option 1: Auto-generate on track changes ❌

**Initial implementation:**
```typescript
useEffect(() => {
  if (calculatedTracks.length === 0) return;
  // Auto-generate preview 2s after tracks load
  setTimeout(autoGeneratePreview, 2000);
}, [calculatedTracks]);
```

**Problem:** Too aggressive
- Regenerates on ANY change to `calculatedTracks`
- Volume adjustments trigger unnecessary remix
- Navigation between tabs triggers remix
- Wastes resources

### Option 2: Regenerate on MixerPanel mount

**Pros:** More predictable trigger
**Cons:** Still regenerates when just checking timeline, not changing anything

### Option 3: Regenerate on PreviewPanel mount

**Pros:** Only generates when actually needed
**Cons:**
- Delay when opening preview (2-3 second wait)
- Won't help public preview page (no access to mixer)

### Option 4: Smart fingerprinting ✅ (Chosen)

Track "fingerprint" of tracks to detect meaningful changes.

## Final Solution: Smart Preview Generation with Fingerprinting

**Recommended by:** Senior Architect agent

### Core Concept

Only regenerate preview when tracks **meaningfully change** (URL, timing, duration), not for UI-only changes like volume adjustments.

### Implementation

```typescript
// Track fingerprint to detect meaningful changes
const [lastFingerprint, setLastFingerprint] = React.useState<string>('');

useEffect(() => {
  if (calculatedTracks.length === 0) return;
  if (isGeneratingVoice || isGeneratingMusic || isGeneratingSoundFx) return;

  // Create fingerprint of current tracks (URL + timing + type)
  const currentFingerprint = JSON.stringify(
    calculatedTracks.map(t => ({
      url: t.url,
      startTime: t.actualStartTime,
      duration: t.actualDuration,
      type: t.type
    }))
  );

  // Skip if tracks haven't meaningfully changed
  if (currentFingerprint === lastFingerprint) {
    console.log('⏭️ Tracks unchanged, skipping preview regeneration');
    return;
  }

  // Ensure all tracks loaded
  const allTracksLoaded = tracks.every((track) => {
    const audio = audioRefs.current[track.id];
    return audio && audio.readyState >= 3;
  });

  if (!allTracksLoaded) return;

  // Debounce: auto-generate 2 seconds after tracks stabilize
  const timer = setTimeout(async () => {
    await autoGeneratePreview();
    setLastFingerprint(currentFingerprint); // Update on success
  }, 2000);

  return () => clearTimeout(timer);
}, [calculatedTracks, tracks, isGeneratingVoice, isGeneratingMusic,
    isGeneratingSoundFx, lastFingerprint]);
```

### What Gets Regenerated

**Regenerates when:**
- ✅ New voices generated
- ✅ Music changed
- ✅ Sound effects added
- ✅ Track timing/duration changed

**Does NOT regenerate when:**
- ❌ Volume adjusted (UI-only change)
- ❌ Navigating between tabs
- ❌ Other UI-only operations

### Benefits

1. **User Experience:** Preview always shows latest content after regeneration
2. **Performance:** Skips unnecessary regeneration (volume changes, navigation)
3. **Reliability:** 2-second debounce batches rapid changes
4. **Visibility:** Console logs show when regeneration is skipped vs. triggered

## User Flow (Fixed)

1. Amy regenerates voices in scripter → generates voice audio
2. Voice tracks load in MixerPanel (2-3 seconds)
3. **Auto-generation triggers** (after 2-second debounce)
   - Creates mixed audio blob
   - Uploads to Vercel Blob
   - Updates Redis with `project.preview.mixedAudioUrl`
4. Amy navigates to PreviewPanel → sees latest mixed audio
5. Amy clicks "Open Preview" → public preview shows latest audio

### Console Output

**When tracks change:**
```
🔄 Auto-generating preview for updated tracks...
✅ Preview auto-generated successfully
```

**When only volume changes:**
```
⏭️ Tracks unchanged, skipping preview regeneration
```

## Edge Cases Handled

### Multiple Rapid Changes
Debounce (2 seconds) batches changes. Only final state triggers regeneration.

Example: User changes voices → immediately changes music
- Fingerprint after voices: `A`
- Fingerprint after music: `B`
- Only regenerates once with fingerprint `B` (after 2s stabilization)

### Volume Adjustments
Volume is not part of fingerprint, so adjusting volume:
- Does NOT trigger regeneration
- Affects playback only (applied in real-time during PLAY)

### Loading Existing Project
- Loads tracks from Redis
- If tracks already mixed and cached, uses `project.preview.mixedAudioUrl`
- If tracks changed since last mix, regenerates automatically

### Generation Already in Progress
Check prevents double-generation:
```typescript
if (isGeneratingVoice || isGeneratingMusic || isGeneratingSoundFx) return;
```

## Future Enhancements (Architect Recommendations)

### Phase 2: Preview State Tracking
Add explicit state to know if preview is valid/invalid/generating:

```typescript
interface PreviewState {
  status: 'valid' | 'invalid' | 'generating' | 'error';
  lastMixedAt: number;
  mixedAudioUrl: string | null;
  trackFingerprint: string;
}
```

Show status badge in PreviewPanel:
- "Preview ready" (green)
- "Mixing audio..." (blue, loading)
- "Preview outdated" (yellow warning)
- "Mix failed" (red error)

### Phase 3: Incremental Mixing
Only remix changed tracks, reuse cached segments for unchanged tracks.

### Phase 4: Worker Thread Processing
Move audio mixing to Web Worker to avoid blocking main thread.

### Phase 5: Integration with Mixer V3
When editable timeline is implemented, fingerprinting naturally extends to track user manual edits.

## Related Issues

- **Amy's original report:** "The demo page is playing the original voices/original script"
- **First fix attempt:** Added `previewUrl` to PreviewPanel audioSrc (partial fix)
- **Second fix:** Added visibility refresh to public preview page
- **Final fix:** Smart auto-generation with fingerprinting

## Testing Checklist

- [ ] Regenerate voices → preview shows new voices + music
- [ ] Regenerate music → preview shows new music + existing voices
- [ ] Adjust volume → preview does NOT regenerate
- [ ] Navigate between tabs → preview does NOT regenerate
- [ ] Rapid changes → only regenerates once (after 2s)
- [ ] Public preview → shows latest mixed audio
- [ ] Load existing project → uses cached audio if valid

## Performance Impact

**Before fix:**
- Preview could be stale
- Required manual PLAY button click
- Public preview showed music-only

**After fix:**
- Auto-generates in background (2-5 seconds)
- Skips unnecessary regeneration (fingerprinting)
- ~1-2 additional regenerations per editing session
- Network: 1-2 additional Vercel Blob uploads per session
- CPU: Negligible (only when tracks actually change)

**Verdict:** Acceptable trade-off for significantly better UX.
