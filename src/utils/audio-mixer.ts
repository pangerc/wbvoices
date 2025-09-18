// Add type definition for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

import { normalizeToSpotifySpec } from './audio-processing';

export type TrackTiming = {
  id: string;
  type: "voice" | "music" | "soundfx";
  url: string;
  startTime: number;
  duration: number;
  gain?: number;
};

export async function createMix(
  voiceUrls: string[],
  musicUrl: string | null,
  soundFxUrls: string[] = [],
  timingInfo: TrackTiming[] = []
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
      })
    );
  }

  // Load music buffer
  if (musicUrl) {
    loadPromises.push(
      loadAudioBuffer(musicUrl, offlineCtx).then((buffer) => {
        audioBuffersMap.set(musicUrl, buffer);
        console.log(`Loaded music audio: ${musicUrl}`);
      })
    );
  }

  // Load sound effect buffers
  for (const url of soundFxUrls) {
    loadPromises.push(
      loadAudioBuffer(url, offlineCtx).then((buffer) => {
        audioBuffersMap.set(url, buffer);
        console.log(`Loaded sound effect audio: ${url}`);
      })
    );
  }

  // Wait for all audio to load
  await Promise.all(loadPromises);
  console.log("All audio loaded successfully");

  // Calculate the longest duration needed and final track timing
  let maxEndTime = 0;

  // Create a map of actual track timings based on provided timing info or default sequential
  const trackTimings = new Map<
    string,
    { start: number; end: number; gain: number; type: string }
  >();

  // If timing info is provided, use it
  if (timingInfo.length > 0) {
    // Sort timing info by start time to ensure correct playback order
    const sortedTimingInfo = [...timingInfo].sort(
      (a, b) => a.startTime - b.startTime
    );

    sortedTimingInfo.forEach((info) => {
      if (!audioBuffersMap.has(info.url)) {
        console.warn(`Audio buffer not found for URL: ${info.url}`);
        return;
      }

      const audioBuffer = audioBuffersMap.get(info.url)!;
      const duration = Math.min(
        audioBuffer.duration,
        info.duration || audioBuffer.duration
      );
      const endTime = info.startTime + duration;

      trackTimings.set(info.url, {
        start: info.startTime,
        end: endTime,
        gain: info.gain || getDefaultGainForType(info.type),
        type: info.type,
      });

      maxEndTime = Math.max(maxEndTime, endTime);
      console.log(
        `Scheduled ${info.type} at ${info.startTime}s, duration: ${duration}s, end: ${endTime}s`
      );
    });
  } else {
    // Default sequential timing if no timing info provided
    // Voice tracks are played sequentially, music starts at 0
    let currentTime = 0;

    // Handle music first (starts at 0)
    if (musicUrl && audioBuffersMap.has(musicUrl)) {
      const audioBuffer = audioBuffersMap.get(musicUrl)!;
      trackTimings.set(musicUrl, {
        start: 0,
        end: audioBuffer.duration,
        gain: getDefaultGainForType("music"),
        type: "music",
      });
      maxEndTime = Math.max(maxEndTime, audioBuffer.duration);
    }

    // Handle sound effects at start first
    for (const url of soundFxUrls) {
      if (!audioBuffersMap.has(url)) continue;
      const audioBuffer = audioBuffersMap.get(url)!;

      trackTimings.set(url, {
        start: 0,
        end: audioBuffer.duration,
        gain: getDefaultGainForType("soundfx"),
        type: "soundfx",
      });

      // Sound effects at start shift voice tracks forward
      currentTime = Math.max(currentTime, audioBuffer.duration);
      maxEndTime = Math.max(maxEndTime, audioBuffer.duration);
    }

    // Handle voice tracks sequentially after sound effects
    for (const url of voiceUrls) {
      if (!audioBuffersMap.has(url)) continue;
      const audioBuffer = audioBuffersMap.get(url)!;

      trackTimings.set(url, {
        start: currentTime,
        end: currentTime + audioBuffer.duration,
        gain: getDefaultGainForType("voice"),
        type: "voice",
      });

      maxEndTime = Math.max(maxEndTime, currentTime + audioBuffer.duration);
      currentTime += audioBuffer.duration;
    }
  }

  // Log the final timings for debug
  console.log(
    "Final track timings:",
    Array.from(trackTimings.entries()).map(([url, timing]) => ({
      url,
      start: timing.start,
      end: timing.end,
      gain: timing.gain,
      type: timing.type,
    }))
  );

  // Create and schedule the audio sources with correct timing
  for (const [url, timing] of trackTimings.entries()) {
    if (!audioBuffersMap.has(url)) continue;

    const audioBuffer = audioBuffersMap.get(url)!;
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Apply gain
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = timing.gain;

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    // Start the track at the calculated start time
    source.start(timing.start);
    console.log(
      `Started ${timing.type} at ${timing.start}s with gain ${timing.gain}`
    );
  }

  // Render audio
  console.log(`Rendering final mix with duration up to ${maxEndTime}s`);
  const renderedBuffer = await offlineCtx.startRendering();

  // Apply loudness normalization to meet Spotify specifications
  console.log('Applying loudness normalization to -16 LUFS with -2.0 dBTP peak limit...');
  const normalizedBuffer = normalizeToSpotifySpec(renderedBuffer);

  // Convert normalized AudioBuffer to WAV
  const wavBlob = await audioBufferToWav(normalizedBuffer, maxEndTime);

  return { blob: wavBlob };
}

function getDefaultGainForType(type: "voice" | "music" | "soundfx"): number {
  switch (type) {
    case "voice":
      return 1.0; // Full volume
    case "music":
      return 0.25; // Reduced volume further (from 0.4 to 0.25)
    case "soundfx":
      return 0.7; // Medium volume
    default:
      return 1.0;
  }
}

async function loadAudioBuffer(
  url: string,
  audioContext: OfflineAudioContext
): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer;
}

function audioBufferToWav(
  audioBuffer: AudioBuffer,
  duration: number
): Promise<Blob> {
  return new Promise((resolve) => {
    // Calculate the actual length to use (in samples)
    const lengthInSamples = Math.min(
      audioBuffer.length,
      Math.ceil(duration * audioBuffer.sampleRate)
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
