/**
 * Backfill generatedDuration on legacy voice tracks.
 *
 * Voice versions created before duration measurement was added to the provider
 * pipeline have tracks with `generatedUrl` set but no `generatedDuration`.
 * Without the measured duration the mixer falls back to a word-count heuristic,
 * which becomes the only signal after the reactive-cascade strip lands.
 *
 * This script:
 *   1. Iterates every ad in the V3 Redis instance.
 *   2. Scans each voice version's tracks.
 *   3. For tracks missing a valid generatedDuration but having a generatedUrl,
 *      downloads the blob, measures duration via music-metadata, and writes
 *      the updated version back.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-voice-durations.ts           # dry-run (default)
 *   pnpm tsx scripts/backfill-voice-durations.ts --write   # actually persist
 *   pnpm tsx scripts/backfill-voice-durations.ts --ad <id> # single ad
 *   pnpm tsx scripts/backfill-voice-durations.ts --limit 10 # stop after N tracks
 *
 * The script is idempotent: a track with a non-zero generatedDuration is skipped.
 */

import { config } from "dotenv";
import * as mm from "music-metadata";
import { getRedisV3 } from "../src/lib/redis-v3";
import { AD_KEYS } from "../src/lib/redis/versions";
import type { VoiceVersion, VersionId } from "../src/types/versions";

config();

type Args = {
  write: boolean;
  adFilter?: string;
  limit?: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { write: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--write") result.write = true;
    else if (arg === "--ad") result.adFilter = args[++i];
    else if (arg === "--limit") result.limit = Number(args[++i]);
  }
  return result;
}

type Stats = {
  adsScanned: number;
  versionsScanned: number;
  tracksScanned: number;
  tracksAlreadyHad: number;
  tracksMissingUrl: number;
  tracksMeasured: number;
  tracksFailed: number;
  versionsWritten: number;
};

async function measureDuration(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const metadata = await mm.parseBuffer(uint8);
  const duration = metadata.format.duration;
  if (!duration || duration <= 0) {
    throw new Error("music-metadata returned no duration");
  }
  return duration;
}

async function listAds(adFilter: string | undefined): Promise<string[]> {
  const redis = getRedisV3();
  if (adFilter) return [adFilter];
  const all = await redis.get<string[]>("ads:all");
  if (!all || all.length === 0) return [];
  return all;
}

async function scanAd(adId: string, args: Args, stats: Stats): Promise<void> {
  const redis = getRedisV3();
  const versionIds = (await redis.lrange(
    AD_KEYS.versions(adId, "voices"),
    0,
    -1,
  )) as VersionId[];
  if (!versionIds || versionIds.length === 0) return;

  for (const versionId of versionIds) {
    if (args.limit && stats.tracksMeasured >= args.limit) return;

    const key = AD_KEYS.version(adId, "voices", versionId);
    const version = await redis.get<VoiceVersion>(key);
    if (!version) continue;
    stats.versionsScanned++;

    let mutated = false;
    for (let i = 0; i < version.voiceTracks.length; i++) {
      if (args.limit && stats.tracksMeasured >= args.limit) break;
      const track = version.voiceTracks[i];
      stats.tracksScanned++;

      const hasDuration =
        typeof track.generatedDuration === "number" &&
        track.generatedDuration > 0;
      if (hasDuration) {
        stats.tracksAlreadyHad++;
        continue;
      }

      const url = track.generatedUrl ?? version.generatedUrls?.[i];
      if (!url) {
        stats.tracksMissingUrl++;
        continue;
      }

      try {
        const duration = await measureDuration(url);
        stats.tracksMeasured++;
        console.log(
          `  [${adId}/${versionId}/#${i}] measured ${duration.toFixed(2)}s  (${track.voice?.name ?? "unknown"})`,
        );
        if (args.write) {
          track.generatedDuration = duration;
          mutated = true;
        }
      } catch (err) {
        stats.tracksFailed++;
        console.warn(
          `  [${adId}/${versionId}/#${i}] FAILED: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (mutated && args.write) {
      await redis.set(key, JSON.stringify(version));
      stats.versionsWritten++;
      console.log(`  ✏️  wrote ${key}`);
    }
  }
}

async function main() {
  const args = parseArgs();
  const mode = args.write ? "WRITE" : "DRY-RUN";
  console.log(`Backfill voice durations — mode: ${mode}`);
  if (args.adFilter) console.log(`  ad filter: ${args.adFilter}`);
  if (args.limit) console.log(`  limit: ${args.limit} tracks`);
  console.log();

  const ads = await listAds(args.adFilter);
  if (ads.length === 0) {
    console.log("No ads found.");
    return;
  }

  const stats: Stats = {
    adsScanned: 0,
    versionsScanned: 0,
    tracksScanned: 0,
    tracksAlreadyHad: 0,
    tracksMissingUrl: 0,
    tracksMeasured: 0,
    tracksFailed: 0,
    versionsWritten: 0,
  };

  for (const adId of ads) {
    if (args.limit && stats.tracksMeasured >= args.limit) break;
    stats.adsScanned++;
    await scanAd(adId, args, stats);
  }

  console.log();
  console.log("=== Summary ===");
  console.log(`Ads scanned:             ${stats.adsScanned}`);
  console.log(`Voice versions scanned:  ${stats.versionsScanned}`);
  console.log(`Tracks scanned:          ${stats.tracksScanned}`);
  console.log(`  already had duration:  ${stats.tracksAlreadyHad}`);
  console.log(`  missing generatedUrl:  ${stats.tracksMissingUrl}`);
  console.log(`  measured successfully: ${stats.tracksMeasured}`);
  console.log(`  failed to measure:     ${stats.tracksFailed}`);
  if (args.write) {
    console.log(`Versions written back:   ${stats.versionsWritten}`);
  } else {
    console.log(`(dry-run — nothing written; rerun with --write to persist)`);
  }
}

main().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
