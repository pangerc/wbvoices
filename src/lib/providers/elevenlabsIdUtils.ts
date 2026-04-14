/**
 * Strips the catalogue suffix from an ElevenLabs voice id to recover the bare
 * ElevenLabs `voice_id`.
 *
 * Catalogue ids are synthesized by voiceProviderService to keep each
 * (voice × language × accent) tuple unique. Shapes in the wild:
 *   - `{voice_id}`                          (PVC fallback without verified_languages)
 *   - `{voice_id}-{lang}`                   (legacy, pre multi-accent fix)
 *   - `{voice_id}-{lang}-{REGION}`          (legacy uppercase region, e.g. `-es-MX`)
 *   - `{voice_id}-{lang}-{accent_slug}`     (current, e.g. `-es-mexican`, `-es-mx`)
 *
 * ElevenLabs `voice_id`s are 20 alphanumeric characters with no hyphens, so
 * stripping at the first hyphen is safe and unambiguous. New code should
 * prefer reading `externalId` off a UnifiedVoice; this helper exists for the
 * legacy paths that only receive a string id (TTS provider entrypoint, admin
 * test route, legacy persisted ads).
 */
export function stripElevenLabsIdSuffix(id: string): string {
  const hyphenIndex = id.indexOf("-");
  return hyphenIndex === -1 ? id : id.substring(0, hyphenIndex);
}
