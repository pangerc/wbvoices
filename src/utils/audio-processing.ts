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