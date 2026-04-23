/**
 * One-off: list all keys for a given ad and dump mixer-related contents.
 * Usage: pnpm tsx scripts/inspect-ad-keys.ts <adId>
 */

import { config } from "dotenv";
import { getRedisV3 } from "../src/lib/redis-v3";

config();

async function main() {
  const adId = process.argv[2];
  if (!adId) {
    console.error("Usage: pnpm tsx scripts/inspect-ad-keys.ts <adId>");
    process.exit(1);
  }

  const redis = getRedisV3();

  // Upstash REST client exposes SCAN via `scan`. Use MATCH to filter.
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [next, found] = (await redis.scan(cursor, {
      match: `ad:${adId}:*`,
      count: 200,
    })) as [string, string[]];
    keys.push(...found);
    cursor = next;
  } while (cursor !== "0");

  keys.sort();
  console.log(`Keys for ad ${adId} (${keys.length} total):`);
  for (const k of keys) console.log(`  ${k}`);

  console.log("\n--- Mixer-related payloads ---");
  const interesting = keys.filter((k) => k.includes(":mixer"));
  for (const k of interesting) {
    const v = await redis.get(k);
    const preview =
      typeof v === "string"
        ? v.length > 500
          ? v.slice(0, 500) + `... (${v.length} chars)`
          : v
        : JSON.stringify(v, null, 2)?.slice(0, 800);
    console.log(`\n[${k}]`);
    console.log(preview);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
