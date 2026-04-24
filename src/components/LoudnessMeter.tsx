import { useEffect, useRef, useState } from "react";

/**
 * Live momentary-LUFS meter for the mixer preview.
 *
 * Wires a Web Audio graph off the preview `<audio>` element:
 *   MediaElementSource → pre-filter high-pass → high-shelf (K-weighting
 *   approximation per ITU-R BS.1770) → AnalyserNode → destination.
 *
 * The analyser's time-domain output feeds a requestAnimationFrame loop
 * that computes mean-square, converts to K-weighted dBFS, and exposes
 * it via state as a momentary LUFS estimate. Honest caveat in the ui
 * copy — proper integrated LUFS still runs at export time via
 * `calculateLUFS` over the rendered buffer.
 *
 * The graph is created lazily on first play (AudioContext.resume() needs
 * a user gesture). Once connected, the `<audio>` element's output flows
 * through the graph permanently — disconnecting would cut all audio.
 */

type LoudnessMeterProps = {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
};

// Spotify streaming target. Tick bands hang off this: green up to target,
// yellow in a transition zone, red past the ceiling.
const TARGET_LUFS = -14;
const SOFT_CEILING_LUFS = -9;
const FLOOR_LUFS = -40;

export function LoudnessMeter({ audioRef, isPlaying }: LoudnessMeterProps) {
  const [momentaryLufs, setMomentaryLufs] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const wiredElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Schedule the reset to a microtask so the effect body doesn't
      // synchronously setState (avoids React 19's cascading-render warning
      // and is functionally identical).
      queueMicrotask(() => setMomentaryLufs(null));
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    // First-play wiring. Only done once per <audio> element — createMediaElementSource
    // can only be called once per element, and reconnecting the graph on every play
    // would leak nodes. If the audio element itself swaps (new preview blob), the
    // existing graph already sees the new playback (same DOM node).
    if (wiredElementRef.current !== audio) {
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        const source = ctx.createMediaElementSource(audio);

        // K-weighting approximation. Two biquads per BS.1770:
        //   (1) RLB high-pass — removes rumble, -3 dB at ~38 Hz
        //   (2) pre-filter high-shelf — ~+4 dB above ~1500 Hz
        // Coefficients below are the per-spec values, sampled at the
        // context's sample rate via Q/frequency/gain params.
        const highPass = ctx.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = 38;
        highPass.Q.value = 0.5;

        const highShelf = ctx.createBiquadFilter();
        highShelf.type = "highshelf";
        highShelf.frequency.value = 1500;
        highShelf.gain.value = 4;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;

        source.connect(highPass);
        highPass.connect(highShelf);
        highShelf.connect(analyser);
        analyser.connect(ctx.destination);

        ctxRef.current = ctx;
        analyserRef.current = analyser;
        bufferRef.current = new Float32Array(analyser.fftSize);
        wiredElementRef.current = audio;
      } catch (err) {
        console.warn("[loudness-meter] graph setup failed:", err);
        return;
      }
    }

    // User gesture guaranteed: play-button click is what toggled isPlaying.
    void ctxRef.current?.resume();

    const tick = () => {
      const analyser = analyserRef.current;
      const buffer = bufferRef.current;
      if (!analyser || !buffer) return;
      analyser.getFloatTimeDomainData(buffer);

      // Mean-square of the K-weighted signal, converted to dBFS.
      // Clamp the sum's lower bound so silent passages don't return -Infinity.
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i];
      }
      const meanSquare = sumSquares / buffer.length;
      const dbfs = 10 * Math.log10(Math.max(meanSquare, 1e-10));
      // BS.1770 adds a -0.691 offset after K-weighting; the filters above
      // are an approximation so this keeps the readout roughly LUFS-scaled.
      const lufs = -0.691 + dbfs;
      setMomentaryLufs(lufs);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, audioRef]);

  // Render — always present so layout doesn't jump when playback starts.
  // Bar fills from FLOOR_LUFS on the left up to SOFT_CEILING_LUFS on the right.
  const range = SOFT_CEILING_LUFS - FLOOR_LUFS;
  const clamped =
    momentaryLufs === null
      ? FLOOR_LUFS
      : Math.max(FLOOR_LUFS, Math.min(SOFT_CEILING_LUFS, momentaryLufs));
  const fillPct = ((clamped - FLOOR_LUFS) / range) * 100;
  const targetPct = ((TARGET_LUFS - FLOOR_LUFS) / range) * 100;

  // Color band: green before target, yellow between target and ceiling,
  // red when past the ceiling (value clamped; flag separately).
  const pastTarget =
    momentaryLufs !== null && momentaryLufs > TARGET_LUFS;
  const pastCeiling =
    momentaryLufs !== null && momentaryLufs > SOFT_CEILING_LUFS;
  const fillColor = pastCeiling
    ? "bg-red-400"
    : pastTarget
      ? "bg-amber-400"
      : "bg-emerald-400";

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-28 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${fillColor} transition-[width] duration-75`}
          style={{ width: `${fillPct}%` }}
        />
        {/* Target tick — Spotify's -14 LUFS integrated target */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white/50"
          style={{ left: `${targetPct}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="text-[11px] text-gray-400 tabular-nums w-14">
        {momentaryLufs === null
          ? "— LUFS"
          : `${momentaryLufs.toFixed(1)} LUFS`}
      </span>
    </div>
  );
}
