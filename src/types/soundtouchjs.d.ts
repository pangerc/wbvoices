declare module 'soundtouchjs' {
  /**
   * Main SoundTouch processing engine
   * Controls tempo, pitch, and rate transformations
   */
  export class SoundTouch {
    tempo: number;  // Speed control (1.0 = normal, >1.0 = faster, <1.0 = slower)
    pitch: number;  // Pitch control (1.0 = normal, >1.0 = higher, <1.0 = lower)
    rate: number;   // Combined tempo+pitch (1.0 = normal)
    constructor();
  }

  /**
   * Wrapper for Web Audio API AudioBuffer
   * Provides source audio data to SimpleFilter
   */
  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames: number, position?: number): number;
    readonly position: number;
    readonly dualChannel: boolean;
  }

  /**
   * Audio processing filter that applies SoundTouch transformations
   * Uses frame-based extraction (1 frame = 1 sample per channel)
   */
  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
    extract(target: Float32Array, numFrames: number): number;
    clear(): void;
    position: number;
    sourcePosition: number;
  }

  /**
   * High-level pitch shifter for Web Audio API
   * Integrates SoundTouch with audio graph nodes
   */
  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    connect(node: AudioNode): void;
    disconnect(): void;
    on(event: string, callback: (detail: unknown) => void): void;
    off(event?: string, callback?: (detail: unknown) => void): void;
  }
}
