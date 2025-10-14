#!/usr/bin/env tsx

/**
 * Import Voice Descriptions to Neon Database
 *
 * Imports the 125 ElevenLabs voice descriptions extracted from HTML
 * into the voice_descriptions table in PostgreSQL/Neon.
 *
 * Usage:
 *   npx tsx scripts/import-voice-descriptions.ts
 */

import { voiceDescriptionService } from "@/services/voiceDescriptionService";
import descriptions from "../data/voice-descriptions.json";

async function importDescriptions() {
  console.log("📦 Importing voice descriptions to Neon database...\n");

  const entries = Object.entries(descriptions);
  console.log(`📊 Found ${entries.length} descriptions to import\n`);

  // Convert to format expected by batch upsert
  const batch = entries.map(([voiceId, description]) => ({
    voiceKey: `elevenlabs:${voiceId}`,
    description: description as string,
  }));

  try {
    await voiceDescriptionService.batchUpsert(batch, "scraped_elevenlabs_2024");

    console.log("\n✨ Import complete!");
    console.log(`   Imported ${batch.length} voice descriptions`);

    // Get stats
    const stats = await voiceDescriptionService.getStats();
    console.log(`\n📈 Database stats:`);
    console.log(`   Total descriptions: ${stats.total}`);
    console.log(`   By source:`);
    for (const [source, count] of Object.entries(stats.bySource)) {
      console.log(`      ${source}: ${count}`);
    }
  } catch (error) {
    console.error("\n❌ Import failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  importDescriptions()
    .then(() => {
      console.log("\n✅ Done!\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { importDescriptions };
