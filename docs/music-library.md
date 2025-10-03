# Music Library Feature

## Overview

The Music Library feature allows users to browse, search, preview, and reuse music tracks from their previous projects. This eliminates the need to regenerate identical music and enables consistent audio branding across campaigns.

**Added:** December 2024
**Status:** Production-ready

---

## User Experience

### Access
Users access the Music Library via a third tab in the Music Panel:
1. **Generate** - Create new music with AI providers (Loudly, Mubert, ElevenLabs)
2. **Upload** - Upload custom music files (MP3, WAV, M4A)
3. **Library** - Browse and reuse music from previous projects ✨ **NEW**

### Features
- **Search** - Filter tracks by project title, music prompt, or provider
- **Preview** - Play any track before selecting (with play/pause controls)
- **Select** - Add track to current project's mixer with one click
- **Auto-switch** - Automatically navigates to Mixer tab after selection

### User Flow
```
1. User clicks "Library" tab in Music Panel
2. System loads all music tracks from user's projects
3. User searches/browses available tracks
4. User clicks "Preview" (▶) to listen to any track
5. User clicks "Select" to add track to current project
6. System:
   - Clears existing music from mixer
   - Adds selected track to mixer
   - Updates project state in Redis
   - Switches to Mixer tab
   - Recalculates timeline
```

---

## Architecture

### Components

#### 1. API Layer
**File:** `src/app/api/music-library/route.ts`

```typescript
GET /api/music-library?sessionId=universal-session
```

**Responsibilities:**
- Query all projects for the user session from Redis
- Extract music tracks from projects with `generatedTracks.musicUrl`
- Aggregate track metadata (title, prompt, provider, duration)
- Return sorted list (newest first)

**Response Format:**
```json
{
  "tracks": [
    {
      "projectId": "uuid",
      "projectTitle": "Holiday Campaign Q4",
      "musicPrompt": "Upbeat holiday music with bells",
      "musicProvider": "loudly",
      "musicUrl": "https://blob.vercel-storage.com/...",
      "createdAt": 1702584000000,
      "duration": 45
    }
  ]
}
```

#### 2. Type System
**File:** `src/types/index.ts`

```typescript
export type LibraryMusicTrack = {
  projectId: string;
  projectTitle: string;
  musicPrompt: string;
  musicProvider: MusicProvider;
  musicUrl: string;
  createdAt: number;
  duration?: number;
};
```

**Mixer Track Metadata Extension:**
```typescript
metadata?: {
  // ... existing fields
  source?: string;           // 'library' | 'upload' | 'generated'
  sourceProjectId?: string;  // Original project ID for library tracks
};
```

#### 3. Frontend Component
**File:** `src/components/MusicPanel.tsx`

**State Management:**
```typescript
const [mode, setMode] = useState<MusicMode>('generate' | 'upload' | 'library');
const [libraryTracks, setLibraryTracks] = useState<LibraryMusicTrack[]>([]);
const [searchQuery, setSearchQuery] = useState('');
const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
const audioRef = useRef<HTMLAudioElement | null>(null);
```

**Key Functions:**
- `loadLibraryTracks()` - Fetch tracks from API
- `handlePlayPause(track)` - Preview track with state management
- `handleLibraryTrackSelect(track)` - Add track to mixer and update project
- `filteredLibraryTracks` - Search/filter logic (useMemo)

---

## Data Flow

### Loading Library
```
User switches to Library tab
  ↓
useEffect triggers loadLibraryTracks()
  ↓
GET /api/music-library?sessionId=universal-session
  ↓
API queries Redis: PROJECT_KEYS.userProjects(sessionId)
  ↓
For each projectId: redis.get(PROJECT_KEYS.project(id))
  ↓
Filter projects with generatedTracks.musicUrl
  ↓
Extract music metadata + duration from mixerState
  ↓
Sort by createdAt (newest first)
  ↓
Return to frontend
  ↓
setLibraryTracks(data.tracks)
  ↓
Render track list with search
```

### Selecting a Track
```
User clicks "Select" on library track
  ↓
handleLibraryTrackSelect(track)
  ↓
Load current project from Redis
  ↓
updateProject(projectId, {
  generatedTracks: { musicUrl: track.musicUrl },
  musicPrompt: track.musicPrompt
})
  ↓
clearTracks("music") // Remove existing music from mixer
  ↓
addTrack({
  type: "music",
  url: track.musicUrl,
  metadata: {
    source: 'library',
    sourceProjectId: track.projectId
  }
})
  ↓
onTrackSelected() // Switch to Mixer tab
  ↓
Timeline recalculates with new track
```

---

## Audio Player State Management

### Problem Solved
Previously, clicking play on multiple tracks would play them simultaneously. The solution implements proper audio state management.

### Implementation

**Single Audio Instance:**
```typescript
const audioRef = useRef<HTMLAudioElement | null>(null);
const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
```

**Play/Pause Logic:**
```typescript
const handlePlayPause = (track) => {
  const trackId = `${track.projectId}-${track.createdAt}`;

  // If this track is playing, pause it
  if (playingTrackId === trackId && audioRef.current) {
    audioRef.current.pause();
    setPlayingTrackId(null);
    return;
  }

  // Stop any currently playing track
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current = null;
  }

  // Start new track
  const audio = new Audio(track.musicUrl);
  audioRef.current = audio;
  setPlayingTrackId(trackId);

  audio.onended = () => {
    setPlayingTrackId(null);
    audioRef.current = null;
  };

  audio.play();
};
```

**Visual Feedback:**
```tsx
const isPlaying = playingTrackId === trackId;
<button onClick={() => handlePlayPause(track)}>
  {isPlaying ? '⏸' : '▶'}
</button>
```

**Cleanup:**
- Auto-cleanup when switching away from library mode
- Auto-cleanup on component unmount
- Prevents memory leaks from orphaned audio elements

---

## Integration Points

### 1. Mixer Store
**File:** `src/store/mixerStore.ts`

**Track Replacement:**
```typescript
clearTracks("music"); // Remove existing music track
addTrack(newTrack);   // Add library track
```

**Consistent with:**
- Music generation (`audioService.ts:106`)
- Custom music upload (`MusicPanel.tsx:223`)
- Library selection (`MusicPanel.tsx:273`)

### 2. Project History Store
**File:** `src/store/projectHistoryStore.ts`

**Project Updates:**
```typescript
await updateProject(projectId, {
  generatedTracks: { musicUrl: track.musicUrl },
  musicPrompt: track.musicPrompt,
  lastModified: Date.now()
});
```

### 3. Redis Data Structure
**Keys Used:**
- `user_projects:{sessionId}` - Array of project IDs (unlimited since multi-region pilot)
- `project:{projectId}` - Full project data with music URLs
- `project_meta:{projectId}` - Project metadata for listings

**Music Track Extraction:**
```typescript
// Primary source
project.generatedTracks.musicUrl

// Duration source (if available)
project.mixerState?.tracks.find(t => t.type === "music")?.duration
```

---

## Search & Filtering

**Implementation:**
```typescript
const filteredLibraryTracks = useMemo(() => {
  if (!searchQuery.trim()) return libraryTracks;

  const query = searchQuery.toLowerCase();
  return libraryTracks.filter(track =>
    track.projectTitle.toLowerCase().includes(query) ||
    track.musicPrompt.toLowerCase().includes(query) ||
    track.musicProvider.toLowerCase().includes(query)
  );
}, [libraryTracks, searchQuery]);
```

**Search Fields:**
- Project title (e.g., "Holiday Campaign")
- Music prompt (e.g., "upbeat piano melody")
- Provider name (e.g., "loudly", "mubert")

**Performance:**
- Uses `useMemo` for efficient re-filtering
- Client-side search (all tracks loaded once)
- Instant results as user types

---

## UI Components

### Tab Navigation
```tsx
<GlassTabBar>
  <GlassTab isActive={mode === 'generate'} onClick={() => setMode('generate')}>
    {/* Sparkle icon */}
  </GlassTab>
  <GlassTab isActive={mode === 'upload'} onClick={() => setMode('upload')}>
    {/* Upload icon */}
  </GlassTab>
  <GlassTab isActive={mode === 'library'} onClick={() => setMode('library')}>
    {/* Library icon (vertical bars) */}
  </GlassTab>
</GlassTabBar>
```

### Track List Item
```tsx
<div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
  <div className="grid grid-cols-[1fr_auto] gap-4">
    <div>
      <h3>{track.projectTitle}</h3>
      <p className="line-clamp-2">{track.musicPrompt}</p>
      <p className="text-xs">
        Provider: {track.musicProvider} •
        {new Date(track.createdAt).toLocaleDateString()}
        {track.duration && ` • ${Math.round(track.duration)}s`}
      </p>
    </div>

    <div className="flex gap-2">
      <button onClick={() => handlePlayPause(track)}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button onClick={() => handleLibraryTrackSelect(track)}>
        Select
      </button>
    </div>
  </div>
</div>
```

---

## Scaling Considerations

### Current Limits
- **Project limit:** None (removed 20-project limit for multi-region pilot)
- **Session scope:** `universal-session` (all users share same library for pilot)
- **Storage:** Vercel Blob (permanent URLs, no expiration)

### Future Enhancements
- **Pagination:** Add if libraries grow beyond ~100 tracks
- **Lazy loading:** Infinite scroll for large libraries
- **Server-side search:** Move filtering to API for better performance
- **Thumbnails:** Generate waveform visualizations
- **Categories:** Auto-categorize by genre/mood
- **Favorites:** User-specific track bookmarking
- **Multi-select:** Batch operations (delete, download)
- **Export:** Download multiple tracks at once

### Performance Optimizations
- All tracks loaded once on tab open
- Client-side filtering with `useMemo`
- Audio element reuse (single instance)
- Cleanup on unmount prevents memory leaks

---

## Testing

### Manual Test Cases

**1. Library Loading**
- [ ] Switch to Library tab loads all music tracks
- [ ] Tracks sorted by creation date (newest first)
- [ ] Empty state shows helpful message

**2. Search**
- [ ] Search by project title works
- [ ] Search by music prompt works
- [ ] Search by provider name works
- [ ] Empty search results show "No matches" message
- [ ] Clear search shows all tracks again

**3. Audio Preview**
- [ ] Click ▶ plays track
- [ ] Click ⏸ pauses track
- [ ] Click ▶ on different track stops previous and plays new
- [ ] Track auto-stops at end
- [ ] Switching tabs stops playback
- [ ] Button shows correct icon (▶/⏸)

**4. Track Selection**
- [ ] Select adds track to mixer
- [ ] Select clears previous music track
- [ ] Select updates project in Redis
- [ ] Select auto-switches to Mixer tab
- [ ] Timeline recalculates correctly
- [ ] Preview shows selected track

**5. Edge Cases**
- [ ] No music in any projects (empty state)
- [ ] Only one project with music
- [ ] Multiple tracks from same project
- [ ] Very long music prompts (truncation)
- [ ] Missing duration metadata (graceful handling)

---

## Security & Privacy

### Session Isolation
- Currently: `universal-session` (all users share)
- Future: User-specific sessions with authentication

### Data Access
- API validates `sessionId` parameter
- Only returns projects owned by session
- No cross-session data leakage

### Audio URLs
- Stored in Vercel Blob (permanent, public URLs)
- No sensitive data in URLs
- CDN-backed for performance

---

## Migration Notes

### Breaking Changes
None. Feature is additive.

### Database Changes
**mixer Store metadata extension:**
```typescript
// Before
metadata?: {
  originalDuration?: number;
}

// After
metadata?: {
  originalDuration?: number;
  source?: string;           // NEW
  sourceProjectId?: string;  // NEW
}
```

### Backwards Compatibility
- Old projects without `source` field work normally
- Library only shows projects with music
- Missing duration handled gracefully (optional field)

---

## Troubleshooting

### Library is empty
**Check:**
1. Do any projects have `generatedTracks.musicUrl`?
2. Is Redis accessible?
3. Check browser console for API errors

### Track won't play
**Check:**
1. Is the Blob URL still valid?
2. Browser console for CORS errors
3. Network tab shows successful audio fetch

### Search not working
**Check:**
1. Search is case-insensitive
2. Searches across title, prompt, and provider
3. Check for typos in search query

### Track selection doesn't navigate to Mixer
**Check:**
1. `onTrackSelected` callback is wired up
2. No JavaScript errors in console
3. Mixer store is receiving the track

---

## Related Documentation

- [Music Generation API](./music-generation.md)
- [Mixer Architecture](./mixer-architecture.md)
- [Redis Data Structure](./redis-schema.md)
- [Project History](./history-feature.md)

---

## Changelog

### v1.0.0 - December 2024
- ✅ Initial release
- ✅ Search functionality
- ✅ Audio preview with play/pause
- ✅ Auto-switch to Mixer tab
- ✅ Track replacement logic
- ✅ Removed 20-project limit for multi-region pilot

### Future Roadmap
- 🔲 Pagination for large libraries
- 🔲 Waveform visualizations
- 🔲 Favorite tracks
- 🔲 Batch operations
- 🔲 Genre/mood categorization
- 🔲 Download all tracks from project
