// Add type definition for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

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
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: 44100 * 60, // 60 seconds buffer
    sampleRate: 44100,
  });

  // Load all audio files
  const voiceBuffers = await Promise.all(
    voiceUrls.map((url) => loadAudioBuffer(url, offlineCtx))
  );

  let musicBuffer = null;
  if (musicUrl) {
    musicBuffer = await loadAudioBuffer(musicUrl, offlineCtx);
  }

  const soundFxBuffers = await Promise.all(
    soundFxUrls.map((url) => loadAudioBuffer(url, offlineCtx))
  );

  // Get all tracks and calculate expected durations
  const allTracks: Array<{
    buffer: AudioBuffer;
    type: "voice" | "music" | "soundfx";
    url: string;
    index: number;
  }> = [
    ...voiceBuffers.map((buffer, i) => ({
      buffer,
      type: "voice" as const,
      url: voiceUrls[i],
      index: i,
    })),
    ...(musicBuffer
      ? [
          {
            buffer: musicBuffer,
            type: "music" as const,
            url: musicUrl as string,
            index: 0,
          },
        ]
      : []),
    ...soundFxBuffers.map((buffer, i) => ({
      buffer,
      type: "soundfx" as const,
      url: soundFxUrls[i],
      index: i,
    })),
  ];

  // Calculate the longest duration needed and final track timing
  let maxEndTime = 0;

  // Create a map of actual track timings based on provided timing info or default sequential
  const trackTimings = new Map<
    string,
    { start: number; end: number; gain: number }
  >();

  // If timing info is provided, use it
  if (timingInfo.length > 0) {
    timingInfo.forEach((info) => {
      const track = allTracks.find((t) => t.url === info.url);
      if (track) {
        const duration = Math.min(
          track.buffer.duration,
          info.duration || track.buffer.duration
        );
        const endTime = info.startTime + duration;
        trackTimings.set(info.url, {
          start: info.startTime,
          end: endTime,
          gain: info.gain || getDefaultGainForType(info.type),
        });
        maxEndTime = Math.max(maxEndTime, endTime);
      }
    });
  } else {
    // Default sequential timing if no timing info provided
    // Voice tracks are played sequentially, music starts at 0
    let currentTime = 0;

    // Handle music first (starts at 0)
    const musicTrack = allTracks.find((t) => t.type === "music");
    if (musicTrack) {
      trackTimings.set(musicTrack.url, {
        start: 0,
        end: musicTrack.buffer.duration,
        gain: getDefaultGainForType("music"),
      });
      maxEndTime = Math.max(maxEndTime, musicTrack.buffer.duration);
    }

    // Handle voice tracks sequentially
    const voiceTracks = allTracks.filter((t) => t.type === "voice");
    voiceTracks.forEach((track) => {
      trackTimings.set(track.url, {
        start: currentTime,
        end: currentTime + track.buffer.duration,
        gain: getDefaultGainForType("voice"),
      });
      maxEndTime = Math.max(maxEndTime, currentTime + track.buffer.duration);
      currentTime += track.buffer.duration;
    });

    // Handle sound effects (default to start at beginning)
    const soundFxTracks = allTracks.filter((t) => t.type === "soundfx");
    soundFxTracks.forEach((track) => {
      trackTimings.set(track.url, {
        start: 0,
        end: track.buffer.duration,
        gain: getDefaultGainForType("soundfx"),
      });
      maxEndTime = Math.max(maxEndTime, track.buffer.duration);
    });
  }

  // Create and schedule the audio sources with correct timing
  for (const track of allTracks) {
    const timing = trackTimings.get(track.url);
    if (!timing) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = track.buffer;

    // Apply gain
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = timing.gain;

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    // Start the track at the calculated start time
    source.start(timing.start);
  }

  // Render audio
  const renderedBuffer = await offlineCtx.startRendering();

  // Convert AudioBuffer to WAV
  const wavBlob = await audioBufferToWav(renderedBuffer, maxEndTime);

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
