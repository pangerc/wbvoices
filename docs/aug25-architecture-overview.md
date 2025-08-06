# Voice Generation Architecture Overview
*August 2025*

## System Architecture

### Overview
The system generates AI-powered voice advertisements by combining LLM-generated scripts with voice synthesis and audio mixing. The architecture follows a clear data flow from creative brief to final mixed audio.

```
Creative Brief → LLM → Voice Selection → TTS → Audio Mixing → Export
```

## Core Components

### 1. Creative Generation Pipeline

#### LLM Integration (`/src/utils/openai-api.ts`)
- **Models Supported**: GPT-4.1, o3 (o3-2025-04-16)
- **Input**: Client description, creative brief, campaign format, available voices with rich metadata
- **Output**: XML-structured creative with voice segments, music prompts, and voice dimensions

#### Voice Personality Data Enhancement
The LLM receives comprehensive voice metadata:
```typescript
// Example voice data sent to LLM:
Kim Baker (female, ID: kim-baker)
  Personality: confident, warm
  Best for: advertisement
  Age: young
  Accent: american
  Available styles: Default
```

#### XML Response Structure
```xml
<creative>
  <script>
    <segment>
      <voice id="voice-id" style="confident" use_case="advertisement">
        Spoken text here
      </voice>
    </segment>
  </script>
  <music>
    <prompt>Upbeat corporate music, 60 seconds</prompt>
  </music>
</creative>
```

### 2. Voice Selection & Management

#### Voice Manager (`/src/hooks/useVoiceManager.ts`)
- Filters voices by language, provider, and accent
- Handles language family matching (e.g., es-MX matches es voices)
- Manages ~636 voices from ElevenLabs and Lovo

#### Voice Data Structure
```typescript
type Voice = {
  id: string;
  name: string;
  gender: "male" | "female" | null;
  language?: Language;
  accent?: string;
  style?: string;        // Lovo emotional styles
  description?: string;  // Personality descriptor
  age?: string;
  use_case?: string;    // ElevenLabs use cases
};
```

### 3. Audio Generation Pipeline

#### Audio Service (`/src/services/audioService.ts`)
Central service for audio generation with direct mixerStore integration:
- **Voice Generation**: Maps segments to tracks, calls TTS APIs
- **Music Generation**: Integrates with Loudly and Beatoven APIs
- **Sound Effects**: ElevenLabs sound generation
- **Direct Store Updates**: No intermediate state, updates mixerStore directly

#### TTS API Integration
- **ElevenLabs** (`/api/voice/elevenlabs`): High-quality multilingual voices
- **Lovo** (`/api/voice/lovo`): Voices with emotional styles (currently underutilized)

### 4. Track Mixing & Timeline Management

#### Mixer Store (`/src/store/mixerStore.ts`)
Sophisticated 724-line Zustand store managing:
- Track positioning and timing calculations
- Concurrent voice handling
- Audio overlap and sequencing
- Volume management per track type
- Timeline visualization data

#### Track Types & Default Volumes
- **Voice**: 100% volume, sequential by default
- **Music**: 30% volume, spans full timeline
- **Sound Effects**: 70% volume, flexible positioning

#### Timing Calculation (`calculateTimings()`)
Complex algorithm handling:
- Sequential voice tracks with overlap support
- Concurrent voice groups for dialogue
- Sound effect positioning (start, after specific tracks)
- Music track duration limiting to match content

### 5. Audio Export

#### Audio Mixer (`/src/utils/audio-mixer.ts`)
- Uses Web Audio API's OfflineAudioContext
- Applies calculated timings from mixerStore
- Handles gain/volume per track
- Exports as WAV file

## Data Flow

### 1. Creative Generation
```
User Input (Brief Panel)
    ↓
generateCreativeCopy() [includes voice personality data]
    ↓
LLM (GPT-4.1/o3) [selects voices based on personality]
    ↓
XML with voice dimensions (style, useCase)
```

### 2. Voice Track Creation
```
XML Parser extracts segments with dimensions
    ↓
mapVoiceSegmentsToTracks() preserves dimensions
    ↓
VoiceTrack objects with style/useCase
    ↓
Direct update to mixerStore
```

### 3. Audio Generation
```
AudioService.generateVoiceAudio()
    ↓
TTS API call with voice dimensions
    ↓
Blob URL creation
    ↓
MixerTrack added to store with timing metadata
```

## Recent Architectural Improvements

### 1. Surgical Refactor (August 2025)
- **Problem**: Track state duplication between useTrackManager and mixerStore
- **Solution**: Eliminated intermediate state, made mixerStore single source of truth
- **Result**: Reduced page.tsx from 914 to 220 lines

### 2. Voice Personality Enhancement
- **Problem**: Voice selection lacked variety, LLM had minimal context
- **Solution**: Enhanced LLM prompts with rich voice metadata
- **Result**: Smarter voice selection based on content analysis

## Identified Areas for Improvement

### 1. Voice Selection Enhancements

#### Unlock Lovo Emotional Styles (High Impact)
- **Current**: Only using first style per voice (~636 total voices)
- **Potential**: 20-29 styles per Lovo voice = 1,000+ combinations
- **Implementation**: 
  - Modify voice listing to create entries per style
  - Update Lovo TTS to accept style IDs
  - Map style names to IDs in TTS calls

#### Duplicate Voice Prevention
- **Current**: Basic fake ID generation (voice1, voice2)
- **Issue**: Can still select same voice with different fake IDs
- **Solution**: Implement proper voice diversity algorithm in LLM prompt

#### Advanced Voice Filtering
- **Current**: Basic language/provider filtering
- **Potential**: Filter by personality, use case, age, style
- **UI**: Add advanced filter options without overwhelming users

### 2. Component Architecture Simplifications

#### Track Handling Complexity
- **Current**: 724-line mixerStore with complex timing calculations
- **Potential Improvements**:
  - Extract timing calculation to separate service
  - Simplify concurrent voice handling
  - Create declarative timing API

#### Form State Management
- **Current**: useFormManager handles multiple concerns
- **Potential**: Split into focused hooks:
  - useVoiceForm
  - useMusicForm
  - useSoundFxForm

### 3. User Experience Enhancements

#### Voice Preview in Context
- Show personality descriptions in voice dropdowns
- Preview voices with actual script text
- Display emotional style options for Lovo voices

#### Timeline Improvements
- Visual timing editor
- Drag-and-drop track positioning
- Real-time preview during editing

### 4. API Optimizations

#### Batch Voice Generation
- Current: Sequential API calls per voice segment
- Potential: Batch multiple segments in single request

#### Cache Management
- Implement voice preview caching
- Store generated audio for remix capabilities

## Security Considerations

- API keys stored in environment variables
- Client-side API calls use `dangerouslyAllowBrowser` flag
- No user authentication currently implemented
- Audio URLs are temporary blob URLs

## Performance Considerations

- Voice list loaded once and filtered client-side
- Audio generation is sequential (potential for parallelization)
- Large audio files handled via streaming where possible
- Mixer calculations optimized for real-time updates

## Future Architecture Considerations

1. **Move to Server-Side Generation**: Eliminate `dangerouslyAllowBrowser` by moving API calls server-side
2. **Implement Caching Layer**: Redis for voice data, generated audio
3. **Add Queue System**: Handle long-running audio generation tasks
4. **Modular Audio Pipeline**: Plugin architecture for new TTS/music providers
5. **Real-time Collaboration**: WebSocket-based multi-user editing

## Conclusion

The architecture successfully balances sophistication with maintainability. The recent refactoring demonstrates how careful architectural decisions (single source of truth, direct store updates) can dramatically simplify code while maintaining functionality. The voice personality enhancement shows how small data flow improvements can have significant user impact.

Key strengths:
- Clear separation of concerns
- Extensible provider system
- Sophisticated timing engine
- Direct state management

Key opportunities:
- Unlock Lovo's emotional styles for 60% more voice variety
- Further simplify component architecture
- Enhance user visibility into AI decision-making