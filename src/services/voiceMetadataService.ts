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
 *
 * TWO-LEVEL BLACKLISTING:
 * - Language-wide: accent = "*" (blacklisted for all accents of that language)
 * - Accent-specific: accent = "parisian" (blacklisted only for that specific accent)
 */
export class VoiceMetadataService {
  /** Wildcard value for language-wide blacklisting */
  private readonly ALL_ACCENTS = '*';
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
   * Add voice to blacklist with scope control (language-wide or accent-specific)
   * @param scope - 'language' for all accents, 'accent' for specific accent
   */
  async addToBlacklistWithScope(
    voiceKey: string,
    language: Language,
    accent: string,
    scope: 'language' | 'accent',
    reason?: string
  ): Promise<void> {
    const targetAccent = scope === 'language' ? this.ALL_ACCENTS : accent;
    const defaultReason = scope === 'language'
      ? `Blacklisted for all ${language} accents`
      : `Blacklisted for ${language}/${accent}`;

    await db
      .insert(voiceBlacklist)
      .values({
        voiceKey,
        language,
        accent: targetAccent,
        reason: reason || defaultReason,
      })
      .onConflictDoUpdate({
        target: [voiceBlacklist.voiceKey, voiceBlacklist.language, voiceBlacklist.accent],
        set: {
          reason: reason || defaultReason,
          updatedAt: new Date(),
        },
      });

    const scopeDesc = scope === 'language' ? `all ${language} accents` : `${language}/${accent}`;
    console.log(`🚫 Blacklisted voice ${voiceKey} for ${scopeDesc}`);
  }

  /**
   * Bulk fetch blacklist entries optimized for filtering
   * Returns enhanced structure with language-wide and accent-specific info
   */
  async bulkGetBlacklistedEnhanced(
    voiceKeys: string[],
    language: Language
  ): Promise<Record<string, { accents: Set<string>; hasLanguageWide: boolean }>> {
    if (voiceKeys.length === 0) return {};

    const results = await db
      .select()
      .from(voiceBlacklist)
      .where(
        and(
          inArray(voiceBlacklist.voiceKey, voiceKeys),
          eq(voiceBlacklist.language, language)
        )
      );

    const grouped: Record<string, { accents: Set<string>; hasLanguageWide: boolean }> = {};

    for (const entry of results) {
      if (!grouped[entry.voiceKey]) {
        grouped[entry.voiceKey] = {
          accents: new Set<string>(),
          hasLanguageWide: false,
        };
      }

      if (entry.accent === this.ALL_ACCENTS) {
        grouped[entry.voiceKey].hasLanguageWide = true;
      } else {
        grouped[entry.voiceKey].accents.add(entry.accent);
      }
    }

    return grouped;
  }

  /**
   * Check if voice is blacklisted with enhanced scope information
   */
  async isBlacklistedEnhanced(
    voiceKey: string,
    language: Language,
    accent: string
  ): Promise<{ isBlacklisted: boolean; scope?: 'language' | 'accent' }> {
    // Check language-wide blacklist first
    const languageWide = await db
      .select()
      .from(voiceBlacklist)
      .where(
        and(
          eq(voiceBlacklist.voiceKey, voiceKey),
          eq(voiceBlacklist.language, language),
          eq(voiceBlacklist.accent, this.ALL_ACCENTS)
        )
      )
      .limit(1);

    if (languageWide.length > 0) {
      return { isBlacklisted: true, scope: 'language' };
    }

    // Check accent-specific blacklist
    const accentSpecific = await db
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

    if (accentSpecific.length > 0) {
      return { isBlacklisted: true, scope: 'accent' };
    }

    return { isBlacklisted: false };
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
