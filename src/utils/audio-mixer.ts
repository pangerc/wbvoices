// Add type definition for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export async function createMix(
  voiceUrls: string[],
  musicUrl: string | null
): Promise<{ blob: Blob; duration: number }> {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const FADEOUT_DURATION = 5; // 5 seconds fadeout

  // Load all voice tracks
  const voiceBuffers = await Promise.all(
    voiceUrls.map(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    })
  );

  // Calculate total duration of voice tracks
  const voiceDuration = voiceBuffers.reduce(
    (sum, buffer) => sum + buffer.duration,
    0
  );

  // Total duration including fadeout
  const totalDuration = voiceDuration + FADEOUT_DURATION;

  // Load music track if provided
  let musicBuffer = null;
  if (musicUrl) {
    const response = await fetch(musicUrl);
    const arrayBuffer = await response.arrayBuffer();
    musicBuffer = await audioContext.decodeAudioData(arrayBuffer);
  }

  // Create an offline context for rendering
  const offlineContext = new OfflineAudioContext(
    2, // stereo
    audioContext.sampleRate * totalDuration,
    audioContext.sampleRate
  );

  // Add music track if available (plays throughout with fadeout)
  if (musicBuffer) {
    const musicSource = offlineContext.createBufferSource();
    const musicGain = offlineContext.createGain();
    musicSource.buffer = musicBuffer;
    musicGain.gain.value = 0.3; // Lower volume for background music

    // Create fadeout
    musicGain.gain.setValueAtTime(0.3, voiceDuration);
    musicGain.gain.linearRampToValueAtTime(0, totalDuration);

    musicSource.connect(musicGain);
    musicGain.connect(offlineContext.destination);
    musicSource.start(0);

    // Loop music if needed, but only until voice tracks end
    if (musicBuffer.duration < voiceDuration) {
      const loops = Math.ceil(voiceDuration / musicBuffer.duration);
      for (let i = 1; i < loops; i++) {
        const loopSource = offlineContext.createBufferSource();
        loopSource.buffer = musicBuffer;
        loopSource.connect(musicGain);
        loopSource.start(i * musicBuffer.duration);
      }
    }
  }

  // Add voice tracks sequentially
  let currentTime = 0;
  voiceBuffers.forEach((buffer) => {
    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(currentTime);
    currentTime += buffer.duration;
  });

  // Render the mix
  const renderedBuffer = await offlineContext.startRendering();

  // Convert to WAV
  const wav = audioBufferToWav(renderedBuffer);
  return {
    blob: new Blob([wav], { type: "audio/wav" }),
    duration: totalDuration,
  };
}

// Helper function to convert AudioBuffer to WAV format
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const dataView = new DataView(arrayBuffer);

  // RIFF chunk descriptor
  writeString(dataView, 0, "RIFF");
  dataView.setUint32(4, totalSize - 8, true);
  writeString(dataView, 8, "WAVE");

  // fmt sub-chunk
  writeString(dataView, 12, "fmt ");
  dataView.setUint32(16, 16, true); // fmt chunk size
  dataView.setUint16(20, format, true);
  dataView.setUint16(22, numChannels, true);
  dataView.setUint32(24, sampleRate, true);
  dataView.setUint32(28, byteRate, true);
  dataView.setUint16(32, blockAlign, true);
  dataView.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(dataView, 36, "data");
  dataView.setUint32(40, dataSize, true);

  // Write audio data
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      dataView.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(dataView: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    dataView.setUint8(offset + i, string.charCodeAt(i));
  }
}
