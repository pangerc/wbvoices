#!/usr/bin/env tsx

/**
 * Migrate ElevenLabs voice library from private (OLD) account to Aleph (NEW) account.
 *
 * - Enumerates both accounts via GET /v1/voices?show_legacy=true
 * - For each professional (library-copied) voice in OLD that isn't already in ALEPH
 *   and whose sharing.status === 'copied', POSTs to
 *   /v1/voices/add/{public_owner_id}/{original_voice_id} with the ALEPH key.
 * - If any new voice_id differs from the old one, rewrites Neon voice_descriptions
 *   and voice_blacklist rows in a single transaction.
 * - Skips premade (system defaults, same ID everywhere), generated (non-migratable),
 *   and copied_disabled voices. Reports them.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-elevenlabs-account.ts [--dry-run]
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceDescriptions, voiceBlacklist } from "@/lib/db/schema";

type ElevenVoice = {
  voice_id: string;
  name: string;
  category?: "premade" | "professional" | "generated" | string;
  sharing?: {
    status?: string;
    public_owner_id?: string;
    original_voice_id?: string;
  };
};

type Result =
  | {
      kind: "added";
      old_voice_id: string;
      new_voice_id: string;
      name: string;
      public_owner_id: string;
    }
  | {
      kind: "failed";
      old_voice_id: string;
      name: string;
      public_owner_id?: string;
      error: string;
    }
  | {
      kind: "skipped";
      old_voice_id: string;
      name: string;
      reason: string;
    };

const ELEVEN_API = "https://api.elevenlabs.io";

async function fetchVoices(apiKey: string, label: string): Promise<ElevenVoice[]> {
  const res = await fetch(`${ELEVEN_API}/v1/voices?show_legacy=true`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`${label} GET /v1/voices failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { voices: ElevenVoice[] };
  return data.voices ?? [];
}

async function addSharedVoice(
  apiKey: string,
  publicOwnerId: string,
  originalVoiceId: string,
  newName: string
): Promise<{ voice_id: string }> {
  const res = await fetch(
    `${ELEVEN_API}/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(originalVoiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ new_name: newName, bookmarked: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as { voice_id: string };
}

async function rewriteNeon(mapping: Array<{ old: string; new: string }>) {
  console.log(`\n🗄  Rewriting Neon for ${mapping.length} changed voice_ids...`);
  await db.transaction(async (tx) => {
    for (const { old: o, new: n } of mapping) {
      // voice_descriptions: exact match on "elevenlabs:{id}"
      await tx.execute(sql`
        UPDATE ${voiceDescriptions}
        SET voice_key = ${"elevenlabs:" + n},
            updated_at = NOW()
        WHERE voice_key = ${"elevenlabs:" + o}
      `);

      // voice_blacklist: keys are "elevenlabs:{id}" or "elevenlabs:{id}-{lang}";
      // replace the matching prefix while preserving any suffix.
      const oldPrefix = "elevenlabs:" + o;
      const newPrefix = "elevenlabs:" + n;
      await tx.execute(sql`
        UPDATE ${voiceBlacklist}
        SET voice_key = ${newPrefix} || SUBSTRING(voice_key FROM ${oldPrefix.length + 1}),
            updated_at = NOW()
        WHERE voice_key = ${oldPrefix}
           OR voice_key LIKE ${oldPrefix + "-%"}
      `);
    }
  });
  console.log(`✅ Neon rewrite complete.`);
}

function writeSummary(results: Result[], outPath: string, meta: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    meta,
    counts: {
      added: results.filter((r) => r.kind === "added").length,
      failed: results.filter((r) => r.kind === "failed").length,
      skipped: results.filter((r) => r.kind === "skipped").length,
    },
    results,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const OLD_KEY = process.env.ELEVENLABS_API_KEY;
  const NEW_KEY = process.env.ELEVENLABS_API_KEY_ALEPH;
  if (!OLD_KEY) throw new Error("ELEVENLABS_API_KEY (source) missing in env");
  if (!NEW_KEY) throw new Error("ELEVENLABS_API_KEY_ALEPH (destination) missing in env");
  if (OLD_KEY === NEW_KEY) throw new Error("Source and destination keys are identical — aborting");

  console.log(`🎙  ElevenLabs migration ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`   Source: ELEVENLABS_API_KEY`);
  console.log(`   Dest:   ELEVENLABS_API_KEY_ALEPH\n`);

  const [oldVoices, newVoices] = await Promise.all([
    fetchVoices(OLD_KEY, "OLD"),
    fetchVoices(NEW_KEY, "ALEPH"),
  ]);

  console.log(`📋 OLD account: ${oldVoices.length} voices total`);
  console.log(`📋 ALEPH account: ${newVoices.length} voices total (pre-migration)`);

  const newVoiceIds = new Set(newVoices.map((v) => v.voice_id));
  const results: Result[] = [];

  const oldProfessional = oldVoices.filter((v) => v.category === "professional");
  const oldPremade = oldVoices.filter((v) => v.category === "premade");
  const oldGenerated = oldVoices.filter((v) => v.category === "generated");

  console.log(`\n📊 Breakdown:`);
  console.log(`   premade (system defaults, no migration): ${oldPremade.length}`);
  console.log(`   professional (library-copied): ${oldProfessional.length}`);
  console.log(`   generated (Voice Design, not migratable): ${oldGenerated.length}`);

  for (const v of oldGenerated) {
    results.push({
      kind: "skipped",
      old_voice_id: v.voice_id,
      name: v.name,
      reason: "category=generated (Voice Design — not shareable via API)",
    });
  }

  const toMigrate: ElevenVoice[] = [];
  for (const v of oldProfessional) {
    if (newVoiceIds.has(v.voice_id)) {
      results.push({
        kind: "skipped",
        old_voice_id: v.voice_id,
        name: v.name,
        reason: "already present in ALEPH account (same voice_id)",
      });
      continue;
    }
    const s = v.sharing ?? {};
    if (s.status !== "copied" || !s.public_owner_id || !s.original_voice_id) {
      results.push({
        kind: "skipped",
        old_voice_id: v.voice_id,
        name: v.name,
        reason: `sharing.status=${s.status ?? "none"} (not re-addable)`,
      });
      continue;
    }
    toMigrate.push(v);
  }

  console.log(`\n🎯 Transfer set: ${toMigrate.length} voices will be added to ALEPH`);
  console.log(`   Skips: ${results.filter((r) => r.kind === "skipped").length}`);
  for (const r of results.filter((r) => r.kind === "skipped")) {
    console.log(`   - ${r.old_voice_id} "${r.name}" → ${(r as { reason: string }).reason}`);
  }

  const outPath = `/tmp/elevenlabs-migration-${dryRun ? "dryrun-" : ""}${Date.now()}.json`;

  if (dryRun) {
    console.log(`\n💤 DRY RUN — no API calls will be made. Transfer preview:`);
    for (const v of toMigrate) {
      console.log(
        `   + ${v.voice_id} "${v.name}" (owner ${v.sharing!.public_owner_id!.slice(0, 12)}...)`
      );
    }
    writeSummary(results, outPath, {
      mode: "dry-run",
      old_total: oldVoices.length,
      aleph_total_before: newVoices.length,
      transfer_set: toMigrate.map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        public_owner_id: v.sharing!.public_owner_id,
        original_voice_id: v.sharing!.original_voice_id,
      })),
    });
    console.log(`\n📝 Summary written to ${outPath}`);
    return;
  }

  // Real run: incremental save so a crash leaves us a recovery record.
  const saveProgress = () =>
    writeSummary(results, outPath, {
      mode: "live",
      old_total: oldVoices.length,
      aleph_total_before: newVoices.length,
      in_progress: true,
    });

  console.log(`\n🚀 Adding ${toMigrate.length} voices to ALEPH account...\n`);
  for (let i = 0; i < toMigrate.length; i++) {
    const v = toMigrate[i];
    const ownerId = v.sharing!.public_owner_id!;
    const origId = v.sharing!.original_voice_id!;
    const label = `[${i + 1}/${toMigrate.length}] ${v.voice_id} "${v.name}"`;
    try {
      const resp = await addSharedVoice(NEW_KEY, ownerId, origId, v.name);
      const idChanged = resp.voice_id !== v.voice_id;
      results.push({
        kind: "added",
        old_voice_id: v.voice_id,
        new_voice_id: resp.voice_id,
        name: v.name,
        public_owner_id: ownerId,
      });
      console.log(
        `   ✅ ${label}${idChanged ? ` → new_id=${resp.voice_id}` : " (id preserved)"}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        kind: "failed",
        old_voice_id: v.voice_id,
        name: v.name,
        public_owner_id: ownerId,
        error: msg,
      });
      console.log(`   ❌ ${label} → ${msg}`);
    }
    saveProgress();
    await new Promise((r) => setTimeout(r, 200));
  }

  const added = results.filter((r): r is Extract<Result, { kind: "added" }> => r.kind === "added");
  const changed = added.filter((r) => r.new_voice_id !== r.old_voice_id);

  console.log(`\n📈 Add results: ${added.length} ok, ${results.filter((r) => r.kind === "failed").length} failed`);
  console.log(`🔁 Voice IDs that changed: ${changed.length}`);

  if (changed.length > 0) {
    await rewriteNeon(changed.map((r) => ({ old: r.old_voice_id, new: r.new_voice_id })));
  } else {
    console.log(`✨ All added voices kept their original IDs — no Neon rewrite needed.`);
  }

  writeSummary(results, outPath, {
    mode: "live",
    old_total: oldVoices.length,
    aleph_total_before: newVoices.length,
    in_progress: false,
    id_changes: changed.length,
  });

  console.log(`\n📝 Summary written to ${path.resolve(outPath)}`);
  console.log(`\n✅ Migration complete.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 Fatal:", err);
    process.exit(1);
  });
