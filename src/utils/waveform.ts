/**
 * Client-side waveform peak generation for timeline clips.
 *
 * Decodes an audio blob via OfflineAudioContext (no playback, no user-
 * gesture requirement) and reduces the PCM samples to N normalized
 * amplitude buckets — one per pixel-ish column of the ribbon. Peaks are
 * cached by URL in a module-level Map so re-mounts of TimelineTrack
 * (drag, trim preview, hydrate cycles) don't re-decode.
 *
 * Intentionally narrow — we want waveform data, not a full wavesurfer
 * library. Rendering is SVG inside the ribbon; see `useWaveform` for the
 * React-facing hook.
 */

const peaksCache = new Map<string, Promise<number[]>>();

let sharedCtx: OfflineAudioContext | null = null;
function getDecoderCtx(): OfflineAudioContext {
  // Context is only used for its decodeAudioData method — length/rate
  // don't matter. Reusing one keeps decode cheap on mobile Safari where
  // creating contexts has noticeable overhead.
  if (!sharedCtx) {
    sharedCtx = new OfflineAudioContext({
      numberOfChannels: 1,
      length: 1,
      sampleRate: 44100,
    });
  }
  return sharedCtx;
}

/**
 * Load an audio URL and return a normalized peaks array of length `buckets`.
 * Each value is in [0, 1], representing max-abs amplitude within that
 * bucket. Returns an empty array if decoding fails (caller should render
 * a graceful fallback rather than crash).
 */
export function loadWaveformPeaks(
  url: string,
  buckets: number,
): Promise<number[]> {
  const cacheKey = `${url}@${buckets}`;
  const existing = peaksCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = getDecoderCtx();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      return computePeaks(audioBuffer, buckets);
    } catch (err) {
      console.warn(`[waveform] failed to load peaks for ${url}:`, err);
      return [];
    }
  })();

  peaksCache.set(cacheKey, promise);
  return promise;
}

/**
 * Reduce a decoded AudioBuffer to `buckets` normalized peak values. Uses
 * max absolute amplitude per bucket (simpler than RMS, renders sharper
 * transients which is what the user actually wants to see for trim cues).
 * Averages channels before reducing so stereo and mono look consistent.
 */
function computePeaks(audioBuffer: AudioBuffer, buckets: number): number[] {
  const channelCount = audioBuffer.numberOfChannels;
  const frameCount = audioBuffer.length;
  if (frameCount === 0 || buckets <= 0) return [];

  // Pre-mix all channels into a single Float32Array to avoid repeated
  // getChannelData calls inside the hot loop.
  const mixed = new Float32Array(frameCount);
  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      mixed[i] += data[i];
    }
  }
  if (channelCount > 1) {
    for (let i = 0; i < frameCount; i++) mixed[i] /= channelCount;
  }

  const bucketSize = frameCount / buckets;
  const peaks = new Array<number>(buckets);
  let globalMax = 0;
  for (let b = 0; b < buckets; b++) {
    const startFrame = Math.floor(b * bucketSize);
    const endFrame = Math.min(frameCount, Math.floor((b + 1) * bucketSize));
    let peak = 0;
    for (let i = startFrame; i < endFrame; i++) {
      const v = mixed[i] < 0 ? -mixed[i] : mixed[i];
      if (v > peak) peak = v;
    }
    peaks[b] = peak;
    if (peak > globalMax) globalMax = peak;
  }

  // Normalize so the loudest peak is 1.0. Keeps quiet clips visible.
  if (globalMax > 0) {
    for (let b = 0; b < buckets; b++) peaks[b] = peaks[b] / globalMax;
  }
  return peaks;
}
