# Project History Feature - Conceptual Plan

## Overview
Enable simple project history tracking that preserves generated ads and allows quick switching between different creative iterations. Each "Generate" action in BriefPanel creates a new project entry.

## Core Concept
- **Project**: A snapshot of all current state when "Generate" is clicked
- **Auto-headline**: LLM generates a short descriptive title based on brief
- **Latest state preservation**: Always store the current state, even if user tweaks scripts/music
- **Simple dropdown**: Overlay list in Header for project switching

## Data Architecture

### Project Structure
```typescript
type ProjectBrief = {
  clientDescription: string;
  creativeBrief: string;
  campaignFormat: CampaignFormat;
  selectedLanguage: Language;
  selectedProvider: Provider;
  adDuration: number;
  selectedAccent: string | null;
  selectedAiModel: AIModel;
};

type Project = {
  id: string;                    // UUID
  headline: string;              // LLM-generated title
  timestamp: number;             // Creation time
  brief: ProjectBrief;          // Original brief settings
  voiceTracks: VoiceTrack[];    // Generated voice scripts
  musicPrompt: string;          // Music generation prompt
  soundFxPrompt: SoundFxPrompt | null; // Sound effects prompt
  // Future: store actual generated audio URLs
  generatedTracks?: {
    voiceUrls: string[];
    musicUrl?: string;
    soundFxUrl?: string;
  };
};
```

### Storage Strategy
- **LocalStorage**: Simple client-side persistence
- **Key**: `wb-voices-history`
- **Max projects**: 20 (FIFO removal)
- **Serialization**: JSON with proper date handling

## User Experience Flow

### 1. Generation Flow
```
User fills BriefPanel → Clicks "Generate" → 
  - Capture current brief state
  - Send brief to LLM for headline generation
  - Create project entry with headline + timestamp
  - Store in history
  - Continue with normal generation process
```

### 2. History Navigation
```
User clicks "History" in Header → 
  - Dropdown shows list of projects (headline + timestamp)
  - User selects project →
  - All state restored from project data
  - UI updates to show restored state
  - User can continue editing or generating new assets
```

### 3. State Persistence
- **On any significant change**: Auto-update current project's latest state
- **Triggers**: Voice script edits, music prompt changes, sound fx changes
- **Debounced**: Wait 1-2 seconds after last edit to avoid excessive saves

## Technical Implementation Plan - Zustand Architecture

### Phase 1: Core Zustand Store
1. **Project History Store** `src/store/projectHistoryStore.ts`
   ```typescript
   type ProjectHistoryState = {
     // Current project state
     currentProject: Project | null;
     currentProjectId: string | null;
     
     // History management
     projects: Project[];
     projectsById: { [id: string]: Project };
     recentProjects: Project[]; // Computed: last 10 projects
     
     // UI state
     isGeneratingHeadline: boolean;
     isAutoSaving: boolean;
     lastSaved: number | null;
     
     // Actions
     createProject: (brief: ProjectBrief) => Promise<void>;
     switchToProject: (id: string) => void;
     updateCurrentProject: (updates: Partial<Project>) => void;
     deleteProject: (id: string) => void;
     autoSave: () => void;
     loadFromStorage: () => void;
     clearHistory: () => void;
   };
   ```

2. **Zustand Persistence** using `persist` middleware
   - Automatic localStorage sync
   - Selective persistence (exclude UI state)
   - Migration support for schema changes

### Phase 2: Integration Points  
3. **Type definitions** in `src/types/index.ts` - Add Project types
4. **BriefPanel integration** - Use store actions for project creation
5. **Header dropdown** - Subscribe to store for project list
6. **State restoration** - Store handles updating all dependent state

### Phase 3: Media Asset Challenge - CRITICAL BLOCKER

**Current Asset Handling Analysis:**
- ✅ **Voice/SoundFX**: Stream from provider APIs → Create blob URLs with `URL.createObjectURL(blob)` 
- ✅ **Music (Loudly)**: Provider returns URLs to hosted assets (no blobs)
- ❌ **History Persistence**: Blob URLs expire on page refresh/tab close → **CANNOT persist projects**

**The Problem:**
```javascript
// audioService.ts:41 - Voice generation
const blob = await res.blob();
const url = URL.createObjectURL(blob);  // ← Temporary URL, dies on refresh!

// mixerStore tracks contain these temporary URLs
tracks: [{ url: "blob:http://localhost:3000/abc-123", ... }]
```

**Required Infrastructure Before History:**
1. **Asset Storage Service** - Store generated audio files permanently
2. **File Upload/Download API** - Handle asset persistence  
3. **Cleanup Management** - Handle blob URL lifecycle
4. **URL Mapping** - Convert temporary blob URLs to permanent URLs

**Implementation Decision: Go with Path B (Vercel Blob)**

Vercel Blob makes full asset persistence surprisingly simple - no complex infrastructure needed!

**Path B: Full Asset Persistence with Vercel Blob (Recommended)**
- ✅ **Simple Integration**: `npm install @vercel/blob` 
- ✅ **Vercel-hosted**: No separate service setup required
- ✅ **512MB file limit**: Perfect for audio assets 
- ✅ **Global CDN**: 18 regional hubs for fast delivery
- ✅ **Public URLs**: Persistent, shareable asset URLs
- 🎯 **Implementation**: Update audioService to upload blobs after generation

**Vercel Blob Integration Plan:**
```javascript
// New audioService pattern:
const blob = await res.blob();
const fileName = `voice-${projectId}-${Date.now()}.mp3`;
const { url: permanentUrl } = await put(fileName, blob, { access: 'public' });

// Store permanent URL instead of blob URL
const mixerTrack: MixerTrack = {
  url: permanentUrl, // ← Now persistent!
  // ... rest of track data
};
```

**Required Changes (Meticulous Migration):**

**Phase 1: Infrastructure Setup**
1. **Install Vercel Blob**: `npm install @vercel/blob`
2. **Environment Setup**: Configure `BLOB_READ_WRITE_TOKEN`
3. **Create blob utility**: `src/utils/blob-storage.ts` for consistent uploads

**Phase 2: API Route Updates (6 providers)**
4. **ElevenLabs Voice** (`/api/voice/elevenlabs/route.ts`):
   - Generate voice → Upload to Vercel Blob → Return permanent URL
5. **Lovo Voice** (`/api/voice/lovo/route.ts`):
   - Generate voice → Upload to Vercel Blob → Return permanent URL  
6. **ElevenLabs SoundFX** (`/api/sfx/elevenlabs/route.ts`):
   - Generate sound effect → Upload to Vercel Blob → Return permanent URL
7. **Beatoven Music** (`/api/music/beatoven/route.ts`): 
   - Generate music → Upload to Vercel Blob → Return permanent URL
8. **Loudly Music**: Already returns URLs from provider (no change needed)
9. **Audio Mixer Export**: Upload final mixed audio to Vercel Blob

**Phase 3: Client-Side Cleanup**  
10. **Update audioService.ts**: Remove `URL.createObjectURL()` calls
11. **Update NewMixerPanel.tsx**: Remove blob URL validation and cleanup
12. **Update mixerStore.ts**: Simplify URL handling (no more blob lifecycle)
13. **Remove blob URL references**: Clean up URL validation throughout codebase

**Phase 4: Testing & Verification**
14. **Test each provider**: Verify permanent URLs work correctly
15. **Test mixer panel**: Ensure timeline/playback works with permanent URLs
16. **Test export**: Verify final audio exports and downloads work  
17. **Load testing**: Ensure Vercel Blob handles concurrent uploads

---

## 🏴‍☠️ IMPLEMENTATION PROGRESS - BATTLE LOG

### ✅ COMPLETED VICTORIES

#### **Phase 1: Infrastructure Setup** - ⚔️ CONQUERED!
- ✅ **Vercel Blob Package**: Installed `@vercel/blob@1.1.1` via pnpm
- ✅ **Environment Setup**: `BLOB_READ_WRITE_TOKEN` configured 
- ✅ **Blob Storage Utility**: Created `src/utils/blob-storage.ts` with:
  - Generic `uploadToBlob()` and `downloadAndUploadToBlob()` functions
  - Specialized helpers: `uploadMusicToBlob()`, `uploadVoiceToBlob()`, `uploadSoundFxToBlob()`
  - Smart filename generation with timestamps and random IDs

#### **Phase 2A: Beatoven Music API** - ⚔️ CONQUERED!
- ✅ **API Route Updated**: `/api/music/beatoven/route.ts` now:
  - Downloads temporary S3 URLs from Beatoven's servers
  - Uploads to Vercel Blob with permanent URLs
  - Graceful fallback to original URL if blob upload fails
  - Enhanced response with debug info (`original_url`, `track_id`, `duration`)
- ✅ **Client API Updated**: `src/utils/beatoven-api.ts` now:
  - Accepts optional `projectId` parameter
  - Passes `duration` and `projectId` to backend
  - Handles new response structure with permanent URLs
- ✅ **Battle-Tested**: Successfully generated music track:
  - **Original URL**: `https://composition-lambda.s3-accelerate.amazonaws.com/...` (temp, 24h expiry)
  - **Permanent URL**: `https://m9ycvkwayz55mbof.public.blob.vercel-storage.com/music-beatoven-1754491144162-vgn1eb4.wav`
  - **File Size**: 3.5MB WAV file handled perfectly
  - **Timeline Integration**: Music plays flawlessly in NewMixerPanel with permanent URL

### 🎯 CURRENT CAMPAIGN: Loudly Music Assessment

#### **Phase 2B: Loudly Music Analysis** - ✅ RECONNAISSANCE COMPLETE!

**🔍 Intelligence Gathered:**
- **Current Strategy**: Loudly returns direct CDN URLs via `music_file_path`
- **No Blob Creation**: They provide permanent URLs from their own servers
- **URL Pattern**: Direct CDN hosting from `https://soundtracks-dev.loudly.com/`
- **API Response**: Returns full song data with `music_file_path` containing permanent URL
- **Client Handling**: `loudly-api.ts:90` directly uses `music_file_path` as permanent URL
- **No Temporary URLs**: Unlike Beatoven's S3 temp URLs, Loudly provides direct CDN access

**⚖️ Strategic Assessment:**
- **🛡️ BYPASS RECOMMENDED**: Loudly URLs are already permanent CDN URLs
- **✅ No Action Needed**: Current implementation is already blob-storage ready
- **🎯 Battle Priority**: Skip Loudly, advance to voice providers (higher impact targets)

#### **Phase 2C: OpenAI Voice Analysis** - 🔍 RECONNAISSANCE IN PROGRESS

**🔍 Intelligence Gathered:**
- **Current Strategy**: OpenAI API returns raw audio data (`audioArrayBuffer`)
- **Blob Generation**: Like ElevenLabs/Lovo, creates temporary blob URLs via `URL.createObjectURL()`
- **API Response**: Direct `ArrayBuffer` response, not pre-hosted URLs
- **URL Pattern**: Temporary blob URLs that expire on refresh
- **Provider Code**: `/api/voice/openai/route.ts:82-87` returns raw audio buffer
- **Client Impact**: Same blob URL lifecycle issues as other voice providers

**⚖️ Strategic Assessment:**
- **⚔️ RAID REQUIRED**: OpenAI needs Vercel Blob integration (same pattern as Beatoven)
- **🎯 High Priority**: Voice providers are critical for project history
- **📋 Action Plan**: Apply proven Beatoven pattern to OpenAI voice generation

### 🚢 NEXT TARGETS IN OUR FLEET

#### **Remaining API Providers to Conquer:**
- ✅ **Loudly Music** (`/api/music/loudly/route.ts`) - *BYPASSED - Already permanent CDN URLs*
- 🎯 **OpenAI Voice** (`/api/voice/openai/route.ts`) - *NEXT TARGET - High priority blob target*
- ⚔️ **ElevenLabs Voice** (`/api/voice/elevenlabs/route.ts`) - *High priority blob target*
- ⚔️ **Lovo Voice** (`/api/voice/lovo/route.ts`) - *High priority blob target*  
- ⚔️ **ElevenLabs SoundFX** (`/api/sfx/elevenlabs/route.ts`) - *High priority blob target*
- ⚔️ **Audio Mixer Export** (final mix uploads) - *Future treasure*

#### **Expected Difficulty:**
- **Loudly**: ✅ COMPLETED - No action needed (permanent CDN URLs)
- **OpenAI Voice**: Medium complexity (blob generation, same pattern as Beatoven)
- **ElevenLabs Voice**: Medium complexity (blob generation, same pattern as Beatoven)
- **Lovo Voice**: Medium complexity (blob generation, same pattern as Beatoven)
- **SoundFX**: Medium complexity (blob generation)
- **Final Export**: High complexity (requires mixer integration)

### 🗡️ BATTLE-PROVEN PATTERNS

**The Vercel Blob Raid Formula:**
```typescript
// 1. Intercept API response with temporary URL
const temporaryUrl = apiResponse.audio_url;

// 2. Download and upload to permanent storage  
const blobResult = await uploadMusicToBlob(
  temporaryUrl,
  prompt, 
  'provider-name',
  projectId
);

// 3. Return permanent URL instead
return { 
  track_url: blobResult.url,  // ← Permanent treasure!
  original_url: temporaryUrl, // ← For debugging
  // ... other response data
};
```

---

## 🏆 TACTICAL ADVANTAGES GAINED

### **Permanent Asset Storage Achieved**
- ✅ **No More Blob URL Expiration**: Assets survive page refreshes
- ✅ **True Project History Enabled**: Can now store permanent references  
- ✅ **Global CDN Distribution**: Vercel's 18 regional hubs for speed
- ✅ **Simple Integration**: No complex infrastructure setup required

### **Battle-Ready Infrastructure** 
- ✅ **Scalable Pattern**: Proven approach for all remaining providers
- ✅ **Error Handling**: Graceful fallbacks if blob upload fails
- ✅ **Debug-Friendly**: Original URLs preserved for troubleshooting
- ✅ **Cost-Effective**: Only pay for actual storage used

---

*Next battle orders await, Captain! Shall we proceed with Loudly reconnaissance or pivot to the voice provider raids?*

## Headline Generation Strategy

### AI Prompt for Headlines
```
Based on this creative brief, generate a short 3-5 word headline that captures the essence of this ad campaign:

Client: {clientDescription}
Brief: {creativeBrief}
Format: {campaignFormat}
Language: {selectedLanguage}

Examples:
- "BMW Summer Sales Push"
- "Nike Marathon Motivational"
- "Spotify Student Discount Fun"
- "Mercedes Luxury Dialogue"

Return only the headline, no quotes or explanations.
```

### Fallback Strategy
- If headline generation fails: Use first 4-5 words of creativeBrief
- If brief is empty: "Untitled Project {timestamp}"

## UI Components

### Header History Dropdown
- **Trigger**: "History" button (existing clock icon)
- **Style**: Glass overlay dropdown, consistent with existing UI
- **Content**: 
  - Project headline (bold)
  - Timestamp (small, gray)
  - Language + format badges
  - Max 10 visible items with scroll

### Project List Item
```
[Headline]                    [timestamp]
Client description preview... [language] [format]
```

## Edge Cases & Considerations

### Data Management
- **Storage limits**: Warn if approaching localStorage limits
- **Corruption**: Validate data on load, skip corrupted entries
- **Migration**: Handle future schema changes gracefully

### User Experience
- **Current project indicator**: Show "*" or highlight current project
- **Deletion**: Simple swipe-to-delete or context menu
- **Export**: Future consideration for sharing projects

### Performance
- **Lazy loading**: Only load project list when dropdown opens
- **Debounced saves**: Avoid excessive localStorage writes
- **Memory management**: Clean up old projects automatically

## Future Enhancements
- **Cloud sync**: Store projects in database for cross-device access
- **Collaboration**: Share project links with team members
- **Templates**: Save successful projects as reusable templates
- **Analytics**: Track which project types perform best
- **Export**: Download projects as JSON or share publicly

## Success Metrics
- Users create multiple projects in a session
- Users return to previous projects for iteration
- Reduced "Start Over" usage (indicates better project management)
- Faster iteration cycles between creative variations

---

This feature enables the creative workflow where users can rapidly iterate on different approaches while maintaining their work history. The focus is on simplicity and minimal friction to encourage experimentation.