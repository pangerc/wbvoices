# Custom Music Upload Flow

## Overview

Users can upload their own music tracks (MP3, WAV, M4A, up to 50MB) instead of generating music. The upload bypasses Vercel's 4.5MB serverless function body limit by uploading directly to Vercel Blob from the browser, using a server-generated token for auth.

After upload, a new immutable music version is created in Redis following the V3 versioning pattern. The user can then send it to the mixer.

## Upload Flow (Two-Step Direct Blob Upload)

The file never passes through a serverless function. Instead:

```
Browser ──[1. token request (JSON)]──> /api/upload-asset-token
         <──{ filename, token }────────┘

Browser ──[2. file binary + token]───> Vercel Blob Storage (direct)
         <──{ url }───────────────────┘
```

### Step 1: Get Upload Token

`FileUpload.tsx` sends a small JSON POST to `/api/upload-asset-token` with file metadata (type, size, name, projectId). The endpoint validates the file against `FILE_CONFIGS` (allowed MIME types, max size) and returns:

- `filename`: Generated blob path like `custom-music-{projectId}-{timestamp}.mp3`
- `token`: The `BLOB_READ_WRITE_TOKEN` env var

### Step 2: Direct Upload to Vercel Blob

`FileUpload.tsx` calls `put()` from `@vercel/blob` with the token and filename. The file goes directly from the browser to Vercel Blob storage — no serverless function body limit applies.

### Client-Side Extras

Before uploading, `FileUpload.tsx` also:
- **Validates file size** client-side against known limits (50MB for music)
- **Measures audio duration** using HTML5 Audio element's `loadedmetadata` event

This is the same pattern used by `uploadMixedAudioToBlob()` in `blob-storage.ts` for mixed audio exports.

## Version Creation (V3 Immutable Pattern)

After the file is in Vercel Blob, `MusicPanel.tsx` calls its `onTrackSelected` prop with the blob URL, filename, and duration. This reaches `MusicDraftEditor.handleTrackSelected()` which creates a new version in three steps:

### 1. Freeze Existing Draft

```
POST /api/ads/{adId}/music/{currentDraftId}/freeze?forceFreeze=true
```

The current draft version's status changes from `"draft"` to `"frozen"` (immutable). This prevents edits to the old version.

### 2. Create New Version

```
POST /api/ads/{adId}/music
Body: {
  musicPrompt: "my-song.mp3",     // original filename as label
  musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
  duration: 123.45,                // from client-side measurement
  provider: "custom",              // distinguishes from generated music
  createdBy: "user"
}
```

Creates a new version in Redis with `status: "draft"` and `generatedUrl: ""` (empty initially). Returns `{ versionId: "v5" }`.

### 3. Patch URL onto Version

```
PATCH /api/ads/{adId}/music/v5
Body: { generatedUrl: "https://...blob.vercel-storage.com/custom-music-..." }
```

Sets the Vercel Blob URL on the version. Only works if the version is still in `"draft"` status.

After all three steps, `onUpdate()` triggers SWR revalidation so the UI shows the new version.

## Mixer Integration

The custom music version exists but isn't in the mixer yet — it's a draft. The user clicks "Send to Mixer" to activate it:

```
POST /api/ads/{adId}/music/v5/freeze
```

This endpoint:
1. Sets `ad:{adId}:music:active = "v5"` in Redis
2. Calls `rebuildMixer(adId)` which:
   - Loads the active music version (including the Blob URL)
   - Builds a `MixerTrack` with `type: "music"`, the Blob URL, and measured duration
   - Calculates timeline positions using `LegacyTimelineCalculator`
   - Saves the complete `MixerState` to Redis at `ad:{adId}:mixer`
3. Returns the rebuilt mixer state

The `MixerPanel` component polls `/api/ads/{adId}/mixer` via SWR (2s dedup interval). When the mixer state changes, it hydrates the Zustand store and the UI renders the custom music track in the timeline.

## Data Flow Summary

```
User selects file
       |
FileUpload: measure duration + get token + direct Blob upload
       |
MusicPanel.handleMusicUpload(url, filename, duration)
       |
MusicDraftEditor.handleTrackSelected()
       |
       ├── POST .../freeze?forceFreeze=true   (freeze old draft)
       ├── POST .../music                      (create v5, generatedUrl="")
       └── PATCH .../music/v5                  (set generatedUrl = Blob URL)
       |
onUpdate() → SWR revalidates music versions
       |
(User clicks "Send to Mixer")
       |
POST .../music/v5/freeze
       ├── setActiveVersion("v5")
       └── rebuildMixer()
              ├── load v5 with Blob URL
              ├── build MixerTrack
              └── save MixerState to Redis
       |
MixerPanel SWR detects change → hydrates store → renders track
```

## Redis State

After a custom music upload and send-to-mixer:

```
ad:{adId}:music:versions    = ["v1", "v2", ..., "v5"]   # version ID list
ad:{adId}:music:counter     = "5"                         # atomic counter
ad:{adId}:music:active      = "v5"                        # active version pointer

ad:{adId}:music:v:v5 = {
  musicPrompt: "my-song.mp3",
  musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
  generatedUrl: "https://...blob.vercel-storage.com/custom-music-...",
  duration: 123.45,
  provider: "custom",
  createdAt: 1708123456789,
  createdBy: "user",
  status: "frozen"
}

ad:{adId}:mixer = {
  tracks: [
    { id: "music-v5", type: "music", url: "https://...blob...", ... }
  ],
  activeVersions: { voices: "v3", music: "v5", sfx: null },
  ...
}
```

## Key Files

| File | Role |
|------|------|
| `src/components/ui/FileUpload.tsx` | Two-step upload: token request + direct `put()` to Blob |
| `src/app/api/upload-asset-token/route.ts` | Validates metadata, returns `{ filename, token }` |
| `src/components/MusicPanel.tsx` | Upload tab UI, `handleMusicUpload` callback |
| `src/components/draft-editors/MusicDraftEditor.tsx` | `handleTrackSelected`: freeze → create → patch |
| `src/app/api/ads/[id]/music/route.ts` | POST: create new music version in Redis |
| `src/app/api/ads/[id]/music/[versionId]/route.ts` | PATCH: set `generatedUrl` on draft version |
| `src/app/api/ads/[id]/music/[versionId]/freeze/route.ts` | Freeze version, set active, rebuild mixer |
| `src/lib/mixer/rebuilder.ts` | `rebuildMixer()`: loads active versions, builds MixerState |
| `src/lib/redis/versions.ts` | `createVersion`, `setActiveVersion`, `freezeVersion` |
