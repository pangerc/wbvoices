import { db } from "@/lib/db";
import { voiceDescriptions, type VoiceDescription } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Service for managing voice personality descriptions
 * Provides rich descriptions for voices to improve LLM voice selection
 *
 * Descriptions are primarily sourced from web scraping (ElevenLabs website)
 * but can be manually edited/improved over time.
 */
export class VoiceDescriptionService {
  /**
   * Get description for a single voice
   */
  async getDescription(voiceKey: string): Promise<VoiceDescription | null> {
    const result = await db
      .select()
      .from(voiceDescriptions)
      .where(eq(voiceDescriptions.voiceKey, voiceKey))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Bulk fetch descriptions for multiple voices (optimized for performance)
   * Returns a map of voiceKey -> description text
   */
  async bulkGetDescriptions(
    voiceKeys: string[]
  ): Promise<Record<string, string>> {
    if (voiceKeys.length === 0) return {};

    const results = await db
      .select()
      .from(voiceDescriptions)
      .where(inArray(voiceDescriptions.voiceKey, voiceKeys));

    // Convert to simple map
    const descMap: Record<string, string> = {};
    for (const row of results) {
      descMap[row.voiceKey] = row.description;
    }

    return descMap;
  }

  /**
   * Insert or update a voice description
   * Used for initial import and manual editing
   */
  async upsertDescription(
    voiceKey: string,
    description: string,
    source: string = "manual"
  ): Promise<void> {
    await db
      .insert(voiceDescriptions)
      .values({
        voiceKey,
        description,
        descriptionSource: source,
      })
      .onConflictDoUpdate({
        target: voiceDescriptions.voiceKey,
        set: {
          description,
          descriptionSource: source,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Batch import descriptions (for initial import from scraped data)
   */
  async batchUpsert(
    descriptions: Array<{ voiceKey: string; description: string }>,
    source: string = "scraped_2024"
  ): Promise<void> {
    if (descriptions.length === 0) return;

    // Insert in batches of 50 to avoid query size limits
    const batchSize = 50;
    for (let i = 0; i < descriptions.length; i += batchSize) {
      const batch = descriptions.slice(i, i + batchSize);

      const values = batch.map((d) => ({
        voiceKey: d.voiceKey,
        description: d.description,
        descriptionSource: source,
      }));

      await db
        .insert(voiceDescriptions)
        .values(values)
        .onConflictDoUpdate({
          target: voiceDescriptions.voiceKey,
          set: {
            description: sql`EXCLUDED.description`, // Use the incoming row's description
            descriptionSource: source,
            updatedAt: new Date(),
          },
        });
    }

    console.log(`✅ Imported ${descriptions.length} voice descriptions`);
  }

  /**
   * Get statistics about voice descriptions
   * Useful for admin dashboards
   */
  async getStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
  }> {
    const all = await db.select().from(voiceDescriptions);

    const bySource: Record<string, number> = {};
    for (const row of all) {
      bySource[row.descriptionSource] =
        (bySource[row.descriptionSource] || 0) + 1;
    }

    return {
      total: all.length,
      bySource,
    };
  }
}

// Singleton instance
export const voiceDescriptionService = new VoiceDescriptionService();
