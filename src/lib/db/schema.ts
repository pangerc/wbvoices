import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Voice metadata table - stores custom attributes and flags per voice
 */
export const voiceMetadata = pgTable(
  "voice_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voiceKey: text("voice_key").notNull().unique(), // "{provider}:{voiceId}"
    provider: text("provider").notNull(),
    voiceId: text("voice_id").notNull(),

    // Administrative flags
    isHidden: text("is_hidden").notNull().default("false"), // 'true' | 'false'

    // Audit fields
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    voiceKeyIdx: index("voice_key_idx").on(table.voiceKey),
    providerIdx: index("provider_idx").on(table.provider),
  })
);

/**
 * Voice blacklist table - language/accent rejection matrix
 * If a voice is in this table for a language/accent combo, it's hidden from that market
 * Absence = visible (default), Presence = hidden
 */
export const voiceBlacklist = pgTable(
  "voice_blacklist",
  {
    voiceKey: text("voice_key").notNull(), // "{provider}:{voiceId}"

    language: text("language").notNull(),
    accent: text("accent").notNull(),

    reason: text("reason"), // Why this voice is blacklisted for this market

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.voiceKey, table.language, table.accent] }),
    voiceKeyIdx: index("blacklist_voice_key_idx").on(table.voiceKey),
    languageAccentIdx: index("blacklist_language_accent_idx").on(
      table.language,
      table.accent
    ),
  })
);

/**
 * Voice descriptions table - stores rich personality descriptions for voices
 * Primarily sourced from web scraping, can be manually edited
 */
export const voiceDescriptions = pgTable(
  "voice_descriptions",
  {
    voiceKey: text("voice_key").primaryKey(), // "{provider}:{voiceId}"
    description: text("description").notNull(),
    descriptionSource: text("description_source").notNull().default("scraped_2024"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceIdx: index("voice_descriptions_source_idx").on(table.descriptionSource),
  })
);

export type VoiceMetadata = typeof voiceMetadata.$inferSelect;
export type VoiceBlacklist = typeof voiceBlacklist.$inferSelect;
export type VoiceDescription = typeof voiceDescriptions.$inferSelect;
export type InsertVoiceMetadata = typeof voiceMetadata.$inferInsert;
export type InsertVoiceBlacklist = typeof voiceBlacklist.$inferInsert;
export type InsertVoiceDescription = typeof voiceDescriptions.$inferInsert;
