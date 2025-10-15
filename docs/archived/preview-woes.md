# Preview Audio Syncing Issues - Root Cause Analysis

**Date:** January 2025
**Reporter:** Amy Young Johnson (and recurring issues)

## Symptoms

### Primary Issue
After regenerating voice tracks in MixerPanel:
1. User clicks PLAY in MixerPanel → hears correct mix (voices + music)
2. User navigates to PreviewPanel (a minute later)
3. No "generating" overlay shown
4. No "generating" state in button
5. Clicking play → hangs in silence for 10 seconds
6. Browser console error: "The operation was aborted"
7. Preview eventually plays **music only** (missing voices)

### Secondary Issues
- Export downloads `blob:https://...` URL instead of permanent Vercel URL
- Public preview page (`/preview/[projectId]`) plays music only
- Redis entries missing `preview.mixedAudioUrl` field entirely
- Issue occurs on slow connections (tethered) but not gigabit wifi

## Architecture Context

### Audio Mixing Flow
1. **MixerPanel**: Creates mix locally using Web Audio API
2. **Local Playback**: Uses local blob URL for immediate playback
3. **Background Upload**: Uploads to Vercel Blob (1-5 seconds on slow connection)
4. **Redis Update**: Saves permanent URL to `project.preview.mixedAudioUrl`
5. **PreviewPanel**: Falls back to Redis URL → falls back to music-only

### State Management (Zustand)
```typescript
isUploadingMix: boolean    // Upload in progress?
isPreviewValid: boolean    // Is mixed audio available?
previewUrl: string | null  // Permanent Vercel URL
```

## Attempted Solutions

### Solution 1: Fingerprinting Auto-Generation ❌
**Approach**: Auto-generate preview when tracks change, using fingerprinting to detect meaningful changes

**Problem**: Too complex, regenerated on volume changes, user explicitly rejected as "pretentious crap"

**Verdict**: Abandoned in favor of "lean and mean" manual generation

### Solution 2: Local + Permanent URL Juggling ✅ (Partial)
**Approach**: Use local blob for immediate playback, upload permanent URL in background

**Problem**: Fixed immediate playback but introduced new issues:
- Upload state not visible after navigation
- No timeout detection for stuck uploads
- Errors swallowed silently

### Solution 3: `isPreviewValid` Flag ✅ (Partial)
**Approach**: Track validity with boolean flag, invalidate on track changes

**Problem**: Flag never set to `false` on upload failure, never set to `true` when loading existing projects

### Solution 4: Race Condition Fix ✅ (Partial)
**Approach**: Load fresh project from Redis before every `updateProject()` call in PreviewPanel

**Fix**: Prevented PreviewPanel from overwriting MixerPanel's `mixedAudioUrl` with stale state

**Problem**: Didn't address upload failure detection or state initialization

## Root Cause (Finally Found)

### Bug 1: Incomplete Error Handling
**Location**: `MixerPanel.tsx:520-526` (catch block)

```typescript
.catch(error => {
  console.error("Background upload failed:", error);
  setIsUploadingMix(false);
  // ❌ BUG: Doesn't set isPreviewValid = false!
  // ❌ BUG: Doesn't set uploadError!
});
```

**Result**: Upload fails → `isUploadingMix = false`, `isPreviewValid = false` (stays initial state)
- Overlay logic: `isInvalid={!false && !false}` = `true`
- But user sees NO overlay because we don't display it properly
- Falls back to `project.preview.mixedAudioUrl` (doesn't exist) → music-only

### Bug 2: Missing State Initialization
**Location**: `PreviewPanel.tsx:138-140` (useEffect)

**Problem**: When loading project with existing `mixedAudioUrl`, never set `isPreviewValid = true`

**Result**: Shows "invalid" overlay even on cached previews that are actually valid

### Bug 3: No Timeout Detection
**Problem**: If upload hangs (slow connection, network issue), `isUploadingMix` stays `true` forever

**Result**: User navigates to PreviewPanel an hour later, still sees "generating" overlay

## Final Solution

### 1. Added Upload Error State (`mixerStore.ts`)
```typescript
uploadError: string | null
setUploadError: (error: string | null) => void
```

### 2. Fixed Error Handling (`MixerPanel.tsx:504-526`)
- Added 30-second timeout for stuck uploads
- Set `isPreviewValid = false` in catch block
- Set `uploadError` with specific message
- Clear all preview state when regenerating

### 3. Initialize State for Existing Projects (`PreviewPanel.tsx:142-148`)
```typescript
if (loadedProject.preview?.mixedAudioUrl) {
  setIsPreviewValid(true);
} else {
  console.log('⚠️ Project has no mixedAudioUrl, preview is invalid');
}
```

### 4. Display Error States (`SpotifyPreview.tsx:396-420`)
- Show red overlay with error message on upload failure
- Show timeout message after 30 seconds
- Show "invalid" warning when preview is stale

## Testing Checklist

- [ ] Regenerate voices → wait 1 minute → navigate to PreviewPanel
  - Should show overlay if upload still in progress
  - Should show error if upload failed
  - Should play correct audio if upload succeeded

- [ ] Test on slow connection (throttle to 3G)
  - Should show timeout after 30 seconds
  - Should display error message

- [ ] Load existing project with cached preview
  - Should NOT show "invalid" overlay
  - Should play cached audio immediately

- [ ] Navigate between tabs while upload in progress
  - State should persist across navigation
  - Overlay should remain visible

## Lessons Learned

1. **Error handling must be complete**: Setting upload state to `false` is not enough - must also set validity and error states
2. **State initialization matters**: Loading existing data requires initializing derived states
3. **Timeouts are essential**: Network operations need timeout detection to prevent infinite loading states
4. **Zustand state persists across navigation**: Shared state is visible to all components using the store
5. **Shallow merge in API is dangerous**: Must load fresh data before updating to avoid overwriting concurrent changes

## Related Issues

- See `preview-syncing.md` for earlier fingerprinting approach
- See `aug25-architecture-overview.md` for overall system design
