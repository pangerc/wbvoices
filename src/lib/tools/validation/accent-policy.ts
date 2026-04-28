/**
 * Cast-voice accent → lint/weaver enforcement policy.
 *
 * Voice catalogue accents are lowercase strings ("parisian", "american",
 * "chilean", "flemish", ...). Some carry sentinel values ("neutral",
 * "standard") that explicitly mean "no accent worth enforcing." A small
 * tail of Lovo voices carry 2-letter ISO region codes ("al", "bg", "hr")
 * that crept in from regional metadata — these don't render as natural
 * `[strong X accent]` tags and we conservatively skip them too.
 *
 * Returns the lowercase accent name when worth enforcing, otherwise null.
 * The lint never fires when null; the weaver never invents an accent tag
 * when null. False negatives (skipping a real accent) are fine; false
 * positives (rendering nonsense like `[strong al accent]`) are worse.
 */

const SKIP_ACCENT_VALUES = new Set(["neutral", "standard", "default"]);

export function resolveAccentForLint(accent?: string | null): string | null {
  if (!accent) return null;
  const normalized = accent.trim().toLowerCase();
  if (!normalized) return null;
  if (SKIP_ACCENT_VALUES.has(normalized)) return null;
  // Skip 2-letter ISO codes — they are region/language codes that leaked
  // into the accent column for some Lovo voices and don't read as accent
  // names in the [strong X accent] form.
  if (normalized.length <= 3) return null;
  return normalized;
}

/**
 * Canonical opening-stack accent tag form per ElevenLabs docs:
 * `[strong french accent]`. Returns null when no accent should be enforced.
 */
export function canonicalAccentTag(accent?: string | null): string | null {
  const resolved = resolveAccentForLint(accent);
  return resolved ? `[strong ${resolved} accent]` : null;
}
