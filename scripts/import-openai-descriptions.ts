#!/usr/bin/env tsx

/**
 * Import OpenAI Voice Descriptions to Neon Database
 *
 * Imports the 11 OpenAI voice descriptions with vocal range classifications
 * into the voice_descriptions table in PostgreSQL/Neon.
 *
 * Usage:
 *   npx tsx scripts/import-openai-descriptions.ts
 */

import "dotenv/config";
import { voiceDescriptionService } from "@/services/voiceDescriptionService";
import descriptions from "../data/openai-voice-descriptions.json";

async function importOpenAIDescriptions() {
  console.log("📦 Importing OpenAI voice descriptions to Neon database...\n");

  const entries = Object.entries(descriptions);
  console.log(`📊 Found ${entries.length} OpenAI descriptions to import\n`);

  // Convert to format expected by batch upsert
  const batch = entries.map(([voiceId, description]) => ({
    voiceKey: `openai:${voiceId}`,
    description: description as string,
  }));

  try {
    await voiceDescriptionService.batchUpsert(batch, "openai_vocal_ranges_2024");

    console.log("\n✨ Import complete!");
    console.log(`   Imported ${batch.length} OpenAI voice descriptions`);

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
  importOpenAIDescriptions()
    .then(() => {
      console.log("\n✅ Done!\n");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { importOpenAIDescriptions };
