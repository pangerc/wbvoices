/**
 * Voice blacklist key derivation.
 *
 * Blacklist rows in Neon are keyed on the composite `${provider}:${voice.id}`.
 * Before the multi-accent fix, ElevenLabs ids were `{voice_id}-{lang}` (one
 * row per voice × language). After the fix, ids are `{voice_id}-{lang}-{accent}`
 * (one row per voice × language × accent). Production has pre-existing rows
 * in the old shape that must continue to filter correctly; reads must try
 * both shapes. Writes use only the new shape.
 */

type BlacklistLookupVoice = {
  provider: string;
  id: string;
  externalId?: string;
  language: string;
};

/**
 * Returns every voice_key shape under which blacklist rows for this voice
 * might exist. The first entry is the canonical (new) key used for writes;
 * additional entries are legacy shapes checked on read for backward compat.
 */
export function getBlacklistLookupKeys(voice: BlacklistLookupVoice): string[] {
  const newKey = `${voice.provider}:${voice.id}`;

  // Only ElevenLabs had the pre-fix id-collision bug. Non-ElevenLabs
  // providers, and ElevenLabs voices from the non-verified_languages path
  // (where id === externalId), had stable ids — no legacy key needed.
  if (
    voice.provider !== "elevenlabs" ||
    !voice.externalId ||
    voice.id === voice.externalId
  ) {
    return [newKey];
  }

  const shortLang = voice.language.split("-")[0];
  const legacyKey = `${voice.provider}:${voice.externalId}-${shortLang}`;
  return [newKey, legacyKey];
}
