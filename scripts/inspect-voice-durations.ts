/**
 * One-off: dump voice track durations + generated urls so we can compare
 * the stored `generatedDuration` against the actual blob length.
 * Usage: pnpm tsx scripts/inspect-voice-durations.ts <adId>
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";

config();

async function main() {
  const adId = process.argv[2];
  if (!adId) {
    console.error("Usage: pnpm tsx scripts/inspect-voice-durations.ts <adId>");
    process.exit(1);
  }

  const redis = getRedisV3();
  const activeVoice = (await redis.get(`ad:${adId}:voices:active`)) as
    | string
    | null;
  if (!activeVoice) {
    console.error("no active voice version");
    process.exit(1);
  }
  const raw = await redis.get(`ad:${adId}:voices:v:${activeVoice}`);
  const voice = typeof raw === "string" ? JSON.parse(raw) : raw;

  const { parseBuffer } = await import("music-metadata");

  console.log(
    `Voice version ${activeVoice}, ${voice.voiceTracks.length} tracks`,
  );
  console.log();

  for (const [i, t] of voice.voiceTracks.entries()) {
    const stored = t.generatedDuration;
    let measured: number | null = null;
    if (t.generatedUrl) {
      try {
        const res = await fetch(t.generatedUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        const meta = await parseBuffer(buf);
        measured = meta.format.duration ?? null;
      } catch (err) {
        console.warn(`  track ${i}: measurement failed`, err);
      }
    }
    const drift =
      stored !== undefined && measured !== null
        ? (measured - stored).toFixed(3)
        : "n/a";
    console.log(
      `  [${i}] slot=${t.slotId?.slice(0, 8) ?? "?"} voice=${t.voice?.name ?? "?"}  stored=${stored ?? "n/a"}s  measured=${measured?.toFixed(3) ?? "n/a"}s  drift=${drift}s`,
    );
    console.log(
      `      speedup=${t.postProcessingSpeedup ?? "—"} targetDuration=${t.targetDuration ?? "—"} speed=${t.speed ?? "—"}`,
    );
    console.log(
      `      text: "${t.text.slice(0, 60)}${t.text.length > 60 ? "…" : ""}"`,
    );
  }

  // Music
  const activeMusic = (await redis.get(`ad:${adId}:music:active`)) as
    | string
    | null;
  if (activeMusic) {
    const mraw = await redis.get(`ad:${adId}:music:v:${activeMusic}`);
    const music = typeof mraw === "string" ? JSON.parse(mraw) : mraw;
    let measured: number | null = null;
    try {
      const res = await fetch(music.generatedUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await parseBuffer(buf);
      measured = meta.format.duration ?? null;
    } catch (err) {
      console.warn("music measurement failed", err);
    }
    console.log();
    console.log(
      `Music ${activeMusic}: slot=${music.slotId?.slice(0, 8)} stored=${music.duration}s measured=${measured?.toFixed(3) ?? "n/a"}s drift=${
        measured !== null ? (measured - music.duration).toFixed(3) : "n/a"
      }s`,
    );
  }

  // Sfx
  const activeSfx = (await redis.get(`ad:${adId}:sfx:active`)) as string | null;
  if (activeSfx) {
    const sraw = await redis.get(`ad:${adId}:sfx:v:${activeSfx}`);
    const sfx = typeof sraw === "string" ? JSON.parse(sraw) : sraw;
    console.log();
    console.log(`Sfx ${activeSfx}: ${sfx.soundFxPrompts.length} prompts`);
    for (const [i, p] of sfx.soundFxPrompts.entries()) {
      let measured: number | null = null;
      if (sfx.generatedUrls[i]) {
        try {
          const res = await fetch(sfx.generatedUrls[i]);
          const buf = Buffer.from(await res.arrayBuffer());
          const meta = await parseBuffer(buf);
          measured = meta.format.duration ?? null;
        } catch (err) {
          console.warn(`  sfx ${i}: measurement failed`, err);
        }
      }
      console.log(
        `  [${i}] slot=${p.slotId?.slice(0, 8) ?? "?"} stored=${p.duration ?? "n/a"}s measured=${measured?.toFixed(3) ?? "n/a"}s drift=${
          measured !== null && p.duration !== undefined
            ? (measured - p.duration).toFixed(3)
            : "n/a"
        }s description="${p.description.slice(0, 40)}"`,
      );
    }
  }

  // Mixer anchors + overrides
  const activeMixer = (await redis.get(`ad:${adId}:mixer:active`)) as
    | string
    | null;
  if (activeMixer) {
    const mxraw = await redis.get(`ad:${adId}:mixer:v:${activeMixer}`);
    const mixer = typeof mxraw === "string" ? JSON.parse(mxraw) : mxraw;
    console.log();
    console.log(`Mixer ${activeMixer} (${mixer.status}):`);
    for (const [slot, entry] of Object.entries(mixer.anchors ?? {})) {
      console.log(`  ${slot.slice(0, 8)}  ${JSON.stringify(entry)}`);
    }
    if (mixer.overrides && Object.keys(mixer.overrides).length > 0) {
      console.log(`  overrides: ${JSON.stringify(mixer.overrides, null, 2)}`);
    }
  }

  // All mixer versions — id, status, pins, voice track count
  console.log();
  console.log("=== All mixer versions ===");
  const mixerList = (await redis.lrange(
    `ad:${adId}:mixer:versions`,
    0,
    -1,
  )) as string[];
  for (const mid of mixerList) {
    const raw = await redis.get(`ad:${adId}:mixer:v:${mid}`);
    const m = typeof raw === "string" ? JSON.parse(raw) : raw;
    const voiceVer = m.pins?.voices;
    let voiceTrackCount = "—";
    if (voiceVer) {
      const vraw = await redis.get(`ad:${adId}:voices:v:${voiceVer}`);
      const v = typeof vraw === "string" ? JSON.parse(vraw) : vraw;
      voiceTrackCount = String(v?.voiceTracks?.length ?? "?");
    }
    const cache = m.cachedResolverOutput;
    const cacheInfo = cache
      ? `cacheTracks=${cache.calculatedTracks?.length ?? "?"} cacheDuration=${cache.totalDuration ?? "?"}`
      : "nocache";
    console.log(
      `  ${mid} [${m.status}] pins=(voices:${m.pins?.voices ?? "—"}, music:${m.pins?.music ?? "—"}, sfx:${m.pins?.sfx ?? "—"}) voiceTracks=${voiceTrackCount} anchors=${Object.keys(m.anchors ?? {}).length} ${cacheInfo} label=${m.label ?? "—"} createdAt=${new Date(m.createdAt).toISOString()}`,
    );
    if (cache?.calculatedTracks) {
      for (const ct of cache.calculatedTracks) {
        console.log(
          `    cached: ${ct.id} type=${ct.type} start=${ct.startTime} dur=${ct.duration}`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
