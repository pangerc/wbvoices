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
// amber in the transition zone, red past the ceiling.
const TARGET_LUFS = -14;
const SOFT_CEILING_LUFS = -9;
// Tightened floor so the bar reads more like a working VU meter — most ad
// content lives in the -25..-10 range, anything below -30 is silence.
const FLOOR_LUFS = -30;
// How long peak-hold lingers before falling back. Standard VU-style: ~1.5s.
const PEAK_HOLD_MS = 1500;

export function LoudnessMeter({ audioRef, isPlaying }: LoudnessMeterProps) {
  const [momentaryLufs, setMomentaryLufs] = useState<number | null>(null);
  const [peakLufs, setPeakLufs] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const wiredElementRef = useRef<HTMLAudioElement | null>(null);
  // Peak-hold tracking lives in refs to avoid re-rendering on every frame —
  // the rAF loop re-evaluates them and only commits to state when the
  // displayed peak actually changes.
  const peakRef = useRef<{ value: number; setAt: number } | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      peakRef.current = null;
      queueMicrotask(() => {
        setMomentaryLufs(null);
        setPeakLufs(null);
      });
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
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
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

      // Peak-hold: track the loudest momentary value seen recently. Bumps
      // up immediately when current exceeds the held peak, decays only
      // after PEAK_HOLD_MS so the eye can land on it.
      const now = performance.now();
      const held = peakRef.current;
      if (!held || lufs > held.value) {
        peakRef.current = { value: lufs, setAt: now };
        setPeakLufs(lufs);
      } else if (now - held.setAt > PEAK_HOLD_MS) {
        peakRef.current = { value: lufs, setAt: now };
        setPeakLufs(lufs);
      }

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
  const clampToRange = (v: number) =>
    Math.max(FLOOR_LUFS, Math.min(SOFT_CEILING_LUFS, v));
  const fillValue =
    momentaryLufs === null ? FLOOR_LUFS : clampToRange(momentaryLufs);
  const fillPct = ((fillValue - FLOOR_LUFS) / range) * 100;
  const targetPct = ((TARGET_LUFS - FLOOR_LUFS) / range) * 100;
  const peakPct =
    peakLufs === null
      ? null
      : ((clampToRange(peakLufs) - FLOOR_LUFS) / range) * 100;

  // Color zones — green well under target, amber approaching, red over.
  // Inline styles instead of Tailwind classes to avoid any class-name
  // purging surprises with dynamically-selected utilities.
  const pastTarget = momentaryLufs !== null && momentaryLufs > TARGET_LUFS;
  const pastCeiling =
    momentaryLufs !== null && momentaryLufs > SOFT_CEILING_LUFS;
  const fillRgb = pastCeiling
    ? "#f87171" // red-400
    : pastTarget
      ? "#fbbf24" // amber-400
      : "#34d399"; // emerald-400
  const headroomTextRgb = pastCeiling
    ? "#fca5a5"
    : pastTarget
      ? "#fcd34d"
      : "#d1d5db";

  // Headroom readout: positive = under target (safe), negative = over.
  // Friendlier than raw LUFS for non-engineers; the raw value sits below
  // in subdued type for users who want the absolute number.
  const headroom = momentaryLufs === null ? null : TARGET_LUFS - momentaryLufs;
  const headroomLabel = (() => {
    if (headroom === null) return "—";
    if (Math.abs(headroom) < 0.5) return "on target";
    if (headroom > 0) return `${headroom.toFixed(1)} dB under`;
    return `${Math.abs(headroom).toFixed(1)} dB over`;
  })();

  // Minimum visible fill so the bar always shows the current value, even
  // at -28 LUFS where the proportional fill would be ~5px wide and easy
  // to miss against the marker lines.
  const MIN_FILL_PX = 6;

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-32 h-2 rounded-full bg-white/10 overflow-hidden flex-shrink-0"
        title={
          momentaryLufs === null
            ? "Loudness meter (idle)"
            : `${momentaryLufs.toFixed(1)} LUFS — target ${TARGET_LUFS}`
        }
      >
        <div
          // No CSS transition: the rAF loop already updates state at 60 fps,
          // and a 75ms width transition was making the bar perpetually lag
          // behind the readout text — fill showed a smoothed-down value
          // while the number text showed the latest spike, so they read as
          // disagreeing.
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: `max(${MIN_FILL_PX}px, ${fillPct}%)`,
            backgroundColor: fillRgb,
          }}
        />
        {/* Peak-hold marker — narrow vertical line at the loudest recent
            momentary value; decays after PEAK_HOLD_MS so the eye can
            land on it. White for visibility against any fill color. */}
        {peakPct !== null && (
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${peakPct}%`,
              width: 2,
              backgroundColor: "rgba(255,255,255,0.9)",
            }}
            aria-hidden="true"
          />
        )}
        {/* Target tick — Spotify's -14 LUFS integrated target */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${targetPct}%`,
            width: 1,
            backgroundColor: "rgba(255,255,255,0.6)",
          }}
          aria-hidden="true"
        />
      </div>
      {/* Fixed width on the readout column so the meter doesn't shift
          horizontally as the headroom text width changes ("on target" vs
          "14.8 dB under"). Right-aligned so single-line readouts hug the
          inner edge of their reserved column. */}
      <div className="flex flex-col leading-tight w-[88px] text-right">
        <span
          className="text-[11px] tabular-nums truncate"
          style={{ color: headroomTextRgb }}
        >
          {headroomLabel}
        </span>
        <span className="text-[10px] text-gray-500 tabular-nums truncate">
          {momentaryLufs === null ? "—" : `${momentaryLufs.toFixed(1)} LUFS`}
        </span>
      </div>
    </div>
  );
}
