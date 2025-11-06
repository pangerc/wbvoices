/**
 * Audio processing utilities for loudness normalization and limiting
 * Implements ITU-R BS.1770-4 standard for LUFS measurement
 */

// Constants for LUFS calculation based on ITU-R BS.1770-4
const PRE_FILTER_COEFFS = {
  // High shelf filter coefficients (f0 = 1681 Hz, Q = 0.7071, gain = 4 dB)
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [1.0, -1.69065929318241, 0.73248077421585]
};

const RLB_FILTER_COEFFS = {
  // High pass filter coefficients (f0 = 38 Hz, Q = 0.5)
  b: [1.0, -2.0, 1.0],
  a: [1.0, -1.99004745483398, 0.99007225036621]
};

// Channel weights for stereo (L/R)
const CHANNEL_WEIGHTS = [1.0, 1.0]; // Equal weight for stereo channels

/**
 * Apply biquad filter to audio data
 */
function applyBiquadFilter(
  input: Float32Array,
  coeffs: { b: number[]; a: number[] }
): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (coeffs.b[0] * x0 + coeffs.b[1] * x1 + coeffs.b[2] * x2 -
                coeffs.a[1] * y1 - coeffs.a[2] * y2) / coeffs.a[0];

    output[i] = y0;

    // Shift delay line
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }

  return output;
}

/**
 * Calculate integrated loudness (LUFS) for stereo audio buffer
 */
export function calculateLUFS(audioBuffer: AudioBuffer): number {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2); // Only process stereo

  // Get channel data
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  // Apply K-weighting filters to each channel
  const filteredChannels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    // Apply pre-filter (high shelf)
    let filtered = applyBiquadFilter(channelData[ch], PRE_FILTER_COEFFS);
    // Apply RLB filter (high pass)
    filtered = applyBiquadFilter(filtered, RLB_FILTER_COEFFS);
    filteredChannels.push(filtered);
  }

  // Calculate gating blocks (400ms blocks with 75% overlap)
  const blockSize = Math.round(0.4 * sampleRate); // 400ms
  const hopSize = Math.round(0.1 * sampleRate); // 100ms (75% overlap)
  const numBlocks = Math.floor((audioBuffer.length - blockSize) / hopSize) + 1;

  const blockLoudness: number[] = [];

  // Calculate loudness for each block
  for (let block = 0; block < numBlocks; block++) {
    const startSample = block * hopSize;
    const endSample = Math.min(startSample + blockSize, audioBuffer.length);

    let meanSquareSum = 0;
    const blockLength = endSample - startSample;

    // Calculate weighted mean square for this block
    for (let ch = 0; ch < numChannels; ch++) {
      let channelMeanSquare = 0;
      for (let i = startSample; i < endSample; i++) {
        const sample = filteredChannels[ch][i];
        channelMeanSquare += sample * sample;
      }
      channelMeanSquare /= blockLength;
      meanSquareSum += CHANNEL_WEIGHTS[ch] * channelMeanSquare;
    }

    // Convert to LUFS (relative to full scale)
    const blockLUFS = -0.691 + 10 * Math.log10(meanSquareSum + 1e-10);
    blockLoudness.push(blockLUFS);
  }

  // Gating: remove blocks below -70 LUFS (absolute gate)
  const gatedBlocks = blockLoudness.filter(lufs => lufs >= -70);

  if (gatedBlocks.length === 0) {
    return -70; // Very quiet audio
  }

  // Calculate relative gate (-10 LUFS below ungated mean)
  const ungatedMean = gatedBlocks.reduce((sum, lufs) => sum + Math.pow(10, lufs / 10), 0) / gatedBlocks.length;
  const relativeGate = -0.691 + 10 * Math.log10(ungatedMean) - 10;

  // Apply relative gate
  const finalGatedBlocks = gatedBlocks.filter(lufs => lufs >= relativeGate);

  if (finalGatedBlocks.length === 0) {
    return -70; // Very quiet audio
  }

  // Calculate final integrated loudness
  const finalMean = finalGatedBlocks.reduce((sum, lufs) => sum + Math.pow(10, lufs / 10), 0) / finalGatedBlocks.length;
  const integratedLUFS = -0.691 + 10 * Math.log10(finalMean);

  return integratedLUFS;
}

/**
 * Calculate true peak level for audio buffer
 */
export function calculateTruePeak(audioBuffer: AudioBuffer): number {
  let maxTruePeak = 0;

  // Process each channel
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);

    // Oversample by 4x for true peak detection
    const oversampledLength = channelData.length * 4;
    const oversampled = new Float32Array(oversampledLength);

    // Simple linear interpolation for oversampling
    for (let i = 0; i < channelData.length - 1; i++) {
      const curr = channelData[i];
      const next = channelData[i + 1];
      const step = (next - curr) / 4;

      for (let j = 0; j < 4; j++) {
        oversampled[i * 4 + j] = curr + step * j;
      }
    }

    // Find maximum absolute value in oversampled signal
    for (let i = 0; i < oversampled.length; i++) {
      const absValue = Math.abs(oversampled[i]);
      if (absValue > maxTruePeak) {
        maxTruePeak = absValue;
      }
    }
  }

  // Convert to dBTP (True Peak in dB relative to full scale)
  return 20 * Math.log10(maxTruePeak + 1e-10);
}

/**
 * Apply gain to audio buffer to reach target LUFS
 */
export function applyLoudnessNormalization(
  audioBuffer: AudioBuffer,
  targetLUFS: number = -16,
  maxTruePeakdBTP: number = -2.0
): AudioBuffer {
  // Calculate current loudness
  const currentLUFS = calculateLUFS(audioBuffer);
  console.log(`Current LUFS: ${currentLUFS.toFixed(2)}, Target: ${targetLUFS}`);

  // Calculate required gain
  const gainLUFS = targetLUFS - currentLUFS;
  const gainLinear = Math.pow(10, gainLUFS / 20);
  console.log(`Applying gain: ${gainLUFS.toFixed(2)} LUFS (${gainLinear.toFixed(3)}x)`);

  // Create new audio buffer with normalized levels
  const normalizedBuffer = new AudioBuffer({
    numberOfChannels: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    sampleRate: audioBuffer.sampleRate
  });

  // Apply gain to each channel
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const input = audioBuffer.getChannelData(ch);
    const output = normalizedBuffer.getChannelData(ch);

    for (let i = 0; i < input.length; i++) {
      output[i] = input[i] * gainLinear;
    }
  }

  // Check true peak and apply limiting if necessary
  const truePeak = calculateTruePeak(normalizedBuffer);
  console.log(`True peak after gain: ${truePeak.toFixed(2)} dBTP`);

  if (truePeak > maxTruePeakdBTP) {
    const limitingGain = Math.pow(10, (maxTruePeakdBTP - truePeak) / 20);
    console.log(`Applying limiting gain: ${(maxTruePeakdBTP - truePeak).toFixed(2)} dB`);

    // Apply limiting gain
    for (let ch = 0; ch < normalizedBuffer.numberOfChannels; ch++) {
      const channelData = normalizedBuffer.getChannelData(ch);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] *= limitingGain;
      }
    }

    // Verify final levels
    const finalLUFS = calculateLUFS(normalizedBuffer);
    const finalTruePeak = calculateTruePeak(normalizedBuffer);
    console.log(`Final LUFS: ${finalLUFS.toFixed(2)}, Final True Peak: ${finalTruePeak.toFixed(2)} dBTP`);
  }

  return normalizedBuffer;
}

/**
 * Normalize audio buffer to Spotify specifications
 */
export function normalizeToSpotifySpec(audioBuffer: AudioBuffer): AudioBuffer {
  return applyLoudnessNormalization(audioBuffer, -16, -2.0);
}

/**
 * Apply time-stretching with pitch adjustment to audio data using SoundTouch WSOLA algorithm
 * @param audioArrayBuffer Raw audio data (MP3/WAV) from provider
 * @param speedup Speedup multiplier (1.0-1.6x, where 1.0 = no change, 1.6x = 1.6x faster)
 * @param pitch Pitch adjustment multiplier (0.7-1.2x, where 1.0 = no change, <1.0 = lower pitch, >1.0 = higher pitch)
 * @returns ArrayBuffer containing WAV audio data
 */
export async function applyTimeStretch(
  audioArrayBuffer: ArrayBuffer,
  speedup: number,
  pitch: number = 1.0
): Promise<ArrayBuffer> {
  console.log(`⚡ Applying time-stretch: ${speedup}x speedup with ${pitch}x pitch adjustment`);

  // Clamp speedup to valid range (1.0-1.6x)
  const clampedSpeedup = Math.max(1.0, Math.min(1.6, speedup));
  if (clampedSpeedup !== speedup) {
    console.warn(`⚠️ Speedup ${speedup}x clamped to ${clampedSpeedup}x (valid range: 1.0-1.6)`);
  }

  // If no processing needed (both tempo and pitch are default), return original data
  if (clampedSpeedup === 1.0 && pitch === 1.0) {
    console.log('No tempo or pitch adjustment needed, returning original audio');
    return audioArrayBuffer;
  }

  // Create temporary audio context for decoding
  const tempContext = new (window.AudioContext || window.webkitAudioContext)();

  try {
    // Decode the audio data
    console.log('Decoding audio data...');
    const audioBuffer = await tempContext.decodeAudioData(audioArrayBuffer.slice(0));
    const originalDuration = audioBuffer.duration;
    console.log(`Original duration: ${originalDuration.toFixed(2)}s`);

    // Use SoundTouch PitchShifter for robust time-stretch with pitch adjustment
    const { PitchShifter } = await import('soundtouchjs');

    console.log('Applying SoundTouch WSOLA algorithm...');
    console.log('SoundTouch configuration:', {
      tempo: clampedSpeedup,
      pitch: pitch,
      speedup: clampedSpeedup,
      pitchAdjustment: pitch
    });

    // Calculate expected output duration and length
    const expectedDuration = audioBuffer.duration / clampedSpeedup;
    const expectedLength = Math.ceil(expectedDuration * audioBuffer.sampleRate);

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext({
      numberOfChannels: audioBuffer.numberOfChannels,
      length: expectedLength,
      sampleRate: audioBuffer.sampleRate
    });

    // Create PitchShifter node - handles all the complexity internally
    const shifter = new PitchShifter(tempContext, audioBuffer, 16384);
    shifter.tempo = clampedSpeedup;  // Control speed (1.0-1.6x)
    shifter.pitch = pitch;           // Control pitch (0.8-1.2x)

    // Connect to offline context for rendering
    // Note: We need to create a buffer source for the offline context
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // PitchShifter works by creating a processing node
    // For offline rendering, we'll use a different approach: manual processing
    // Use the lower-level API but with proper setup
    const { SoundTouch, SimpleFilter, WebAudioBufferSource } = await import('soundtouchjs');

    const soundtouch = new SoundTouch();
    soundtouch.tempo = clampedSpeedup;
    soundtouch.pitch = pitch;
    soundtouch.rate = 1.0;

    const bufferSource = new WebAudioBufferSource(audioBuffer);
    const filter = new SimpleFilter(bufferSource, soundtouch);

    // Extract processed audio in chunks
    const processedSamples: Float32Array[] = [];
    const framesToExtract = 8192; // Smaller chunks for stability
    let totalExtracted = 0;
    let safetyCounter = 0;
    const maxChunks = Math.ceil(audioBuffer.length / framesToExtract) * 10; // Large safety margin

    while (safetyCounter < maxChunks) {
      // Allocate target buffer (interleaved: frames * channels)
      const target = new Float32Array(framesToExtract * audioBuffer.numberOfChannels);

      let framesExtracted = 0;
      try {
        framesExtracted = filter.extract(target, framesToExtract);
      } catch (err) {
        console.error('Filter extract failed:', err);
        // If extract fails, we're done
        break;
      }

      if (framesExtracted === 0) {
        // No more data available
        break;
      }

      // Store the extracted samples (only the portion that was filled)
      const samplesExtracted = framesExtracted * audioBuffer.numberOfChannels;
      processedSamples.push(target.slice(0, samplesExtracted));
      totalExtracted += framesExtracted;
      safetyCounter++;
    }

    if (safetyCounter >= maxChunks) {
      console.warn(`⚠️ Hit safety limit of ${maxChunks} chunks`);
    }

    console.log(`Extracted ${totalExtracted} frames in ${processedSamples.length} chunks`);

    // Calculate total samples and create output buffer
    const totalSamples = processedSamples.reduce((sum, chunk) => sum + chunk.length, 0);
    const totalFrames = totalSamples / audioBuffer.numberOfChannels;

    console.log(`Creating output buffer: ${totalFrames} frames`);

    const stretchedBuffer = new AudioBuffer({
      numberOfChannels: audioBuffer.numberOfChannels,
      length: totalFrames,
      sampleRate: audioBuffer.sampleRate
    });

    // Deinterleave samples into separate channels
    let frameIndex = 0;
    for (const chunk of processedSamples) {
      const chunkFrames = chunk.length / audioBuffer.numberOfChannels;

      for (let i = 0; i < chunkFrames; i++) {
        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
          const sampleValue = chunk[i * audioBuffer.numberOfChannels + ch];
          const channelData = stretchedBuffer.getChannelData(ch);
          if (frameIndex < channelData.length) {
            channelData[frameIndex] = sampleValue;
          }
        }
        frameIndex++;
      }
    }

    console.log(`Rendered duration: ${stretchedBuffer.duration.toFixed(2)}s (${frameIndex} frames written)`);

    // Convert to WAV format
    console.log('Converting to WAV format...');
    const wavArrayBuffer = audioBufferToWavArrayBuffer(stretchedBuffer);
    console.log(`✅ Time-stretch complete: ${originalDuration.toFixed(2)}s → ${stretchedBuffer.duration.toFixed(2)}s (tempo: ${clampedSpeedup}x, pitch: ${pitch}x)`);

    return wavArrayBuffer;
  } catch (error) {
    console.error('❌ SoundTouch processing failed:', error);
    console.log('Falling back to simple playback rate adjustment (will alter pitch)');

    // Fallback to simple playback rate adjustment
    const audioBuffer = await tempContext.decodeAudioData(audioArrayBuffer.slice(0));
    const newDuration = audioBuffer.duration / clampedSpeedup;
    const newLength = Math.ceil(newDuration * audioBuffer.sampleRate);

    const offlineContext = new OfflineAudioContext({
      numberOfChannels: audioBuffer.numberOfChannels,
      length: newLength,
      sampleRate: audioBuffer.sampleRate
    });

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = clampedSpeedup;
    source.connect(offlineContext.destination);
    source.start(0);

    const stretchedBuffer = await offlineContext.startRendering();
    return audioBufferToWavArrayBuffer(stretchedBuffer);
  } finally {
    // Clean up temporary context
    await tempContext.close();
  }
}

/**
 * Convert AudioBuffer to WAV ArrayBuffer
 */
function audioBufferToWavArrayBuffer(audioBuffer: AudioBuffer): ArrayBuffer {
  const numOfChan = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numOfChan * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * numOfChan * bytesPerSample;
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
  const channelData: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16Sample, true);
      offset += 2;
    }
  }

  return buffer;
}

/**
 * Helper to write string to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}