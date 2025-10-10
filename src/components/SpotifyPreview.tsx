"use client";
import React from "react";
import Image from "next/image";

export interface SpotifyPreviewProps {
  adImage?: string;
  logo?: string;
  brand?: string;
  slogan?: string;
  cta?: string;
  audioSrc?: string;
  isGenerating?: boolean;
  isInvalid?: boolean;
}

type Rgb = { r: number; g: number; b: number };

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

const toCss = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`;
const adjustL = (hsl: { h: number; s: number; l: number }, delta: number) => ({
  h: hsl.h,
  s: hsl.s,
  l: Math.max(0, Math.min(1, hsl.l + delta)),
});

async function getAverageRgb(url: string): Promise<Rgb | null> {
  console.log("🎨 getAverageRgb: Starting with URL:", url);
  try {
    const img = new globalThis.Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        console.log("🎨 getAverageRgb: Image loaded successfully");
        resolve();
      };
      img.onerror = (error) => {
        console.error("🎨 getAverageRgb: Image failed to load:", error);
        reject(error);
      };
      img.src = url;
    });
    const c = document.createElement("canvas");
    const size = 24;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, Math.floor(size * 0.35));
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  } catch (error) {
    console.error("🎨 getAverageRgb: Error caught:", error);
    return null;
  }
}

function rgbToHsv({ r, g, b }: Rgb): { h: number; s: number; v: number } {
  const rf = r / 255,
    gf = g / 255,
    bf = b / 255;
  const max = Math.max(rf, gf, bf),
    min = Math.min(rf, gf, bf);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rf:
        h = (gf - bf) / d + (gf < bf ? 6 : 0);
        break;
      case gf:
        h = (bf - rf) / d + 2;
        break;
      case bf:
        h = (rf - gf) / d + 4;
        break;
    }
    h /= 6;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

async function getDominantRgb(url: string): Promise<Rgb | null> {
  console.log("🎨 getDominantRgb: Starting with URL:", url);
  try {
    const img = new globalThis.Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        console.log("🎨 getDominantRgb: Image loaded successfully");
        resolve();
      };
      img.onerror = (error) => {
        console.error("🎨 getDominantRgb: Image failed to load:", error);
        reject(error);
      };
      img.src = url;
    });
    const c = document.createElement("canvas");
    const size = 48;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const topH = Math.floor(size * 0.5);
    const { data } = ctx.getImageData(0, 0, size, topH);
    const bins = 36;
    const counts = new Array(bins).fill(0);
    const sums = Array.from({ length: bins }, () => ({ r: 0, g: 0, b: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const hsv = rgbToHsv({ r, g, b });
      if (hsv.s < 0.2 || hsv.v < 0.15 || hsv.v > 0.95) continue;
      const idx = Math.floor(hsv.h * bins) % bins;
      const weight = hsv.s * hsv.s;
      counts[idx] += weight;
      sums[idx].r += r * weight;
      sums[idx].g += g * weight;
      sums[idx].b += b * weight;
    }
    let best = 0;
    for (let i = 1; i < bins; i++) if (counts[i] > counts[best]) best = i;
    if (counts[best] <= 0) return null;
    return {
      r: Math.round(sums[best].r / counts[best]),
      g: Math.round(sums[best].g / counts[best]),
      b: Math.round(sums[best].b / counts[best]),
    };
  } catch (error) {
    console.error("🎨 getDominantRgb: Error caught:", error);
    return null;
  }
}

export function SpotifyPreview({
  adImage,
  logo,
  brand,
  slogan,
  cta = "Learn More",
  audioSrc,
  isGenerating = false,
  isInvalid = false,
}: SpotifyPreviewProps) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState<number>(30);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [grad, setGrad] = React.useState<{
    top: string;
    mid: string;
    bottom: string;
  }>({ top: "#1E6FB2", mid: "#124A80", bottom: "#0B2233" });

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 30);
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
    };
  }, [audioSrc]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const format = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((e.clientX - rect.left) / rect.width, 0),
      1
    );
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ratio * (audio.duration || duration);
    setCurrentTime(audio.currentTime);
  };

  const progress = (duration || 30) > 0 ? (currentTime / duration) * 100 : 0;

  // Compute gradient colors dynamically from the image, or use default grays
  React.useEffect(() => {
    let cancelled = false;
    console.log(
      "🎨 SpotifyPreview: Gradient effect triggered, adImage:",
      adImage
    );

    (async () => {
      if (adImage) {
        console.log(
          "🎨 SpotifyPreview: Processing image for gradient:",
          adImage
        );

        try {
          console.log("🎨 SpotifyPreview: Calling getDominantRgb...");
          const dominantColor = await getDominantRgb(adImage);
          console.log(
            "🎨 SpotifyPreview: getDominantRgb result:",
            dominantColor
          );

          let dom = dominantColor;

          if (!dom) {
            console.log(
              "🎨 SpotifyPreview: No dominant color, trying getAverageRgb..."
            );
            dom = await getAverageRgb(adImage);
            console.log("🎨 SpotifyPreview: getAverageRgb result:", dom);
          }

          if (!dom || cancelled) {
            console.log(
              "🎨 SpotifyPreview: No dominant color found or cancelled, dom:",
              dom,
              "cancelled:",
              cancelled
            );
            return;
          }

          console.log("🎨 SpotifyPreview: Extracted dominant color:", dom);

          const hsl = rgbToHsl(dom);
          const saturated = {
            h: hsl.h,
            s: Math.min(1, hsl.s * 1.35 + 0.05),
            l: hsl.l,
          };
          const base = { ...saturated, l: Math.max(0, saturated.l * 0.8) };
          const top = toCss(hslToRgb(adjustL(base, -0.11)));
          const mid = toCss(hslToRgb(adjustL(base, -0.2)));
          const bottom = toCss(hslToRgb(adjustL(base, -0.62)));

          console.log("🎨 SpotifyPreview: Generated gradient:", {
            top,
            mid,
            bottom,
          });
          setGrad({ top, mid, bottom });
        } catch (error) {
          console.error(
            "🎨 SpotifyPreview: Error processing image for gradient:",
            error
          );
          // Fallback to default gradient
          setGrad({
            top: "#4B5563",
            mid: "#374151",
            bottom: "#1F2937",
          });
        }
      } else {
        console.log("🎨 SpotifyPreview: No adImage, using default gradient");
        // Use dark gray gradient as placeholder
        setGrad({
          top: "#4B5563",
          mid: "#374151",
          bottom: "#1F2937",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adImage]);

  return (
    <div className="w-full max-w-[390px] mx-auto">
      <div className="rounded-[28px] overflow-hidden ring ring-white/20 relative">
        {/* Overlay when generating or invalid */}
        {(isGenerating || isInvalid) && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 rounded-[28px] flex items-center justify-center">
            <div className="text-center text-white px-6">
              {isGenerating && (
                <>
                  <div className="mb-4">
                    <svg
                      className="animate-spin h-12 w-12 mx-auto text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold">Generating preview...</p>
                  <p className="text-sm text-gray-300 mt-2">
                    Mixing audio tracks
                  </p>
                </>
              )}
              {!isGenerating && isInvalid && (
                <>
                  <div className="mb-4">
                    <svg
                      className="h-12 w-12 mx-auto text-yellow-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold">Preview Outdated</p>
                  <p className="text-sm text-gray-300 mt-2">
                    Go to Mixer and click PLAY to regenerate
                  </p>
                </>
              )}
            </div>
          </div>
        )}
        <div
          className="bg-gradient-to-b from-[var(--grad-top)] via-[var(--grad-mid)] to-[var(--grad-bottom)]"
          style={{
            ["--grad-top" as unknown as string]: grad.top,
            ["--grad-mid" as unknown as string]: grad.mid,
            ["--grad-bottom" as unknown as string]: grad.bottom,
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 pt-10 pb-5 text-white">
            <button
              aria-label="close"
              className="p-2 rounded-full hover:bg-white/10"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <div className="text-sm font-bold tracking-tight text-white/90">
              {brand || "Brand Name"}
            </div>
            <button
              aria-label="menu"
              className="p-2 rounded-full hover:bg-white/10 text-gray-400"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
          </div>

          {/* Creative */}
          <div className="px-6">
            <div className="rounded-sm overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              {adImage ? (
                <Image
                  src={adImage}
                  alt="Ad preview"
                  width={640}
                  height={640}
                  className="w-full h-auto object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-gray-600 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <svg
                      className="w-12 h-12 mx-auto mb-2"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17l2.5-3.15L14 17H9zm4.5-5.15L17 17h-2.5l-1-1.35z" />
                    </svg>
                    <p className="text-xs">Campaign Visual</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Brand info */}
          <div className="px-6 pt-8 pb-8 text-white">
            <div className="flex items-center gap-4">
              {logo ? (
                <Image
                  src={logo}
                  alt="Brand logo"
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-sm object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-sm bg-gray-600 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
              )}
              <div>
                <div className="text-2xl font-extrabold leading-tight">
                  {brand || "Brand Name"}
                </div>
                <div className="text-base font-medium text-gray-400">
                  Advertisement
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-5">
              <div
                className="h-[4px] w-full bg-white/20 rounded-full cursor-pointer"
                onClick={onScrub}
              >
                <div
                  className="h-[4px] bg-white rounded-full"
                  style={{ width: `${progress.toFixed(2)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[14px] text-white/70 mt-2">
                <span>{format(currentTime)}</span>
                <span>-{format(Math.max(duration - currentTime, 0))}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-0 flex items-center justify-between">
              <button
                className="p-2 text-white/80 hover:text-white"
                aria-label="dislike"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M13.117 24H11.72a3.5 3.5 0 0 1-3.424-4.228L8.886 17H4.04C2.293 17 .737 15.646.737 13.79c0-3.27.571-6.41 1.62-9.322C2.913 2.916 4.408 2 5.97 2H24v12h-5.109zm-1.155-2 5.775-10H22V4H5.97c-.806 0-1.488.467-1.732 1.145a25.5 25.5 0 0 0-1.5 8.645c0 .645.55 1.21 1.303 1.21h4.845a2 2 0 0 1 1.956 2.416l-.59 2.772A1.5 1.5 0 0 0 11.72 22z"></path>
                </svg>
              </button>
              <button
                className="p-2 text-white/80 hover:text-white"
                aria-label="prev"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M6.3 3a.7.7 0 0 1 .7.7v6.805l11.95-6.899a.7.7 0 0 1 1.05.606v15.576a.7.7 0 0 1-1.05.606L7 13.495V20.3a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7z"></path>
                </svg>
              </button>
              <button
                className="h-[50px] w-[50px] rounded-full bg-white text-black grid place-items-center shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
                aria-label="play"
                onClick={togglePlay}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-10 w-10"
                  fill="currentColor"
                >
                  {isPlaying ? (
                    <>
                      <rect x="7" y="6" width="3" height="12" rx="0.5"></rect>
                      <rect x="14" y="6" width="3" height="12" rx="0.5"></rect>
                    </>
                  ) : (
                    <path d="M8 5v14l11-7z" />
                  )}
                </svg>
              </button>
              <button
                className="p-2 text-white/80 hover:text-white"
                aria-label="next"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M17.7 3a.7.7 0 0 0-.7.7v6.805L5.05 3.606A.7.7 0 0 0 4 4.212v15.576a.7.7 0 0 0 1.05.606L17 13.495V20.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V3.7a.7.7 0 0 0-.7-.7z"></path>
                </svg>
              </button>
              <button
                className="p-2 text-white/80 hover:text-white"
                aria-label="like"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M10.883 0h1.397a3.5 3.5 0 0 1 3.424 4.228L15.114 7h4.845c1.748 0 3.304 1.355 3.304 3.21 0 3.27-.571 6.41-1.62 9.322C21.086 21.084 19.592 22 18.03 22H0V10h5.109zm1.155 2L6.263 12H2v8h16.03c.806 0 1.488-.467 1.732-1.145a25.5 25.5 0 0 0 1.5-8.645c0-.645-.55-1.21-1.303-1.21h-4.845a2 2 0 0 1-1.956-2.416l.59-2.772A1.5 1.5 0 0 0 12.28 2z"></path>
                </svg>
              </button>
            </div>

            {/* CTA */}
            <div className="mt-6 pb-4">
              <div
                className="rounded-lg p-4"
                style={{ backgroundColor: grad.mid }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-white font-bold text-sm leading-snug">
                    {slogan || "Your campaign slogan here"}
                  </div>
                  <button className="rounded-full bg-white text-black text-sm font-bold px-4 py-2">
                    {cta}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={audioSrc} />
    </div>
  );
}
