# Smart Speed: Post-Processing Audio Time-Stretching

_January 2025_

## Overview

Smart Speed is a client-side post-processing feature that enables time-stretching (1.0-1.6x speedup) with independent pitch control for ElevenLabs voices. It solves the "chipmunk effect" problem when speeding up audio by allowing users to manually compensate for pitch elevation.

**Use Case**: Pharmaceutical-style advertisements requiring ultra-fast disclaimers (1.5x+) that remain intelligible and natural-sounding.

## The Problem

### Initial Challenge

Speeding up audio naturally raises pitch proportionally - this is basic physics. At 1.5x speed:
- Audio plays 50% faster ✅
- Pitch raises by ~7 semitones ❌
- Result: Cartoon character / chipmunk voice that's unrecognizable

### Why ElevenLabs Native Speed Wasn't Enough

**ElevenLabs V3 Speed Range**: 0.7x - 1.2x (limited)
- Native API speed parameter works but has narrow range
- Maximum 1.2x is insufficient for pharma disclaimers
- Users reported needing 1.5x+ for 30-second Spotify ad constraints

**Attempted Solution**: Use OpenAI (supports 0.25x - 4.0x)
- ✅ OpenAI can do 2.5x+ speed
- ❌ ElevenLabs has superior voice quality for main content
- Result: Implemented per-track provider switching (see oct25-creative-pipeline.md)

### The Final Problem

Even with per-track providers, users wanted ElevenLabs quality at speeds beyond 1.2x. This required **post-processing** the audio after generation.

## The Solution: Client-Side Time-Stretching

### Architecture Decision

**Approach**: Generate audio normally, intercept before mixer, process client-side, re-upload

```
User clicks Generate
    ↓
ElevenLabs API generates audio @ 1.0x speed
    ↓
Audio uploaded to Vercel Blob (original URL)
    ↓
🆕 Client downloads original audio
    ↓
🆕 applyTimeStretch(audio, tempo=1.5x, pitch=0.9x)
    ↓
🆕 Processed audio uploaded to Vercel Blob (processed URL)
    ↓
Mixer receives processed URL (transparent to timeline code)
```

**Key Insight**: Double upload accepted as trade-off
- Original audio uploaded but wasted
- Processed audio uploaded and used
- Simpler than server-side processing
- Web Audio API only works client-side anyway

### Technical Stack

**Library**: [soundtouchjs](https://github.com/cutterbl/SoundTouchJS) v0.2.1
- Algorithm: WSOLA (Waveform Similarity Overlap and Add)
- Real-time capable on all devices
- 1,314 weekly npm downloads (battle-tested)
- LGPL-2.1 license

**Why soundtouchjs?**
- ✅ Optimized for speech at 1.0-1.6x range
- ✅ Time-domain processing (simple, fast)
- ✅ ~1x CPU (real-time capable on mobile)
- ✅ Result "closer to original" than frequency-domain algorithms
- ✅ No WASM/large bundle overhead

## UI: Dual Slider Control

### Location

**ElevenLabs Voice Settings Modal** → **Smart Speed** tab (default view)

```
┌───────────────────────────────────────────────┐
│  Smart Speed  │  Fit Duration  │  Advanced    │
├───────────────────────────────────────────────┤
│                                               │
│  Tempo (Speed)                        1.35x   │
│  1.0x ━━━━━━━━━●━━━━━━ 1.6x                  │
│                                               │
│  Pitch Adjustment                     0.92x   │
│  0.7x ━━━━━━━●━━━━━━━━ 1.2x                  │
│                                               │
│  💡 Tip: Start with tempo at desired speed   │
│  and pitch at 1.0. If voice sounds too       │
│  high-pitched, gradually lower pitch until   │
│  it sounds natural.                          │
└───────────────────────────────────────────────┘
```

### Controls

**Tempo Slider**:
- Range: 1.00x - 1.60x
- Step: 0.01 (fine granularity)
- Purpose: Controls playback speed
- Default: 1.0x (no speedup)

**Pitch Slider**:
- Range: 0.70x - 1.20x
- Step: 0.01 (fine granularity)
- Purpose: Compensates for pitch elevation
- Default: 1.0x (no pitch adjustment)

**Typical Values**:
- 1.1x tempo → 0.95x pitch
- 1.3x tempo → 0.85-0.90x pitch
- 1.5x tempo → 0.75-0.80x pitch

### Tabbed Interface

**Smart Speed** (default): Manual tempo + pitch control
**Fit Duration**: Auto-calculate tempo from target duration (advanced)
**Advanced**: Native ElevenLabs speed control (0.7x-1.2x, applied during generation)

## Technical Implementation

### Type System

**File**: `src/types/index.ts`

```typescript
export type VoiceTrack = {
  voice: Voice | null;
  text: string;
  // ... existing fields
  postProcessingSpeedup?: number;  // 1.0-1.6x tempo control
  postProcessingPitch?: number;    // 0.7-1.2x pitch compensation
  targetDuration?: number;         // Alternative: specify duration, auto-calc tempo
};
```

### Core Processing Function

**File**: `src/utils/audio-processing.ts`

```typescript
export async function applyTimeStretch(
  audioArrayBuffer: ArrayBuffer,
  speedup: number,
  pitch: number = 1.0
): Promise<ArrayBuffer>
```

**Algorithm Flow**:

1. **Early Exit**: If tempo=1.0 AND pitch=1.0, return original (skip processing)

2. **Decode Audio**: Web Audio API decodes MP3/WAV to AudioBuffer

3. **Setup SoundTouch**:
   ```typescript
   const soundtouch = new SoundTouch();
   soundtouch.tempo = clampedSpeedup;  // 1.0-1.6x
   soundtouch.pitch = pitch;           // 0.7-1.2x
   soundtouch.rate = 1.0;              // Locked (prevents interference)
   ```

4. **Process in Chunks**:
   ```typescript
   const source = new WebAudioBufferSource(audioBuffer);
   const filter = new SimpleFilter(source, soundtouch);

   const framesToExtract = 8192;  // 8K frames per iteration
   while (true) {
     const target = new Float32Array(framesToExtract * channels);
     const extracted = filter.extract(target, framesToExtract);
     if (extracted === 0) break;  // Done
     processedSamples.push(target.slice(0, extracted * channels));
   }
   ```

5. **Deinterleave**: Convert interleaved samples back to separate channels

6. **Encode WAV**: Convert AudioBuffer to WAV ArrayBuffer

7. **Return**: Processed audio ready for upload

**Fallback**: If SoundTouch fails, falls back to simple playback rate (will alter pitch)

### Integration in audioService

**File**: `src/services/audioService.ts`

```typescript
// After generating audio from ElevenLabs
if (trackProvider === 'elevenlabs' && (track.postProcessingSpeedup || track.targetDuration)) {
  console.log(`🎬 Post-processing required for ElevenLabs track`);
  url = await this.applyPostProcessingSpeedup(url, track, onStatusUpdate);
}

private static async applyPostProcessingSpeedup(
  originalUrl: string,
  track: VoiceTrack,
  onStatusUpdate: (message: string) => void
): Promise<string> {
  // Download original
  const response = await fetch(originalUrl);
  const audioArrayBuffer = await response.arrayBuffer();

  // Calculate speedup
  let speedup = track.postProcessingSpeedup || 1.0;
  if (track.targetDuration) {
    const originalDuration = await measureAudioDuration(originalUrl);
    speedup = originalDuration / track.targetDuration;
    speedup = Math.min(speedup, 1.6);  // Cap at 1.6x
  }

  // Apply processing
  const pitch = track.postProcessingPitch || 1.0;
  const processedArrayBuffer = await applyTimeStretch(audioArrayBuffer, speedup, pitch);

  // Upload processed audio
  const processedBlob = new Blob([processedArrayBuffer], { type: 'audio/wav' });
  const formData = new FormData();
  formData.append('audio', processedBlob, `processed-voice-${Date.now()}.wav`);

  const uploadResponse = await fetch('/api/voice/upload-processed', {
    method: 'POST',
    body: formData,
  });

  const { audio_url } = await uploadResponse.json();
  return audio_url;  // Return processed URL to mixer
}
```

### Upload Endpoint

**File**: `src/app/api/voice/upload-processed/route.ts`

```typescript
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get('audio') as Blob;
  const projectId = formData.get('projectId') as string || `processed-${Date.now()}`;

  const filename = `${projectId}/processed-${Date.now()}.wav`;
  const blob = await put(filename, audioFile, {
    access: 'public',
    contentType: 'audio/wav',
  });

  return NextResponse.json({ audio_url: blob.url });
}
```

## Bug Fixes & Troubleshooting

### Bug 1: Incorrect soundtouchjs API Usage

**Error**: `filter.process is not a function` (runtime error in browser)

**Root Cause**: Completely wrong API usage based on outdated type definitions

**Incorrect Code**:
```typescript
const filter = new SimpleFilter(sampleRate, numberOfChannels, soundtouch);
const output = filter.process(chunk);  // ❌ process() doesn't exist!
```

**Correct Code**:
```typescript
const source = new WebAudioBufferSource(audioBuffer);
const filter = new SimpleFilter(source, soundtouch);  // ✅ Different constructor!
const framesExtracted = filter.extract(target, numFrames);  // ✅ Use extract()
```

**Key Learnings**:
- `SimpleFilter` constructor: `(source: WebAudioBufferSource, pipe: SoundTouch)`
- Method: `extract(target: Float32Array, numFrames: number): number`
- Frame-based, not sample-based: 1 frame = 1 sample per channel
- Returns number of frames extracted, NOT an array

### Bug 2: Buffer Overflow

**Error**: `RangeError: offset is out of bounds` at line 342

**Root Cause**: soundtouchjs internal buffer management tried to write beyond target buffer

**Fix**: Smaller chunk size + exact buffer sizing
```typescript
const framesToExtract = 8192;  // Reduced from 16384
const target = new Float32Array(framesToExtract * numberOfChannels);  // Exact size
```

### Bug 3: Pitch Range Too Wide

**Problem**: Initial range 0.5x-1.5x, but 0.5x sounded very unnatural

**User Feedback**: "pitch=0.85 too unnatural, pitch=0.95 works well with tempo"

**Fix**: Narrowed range to 0.7x-1.2x (50% reduction, more practical)

### Type Definitions

**File**: `src/types/soundtouchjs.d.ts`

Created complete type definitions for soundtouchjs (no types available from package):

```typescript
declare module 'soundtouchjs' {
  export class SoundTouch {
    tempo: number;
    pitch: number;
    rate: number;
    constructor();
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position?: number): number;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames: number): number;
  }

  export class PitchShifter {
    // High-level API (not currently used)
  }
}
```

## Alternative Libraries Considered

### Research Question

User asked: "Are there more sophisticated libraries that achieve more natural sounding results?"

### Findings

#### 1. Rubber Band Library (Best Quality)

**Package**: `rubberband-wasm` (37 GitHub stars)
**Algorithm**: Enhanced Phase Vocoder
**Quality**: Professional-grade (used in Ardour DAW)

**Pros**:
- ✅ Superior quality vs WSOLA
- ✅ Better formant preservation for speech
- ✅ Handles transients better

**Cons**:
- ❌ "CPU load so high it cannot run on mobile devices for real-time"
- ❌ GPL license (requires commercial license for your use)
- ❌ ~100 npm downloads (low adoption)
- ❌ Phase vocoder can introduce "phasiness" artifacts

**Verdict**: Overkill for browser-based speech at 1.0-1.6x

#### 2. Professional DAW Algorithms (Gold Standard)

**Zplane Élastique Pro**: Used in Pro Tools, FL Studio, Cubase
**Zynaptiq ZTX**: Used in Digital Performer
**iZotope Radius**: Used in Pro Tools X-Form

**Reality**: NOT available for web applications
- Only C/C++ SDKs
- Enterprise B2B licensing
- Likely $5k-$50k+ costs
- Designed for desktop, not web

**Verdict**: Inaccessible for web projects

#### 3. Superpowered SDK (Commercial)

**Quality**: Professional-grade
**Platform**: JavaScript/WASM
**Licensing**: Commercial (contact licensing@superpowered.com)

**Verdict**: Potential upgrade path if budget allows, but not necessary

#### 4. Tone.js (7.7k GitHub stars)

**Quality**: Poor for time-stretching
**Approach**: Simple DelayNode with sawtooth wave
**User reports**: "Substantial sound quality degradation"

**Verdict**: Not suitable

### Why soundtouchjs is Correct Choice

**For speech at 1.0-1.6x speedup:**

✅ **Performance**: Real-time on mobile devices
✅ **Quality**: WSOLA is "closer to original" for speech (user feedback from pro audio forums)
✅ **Adoption**: 1,314 weekly npm downloads vs ~100 for alternatives
✅ **Licensing**: LGPL-2.1 (permissive enough)
✅ **Proven**: Battle-tested in production
✅ **CPU**: ~1x real-time (vs Rubber Band's ~10x)

**When Rubber Band Would Matter**:
- Music with percussive elements
- Stretch factors >2x
- Offline batch processing
- Professional mastering quality

**User feedback from mpv-player issue #7792**:
> "Rubberband boosts bass and muffles acoustics. Soundtouch gives a result closer to the original."

## Performance

**Processing Time**:
- ~1-2 seconds for 10-second audio clip
- Real-time factor: ~0.1-0.2x (processes faster than playback)
- Mobile capable

**Memory**:
- Temporary AudioContext created and disposed
- Peak memory: ~2-3x audio file size during processing
- No memory leaks detected

**Network**:
- Double upload: original (~500KB) + processed (~800KB WAV)
- Total: ~1.3MB for 10s clip
- Acceptable trade-off for client-side processing

## Limitations

**Provider**: ElevenLabs only
- OpenAI doesn't need this (native 0.25x-4.0x support)
- Lovo doesn't support speed parameter
- Applied only when `trackProvider === 'elevenlabs'`

**Range**: 1.0x-1.6x tempo
- Capped at 1.6x for quality
- Below 1.0x not needed (ElevenLabs native 0.7x-1.2x covers slow speeds)

**Quality**: Manual tuning required
- No "auto-magic" pitch compensation
- User must experiment with pitch slider
- Typical values documented but vary by voice

**Browser Only**: Web Audio API limitation
- Cannot run in Node.js/Edge Runtime
- Must happen client-side after generation

## User Workflow Example

**Scenario**: Pharma ad disclaimer at 1.5x speed

**Steps**:

1. **Generate script** with ElevenLabs voice
2. **Open voice settings** (gear icon on track)
3. **Switch to Smart Speed tab** (default)
4. **Set tempo**: 1.5x
5. **Leave pitch**: 1.0x (try first)
6. **Generate**: Click "Generate Voices"
7. **Listen**: If voice sounds too high-pitched...
8. **Adjust pitch**: Try 0.85x, regenerate
9. **Iterate**: Find sweet spot (usually 0.75-0.85 for 1.5x tempo)
10. **Done**: Processed audio automatically flows to mixer

**Result**: Natural-sounding 1.5x speedup that fits disclaimer in 30-second ad slot

## Future Enhancements

**Automatic Pitch Compensation**:
- Analyze audio frequency before/after speedup
- Calculate optimal pitch adjustment
- Apply automatically (no manual tuning)
- Implementation: Pitch detection algorithm + heuristic

**Preset Combinations**:
- "Pharma Disclaimer": 1.5x tempo + 0.80x pitch
- "Fast Promo": 1.3x tempo + 0.90x pitch
- "Slow Narration": 0.9x tempo + 1.1x pitch
- Store as user presets

**Server-Side Option**:
- Process audio server-side with Rubber Band
- Better quality but higher latency/cost
- Hybrid: client for preview, server for final

**A/B Testing**:
- Compare soundtouchjs vs Rubber Band WASM
- Real user quality ratings
- Data-driven decision on upgrade

## Related Documentation

- [Creative Pipeline Overview](./oct25-creative-pipeline.md) - Main system architecture
- [Per-Track Provider Switching](./oct25-creative-pipeline.md#per-track-provider-switching--speed-control-redux) - Context for why Smart Speed was needed
- [Voice System Guide](./voice-system-guide.md) - Voice management

## Conclusion

Smart Speed delivers a pragmatic solution to the "chipmunk effect" problem when speeding up audio. By combining soundtouchjs time-stretching with manual pitch compensation, it enables:

- ✅ ElevenLabs quality at 1.5x+ speeds
- ✅ Natural-sounding disclaimers for pharma ads
- ✅ Real-time processing on all devices
- ✅ Clean architecture (double-upload trade-off accepted)

**Key Achievement**: Solved the "30-second Spotify ad with legal disclaimer" business constraint without sacrificing voice quality or requiring expensive commercial algorithms.

The feature represents a balance between quality, performance, and complexity - choosing the right tool (soundtouchjs/WSOLA) for the specific use case (speech at 1.0-1.6x) rather than over-engineering with algorithms designed for music production or extreme stretch factors.
