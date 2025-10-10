import { db } from '@/lib/db';
import { voiceMetadata, voiceBlacklist, type VoiceBlacklist } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { Language } from '@/types';

/**
 * Service for managing voice metadata and blacklist
 * Provides overlay data for the ephemeral Redis voice cache
 *
 * BLACKLIST LOGIC: Voices are visible by default.
 * Only voices present in the blacklist table are hidden.
 */
export class VoiceMetadataService {
  /**
   * Get all blacklist entries for a voice
   */
  async getBlacklistEntries(voiceKey: string): Promise<VoiceBlacklist[]> {
    return await db
      .select()
      .from(voiceBlacklist)
      .where(eq(voiceBlacklist.voiceKey, voiceKey));
  }

  /**
   * Bulk fetch blacklist entries for multiple voices (for performance)
   * Returns a map of voiceKey -> blacklist entries[]
   */
  async bulkGetBlacklisted(voiceKeys: string[]): Promise<Record<string, VoiceBlacklist[]>> {
    if (voiceKeys.length === 0) return {};

    const results = await db
      .select()
      .from(voiceBlacklist)
      .where(inArray(voiceBlacklist.voiceKey, voiceKeys));

    // Group by voiceKey
    const grouped: Record<string, VoiceBlacklist[]> = {};
    for (const entry of results) {
      if (!grouped[entry.voiceKey]) {
        grouped[entry.voiceKey] = [];
      }
      grouped[entry.voiceKey].push(entry);
    }

    return grouped;
  }

  /**
   * Check if a voice is blacklisted for a specific language/accent combination
   */
  async isBlacklisted(voiceKey: string, language: Language, accent: string): Promise<boolean> {
    const result = await db
      .select()
      .from(voiceBlacklist)
      .where(
        and(
          eq(voiceBlacklist.voiceKey, voiceKey),
          eq(voiceBlacklist.language, language),
          eq(voiceBlacklist.accent, accent)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Add a voice to the blacklist for a specific language/accent combination
   */
  async addToBlacklist(
    voiceKey: string,
    language: Language,
    accent: string,
    reason?: string
  ): Promise<void> {
    await db
      .insert(voiceBlacklist)
      .values({
        voiceKey,
        language,
        accent,
        reason,
      })
      .onConflictDoUpdate({
        target: [voiceBlacklist.voiceKey, voiceBlacklist.language, voiceBlacklist.accent],
        set: {
          reason,
          updatedAt: new Date(),
        },
      });

    console.log(`🚫 Blacklisted voice ${voiceKey} for ${language}/${accent}`);
  }

  /**
   * Remove a voice from the blacklist (make it visible again)
   */
  async removeFromBlacklist(voiceKey: string, language: Language, accent: string): Promise<void> {
    await db
      .delete(voiceBlacklist)
      .where(
        and(
          eq(voiceBlacklist.voiceKey, voiceKey),
          eq(voiceBlacklist.language, language),
          eq(voiceBlacklist.accent, accent)
        )
      );

    console.log(`✅ Removed ${voiceKey} from blacklist for ${language}/${accent}`);
  }

  /**
   * Get all blacklisted voices for a specific language/accent combination
   * Useful for admin UI
   */
  async getBlacklistedVoices(
    language: Language,
    accent: string
  ): Promise<VoiceBlacklist[]> {
    return await db
      .select()
      .from(voiceBlacklist)
      .where(
        and(
          eq(voiceBlacklist.language, language),
          eq(voiceBlacklist.accent, accent)
        )
      );
  }

  /**
   * Batch blacklist multiple voices for a language/accent combination
   */
  async batchBlacklist(
    voiceKeys: string[],
    language: Language,
    accent: string,
    reason?: string
  ): Promise<void> {
    if (voiceKeys.length === 0) return;

    const values = voiceKeys.map((voiceKey) => ({
      voiceKey,
      language,
      accent,
      reason,
    }));

    await db
      .insert(voiceBlacklist)
      .values(values)
      .onConflictDoUpdate({
        target: [voiceBlacklist.voiceKey, voiceBlacklist.language, voiceBlacklist.accent],
        set: {
          reason,
          updatedAt: new Date(),
        },
      });

    console.log(`🚫 Batch blacklisted ${voiceKeys.length} voices for ${language}/${accent}`);
  }

  /**
   * Get metadata for a voice (currently just isHidden flag)
   */
  async getMetadata(voiceKey: string) {
    const result = await db
      .select()
      .from(voiceMetadata)
      .where(eq(voiceMetadata.voiceKey, voiceKey))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Hide a voice from the UI globally (across all languages)
   */
  async hideVoice(voiceKey: string): Promise<void> {
    const [provider, voiceId] = voiceKey.split(':');

    await db
      .insert(voiceMetadata)
      .values({
        voiceKey,
        provider,
        voiceId,
        isHidden: 'true',
      })
      .onConflictDoUpdate({
        target: voiceMetadata.voiceKey,
        set: {
          isHidden: 'true',
          updatedAt: new Date(),
        },
      });

    console.log(`🙈 Hidden voice ${voiceKey}`);
  }
}

// Singleton instance
export const voiceMetadataService = new VoiceMetadataService();
