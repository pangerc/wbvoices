// Add type definition for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

import { calculateLUFS, normalizeToSpotifySpec } from "./audio-processing";

export type TrackTiming = {
  id: string;
  type: "voice" | "music" | "soundfx";
  url: string;
  startTime: number;
  /** Effective duration (post-trim) — when the clip plays. */
  duration: number;
  /**
   * User volume trim in dB around unity. 0 = no change, positive = louder,
   * negative = quieter. Applied AFTER per-stem normalization to a per-type
   * LUFS target. Replaces the old 0..1 multiplier; legacy values in 0..1
   * range now read as small positive trims (acceptable degradation until
   * the user touches the slider).
   */
  gainDb?: number;
  /**
   * Pre-measured integrated loudness of the stem in LUFS (BS.1770). When
   * present, the mix render computes the gain needed to bring the stem
   * to its per-type target before applying user trim. Absent stems are
   * assumed-at-target (no normalization adjustment).
   */
  integratedLufs?: number;
  /**
   * Trim window into the source blob. When present, the clip plays only
   * `[trim.start, trim.end]` of the source at its scheduled timeline
   * position. Matches the resolver's effective-duration semantics.
   */
  trim?: { start: number; end: number };
};

/**
 * Per-type LUFS targets for stem normalization. Stems hotter than their
 * target are attenuated; quieter stems are boosted. These constants codify
 * the "music sits 7 LU under voice" broadcast convention so the user's
 * volume trim slider can mean "trim around a balanced mix" rather than
 * "guess at a multiplier that compensates for raw stem loudness."
 *
 * Currently constants; should move to config if producers want per-ad
 * tuning (per the architecture-strategist's guidance on the volume-
 * semantics decision).
 */
const STEM_TARGET_LUFS = {
  voice: -16,
  music: -23,
  soundfx: -20,
} as const;

/** Hard ceiling on per-stem gain so a corrupt LUFS measurement can't blow speakers. */
const MAX_PER_STEM_GAIN_DB = 12;
const MIN_PER_STEM_GAIN_DB = -36;

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function clampDb(db: number): number {
  return Math.max(MIN_PER_STEM_GAIN_DB, Math.min(MAX_PER_STEM_GAIN_DB, db));
}

/** Minimal client track shape `buildTimingInfo` reads. */
export type TimelineClip = {
  id: string;
  url: string;
  type: TrackTiming["type"];
  actualStartTime: number;
  actualDuration: number;
  integratedLufs?: number;
  trim?: { start: number; end: number };
};

/** Gain sentinel below the floor that `planSchedule` reads as hard mute. */
export const SILENCED_GAIN_DB = -1000;

/**
 * Turn the timeline's calculated tracks into render timings, sorted by start
 * time. Volume is a dB trim around unity (post-stem-normalization); muted
 * tracks — and every non-soloed track while any track is soloed — are
 * silenced.
 */
export function buildTimingInfo(
  calculatedTracks: TimelineClip[],
  volumes: Record<string, number>,
  muted: ReadonlySet<string>,
  soloed: ReadonlySet<string>,
): TrackTiming[] {
  const anySoloed = soloed.size > 0;
  return calculatedTracks
    .map((track) => {
      const silenced =
        muted.has(track.id) || (anySoloed && !soloed.has(track.id));
      return {
        id: track.id,
        url: track.url,
        type: track.type,
        startTime: track.actualStartTime,
        duration: track.actualDuration,
        gainDb: silenced ? SILENCED_GAIN_DB : (volumes[track.id] ?? 0),
        integratedLufs: track.integratedLufs,
        trim: track.trim,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

/** When and how one source plays in the offline render. */
export type ClipSchedule = {
  start: number;
  end: number;
  /** Linear gain handed to the GainNode. */
  gain: number;
  type: string;
  /** `source.start(when, offset, duration)` offset into the blob. */
  sourceOffset: number;
  playDuration: number;
};

/**
 * Compute the render schedule from timing info and the decoded buffer
 * durations. Pure: buffer loading and LUFS measurement are the caller's.
 *
 * `sourceOffset` + `playDuration` feed into `source.start(when, offset,
 * duration)` so the underlying blob plays only the trim window. Without them
 * the full blob plays even when the resolver's effective duration is shorter
 * — the bug that made trims visible but not audible.
 *
 * With no timing info, falls back to sequential: music and SFX at 0, voices
 * back-to-back after the longest SFX.
 */
export function planSchedule(input: {
  voiceUrls: string[];
  musicUrl: string | null;
  soundFxUrls: string[];
  timingInfo: TrackTiming[];
  bufferDurations: ReadonlyMap<string, number>;
  /** Fallback loudness for stems without a pre-measured `integratedLufs`. */
  measureLufs: (url: string) => number | undefined;
}): { timings: Map<string, ClipSchedule>; maxEndTime: number } {
  const { bufferDurations, timingInfo } = input;
  const timings = new Map<string, ClipSchedule>();
  let maxEndTime = 0;

  if (timingInfo.length > 0) {
    const sorted = [...timingInfo].sort((a, b) => a.startTime - b.startTime);
    for (const info of sorted) {
      const bufferDuration = bufferDurations.get(info.url);
      if (bufferDuration === undefined) {
        console.warn(`Audio buffer not found for URL: ${info.url}`);
        continue;
      }
      // Trim window: clamp into the buffer's actual bounds so a stale trim
      // that extends past a re-generated (shorter) blob doesn't throw.
      const sourceOffset = info.trim
        ? Math.max(0, Math.min(bufferDuration, info.trim.start))
        : 0;
      const trimmedLen = info.trim
        ? Math.max(0, info.trim.end - info.trim.start)
        : bufferDuration;
      const playDuration = Math.min(
        bufferDuration - sourceOffset,
        trimmedLen,
        info.duration || bufferDuration,
      );
      const endTime = info.startTime + playDuration;

      // Per-stem linear gain via dB-domain math:
      //   normalizationDb = targetLufs - integratedLufs    (assume-at-target if unmeasured)
      //   userTrimDb      = info.gainDb ?? 0               (default 0 = unity)
      //   total           = clamp(normalizationDb + userTrimDb)
      const targetLufs =
        STEM_TARGET_LUFS[info.type as keyof typeof STEM_TARGET_LUFS] ?? -16;
      const integratedLufs =
        typeof info.integratedLufs === "number"
          ? info.integratedLufs
          : input.measureLufs(info.url);
      const normalizationDb =
        typeof integratedLufs === "number" ? targetLufs - integratedLufs : 0;
      const userTrimDb = typeof info.gainDb === "number" ? info.gainDb : 0;
      const totalDb = clampDb(normalizationDb + userTrimDb);
      // A trim at or below the floor is a hard mute.
      const gain = userTrimDb <= MIN_PER_STEM_GAIN_DB ? 0 : dbToLinear(totalDb);

      timings.set(info.url, {
        start: info.startTime,
        end: endTime,
        gain,
        type: info.type,
        sourceOffset,
        playDuration,
      });
      maxEndTime = Math.max(maxEndTime, endTime);
    }
    return { timings, maxEndTime };
  }

  const atZero = (duration: number, type: string): ClipSchedule => ({
    start: 0,
    end: duration,
    gain: 1.0,
    type,
    sourceOffset: 0,
    playDuration: duration,
  });

  let currentTime = 0;
  const musicDuration = input.musicUrl
    ? bufferDurations.get(input.musicUrl)
    : undefined;
  if (input.musicUrl && musicDuration !== undefined) {
    timings.set(input.musicUrl, atZero(musicDuration, "music"));
    maxEndTime = Math.max(maxEndTime, musicDuration);
  }
  for (const url of input.soundFxUrls) {
    const duration = bufferDurations.get(url);
    if (duration === undefined) continue;
    timings.set(url, atZero(duration, "soundfx"));
    // Sound effects at start shift voice tracks forward
    currentTime = Math.max(currentTime, duration);
    maxEndTime = Math.max(maxEndTime, duration);
  }
  for (const url of input.voiceUrls) {
    const duration = bufferDurations.get(url);
    if (duration === undefined) continue;
    timings.set(url, {
      ...atZero(duration, "voice"),
      start: currentTime,
      end: currentTime + duration,
    });
    maxEndTime = Math.max(maxEndTime, currentTime + duration);
    currentTime += duration;
  }
  return { timings, maxEndTime };
}

export async function createMix(
  voiceUrls: string[],
  musicUrl: string | null,
  soundFxUrls: string[] = [],
  timingInfo: TrackTiming[] = [],
): Promise<{ blob: Blob }> {
  console.log("Creating mix with timingInfo:", timingInfo);

  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: 44100 * 60, // 60 seconds buffer
    sampleRate: 44100,
  });

  // Load all audio files
  const audioBuffersMap = new Map<string, AudioBuffer>();

  // Create promises for all audio loads
  const loadPromises = [];

  // Load voice buffers
  for (const url of voiceUrls) {
    loadPromises.push(
      loadAudioBuffer(url, offlineCtx).then((buffer) => {
        audioBuffersMap.set(url, buffer);
        console.log(`Loaded voice audio: ${url}`);
      }),
    );
  }

  // Load music buffer
  if (musicUrl) {
    loadPromises.push(
      loadAudioBuffer(musicUrl, offlineCtx).then((buffer) => {
        audioBuffersMap.set(musicUrl, buffer);
        console.log(`Loaded music audio: ${musicUrl}`);
      }),
    );
  }

  // Load sound effect buffers
  for (const url of soundFxUrls) {
    loadPromises.push(
      loadAudioBuffer(url, offlineCtx).then((buffer) => {
        audioBuffersMap.set(url, buffer);
        console.log(`Loaded sound effect audio: ${url}`);
      }),
    );
  }

  // Wait for all audio to load
  await Promise.all(loadPromises);
  console.log("All audio loaded successfully");

  const bufferDurations = new Map(
    [...audioBuffersMap].map(([url, buffer]) => [url, buffer.duration]),
  );
  const { timings: trackTimings, maxEndTime } = planSchedule({
    voiceUrls,
    musicUrl,
    soundFxUrls,
    timingInfo,
    bufferDurations,
    measureLufs: (url) => measureLufsLazy(audioBuffersMap.get(url)!, url),
  });

  // Log the final timings for debug
  console.log(
    "Final track timings:",
    Array.from(trackTimings.entries()).map(([url, timing]) => ({
      url,
      start: timing.start,
      end: timing.end,
      gain: timing.gain,
      type: timing.type,
    })),
  );

  // Minimum per-edge fade to avoid DC-offset clicks on hard cuts.
  // 8ms is inaudible as an envelope but sufficient to suppress sample-boundary pops.
  const MICRO_FADE = 0.008;

  // Create and schedule the audio sources with correct timing
  for (const [url, timing] of trackTimings.entries()) {
    if (!audioBuffersMap.has(url)) continue;

    const audioBuffer = audioBuffersMap.get(url)!;
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Apply gain
    const gainNode = offlineCtx.createGain();

    // Music: long exponential fade-out at the tail in addition to the micro-fades.
    if (timing.type === "music") {
      const FADEOUT_DURATION = 2.0;
      const fadeOutStartTime = Math.max(
        timing.start + MICRO_FADE,
        timing.end - FADEOUT_DURATION,
      );

      gainNode.gain.setValueAtTime(0.0001, timing.start);
      gainNode.gain.exponentialRampToValueAtTime(
        Math.max(timing.gain, 0.0001),
        timing.start + MICRO_FADE,
      );
      gainNode.gain.setValueAtTime(timing.gain, fadeOutStartTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, timing.end);

      console.log(
        `Applied fade-out to music track from ${fadeOutStartTime}s to ${timing.end}s`,
      );
    } else {
      // Voice + SFX: symmetric micro-fades at both edges to prevent clicks.
      // Using setTargetAtTime / linearRampToValueAtTime keeps the envelope cheap.
      const fadeOutStart = Math.max(
        timing.start + MICRO_FADE,
        timing.end - MICRO_FADE,
      );
      gainNode.gain.setValueAtTime(0, timing.start);
      gainNode.gain.linearRampToValueAtTime(
        timing.gain,
        timing.start + MICRO_FADE,
      );
      gainNode.gain.setValueAtTime(timing.gain, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, timing.end);
    }

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    // start(when, offset, duration) honours the clip's trim window — the
    // source plays only the [trim.start, trim.end] slice of the blob at its
    // scheduled timeline position. `duration` is the second argument that
    // was missing before; without it, the full buffer played past timing.end
    // (inaudible thanks to the gain-to-zero ramp, but still affected
    // maxEndTime bookkeeping and the rendered wav length).
    source.start(timing.start, timing.sourceOffset, timing.playDuration);
    console.log(
      `Started ${timing.type} at ${timing.start}s offset=${timing.sourceOffset}s dur=${timing.playDuration}s gain=${timing.gain}`,
    );
  }

  // Render audio
  console.log(`Rendering final mix with duration up to ${maxEndTime}s`);
  const renderedBuffer = await offlineCtx.startRendering();

  // Apply loudness normalization to meet Spotify specifications
  console.log(
    "Applying loudness normalization to -16 LUFS with -2.0 dBTP peak limit...",
  );
  const normalizedBuffer = normalizeToSpotifySpec(renderedBuffer);

  // Convert normalized AudioBuffer to WAV
  const wavBlob = await audioBufferToWav(normalizedBuffer, maxEndTime);

  return { blob: wavBlob };
}

/**
 * Per-render LUFS measurement cache. Stems decoded for the current mix
 * are measured on-demand when no `integratedLufs` was supplied via
 * TrackTiming, then cached by URL so successive timing entries that
 * happen to share the same buffer (rare but possible across takes)
 * don't pay the cost twice. Cleared between mix renders implicitly via
 * module-level lifetime. Trade-off vs the strategist's preference for
 * server-side measurement at stem generation: lazy here means N×~50ms
 * per render for unmeasured stems, fine for single-render preview;
 * stage 9 A/B compare will need the cached-on-stream-version path
 * (lazy backfill via PATCH) to avoid recompute on every preview.
 */
const lazyLufsCache = new Map<string, number>();

function measureLufsLazy(buffer: AudioBuffer, url: string): number | undefined {
  const cached = lazyLufsCache.get(url);
  if (typeof cached === "number") return cached;
  try {
    const lufs = calculateLUFS(buffer);
    if (Number.isFinite(lufs)) {
      lazyLufsCache.set(url, lufs);
      return lufs;
    }
  } catch (err) {
    console.warn(`[mixer] LUFS measurement failed for ${url}:`, err);
  }
  return undefined;
}

/**
 * Fetch + decode one track's audio, retrying transient failures.
 *
 * The mixer fans these out concurrently under `Promise.all`, so a single failed
 * track rejects the whole preview/export. On the AWS deploy `/api/media`
 * 307-redirects to a presigned S3 URL, and that cross-origin GET intermittently
 * comes back without the `Access-Control-Allow-Origin` header (the browser
 * reports `MissingAllowOriginHeader` and `fetch` throws) — e.g. while an S3 CORS
 * change is still propagating across the fleet. A retry with `cache: "no-store"`
 * forces a fresh request, so the route mints a new presigned URL instead of
 * replaying a cached redirect to the same object, which typically lands on a
 * node that answers with the CORS header.
 */
async function loadAudioBuffer(
  url: string,
  audioContext: OfflineAudioContext,
): Promise<AudioBuffer> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // First attempt uses the default cache; retries force a fresh fetch (and
      // thus a fresh presigned redirect) rather than replaying the failed one.
      const response = await fetch(
        url,
        attempt === 1 ? undefined : { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading ${url}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[mixer] track load failed (attempt ${attempt}/${MAX_ATTEMPTS}) for ${url}; retrying`,
          err,
        );
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }
  throw lastError;
}

function audioBufferToWav(
  audioBuffer: AudioBuffer,
  duration: number,
): Promise<Blob> {
  return new Promise((resolve) => {
    // Calculate the actual length to use (in samples)
    const lengthInSamples = Math.min(
      audioBuffer.length,
      Math.ceil(duration * audioBuffer.sampleRate),
    );

    // Create a new AudioContext for Web Audio API
    const offlineCtx = new OfflineAudioContext({
      numberOfChannels: audioBuffer.numberOfChannels,
      length: lengthInSamples,
      sampleRate: audioBuffer.sampleRate,
    });

    // Create a buffer source
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    // Render the truncated audio
    offlineCtx.startRendering().then((renderedBuffer) => {
      // WAV file header creation
      const numOfChan = renderedBuffer.numberOfChannels;
      const sampleRate = renderedBuffer.sampleRate;
      const bitsPerSample = 16;
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numOfChan * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = lengthInSamples * numOfChan * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // WAV header
      writeString(view, 0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, "WAVE");
      writeString(view, 12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numOfChan, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(view, 36, "data");
      view.setUint32(40, dataSize, true);

      // Write audio data
      const channelData = [];
      for (let i = 0; i < numOfChan; i++) {
        channelData.push(renderedBuffer.getChannelData(i));
      }

      let offset = 44;
      for (let i = 0; i < lengthInSamples; i++) {
        for (let channel = 0; channel < numOfChan; channel++) {
          const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
          const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          view.setInt16(offset, int16Sample, true);
          offset += 2;
        }
      }

      const blob = new Blob([buffer], { type: "audio/wav" });
      resolve(blob);
    });
  });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
