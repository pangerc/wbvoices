import { BrandRef, ProjectBrief } from "@/types";
import { useMemo } from "react";

// Collapses the three "empty" representations a brief field can take
// (`null`, `undefined`, `""`) into a single canonical value so equality
// checks don't flap when the form layer swaps between them.
const normalizeNullish = (value: unknown): unknown =>
  value === "" || value === null || value === undefined ? undefined : value;

// Equality where `null`, `undefined`, and `""` are all treated as the
// same empty value. Real values still compare strictly.
const nullishEqual = (a: unknown, b: unknown): boolean =>
  normalizeNullish(a) === normalizeNullish(b);

// Equality for `selectedRegion`. In addition to the standard empty set,
// `"all"` is the UI-level sentinel for "no region filter" and is
// considered equivalent to an unset value.
const regionEqual = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => {
  const norm = (v: string | null | undefined) =>
    v === "" || v === null || v === undefined || v === "all" ? undefined : v;

  return norm(a) === norm(b);
};

// Order-sensitive element-wise equality for `referenceUrls`. An empty
// array is treated as equivalent to an absent array so toggling the
// field on/off without adding URLs doesn't register as a change.
const referenceUrlsEqual = (a?: string[], b?: string[]): boolean => {
  const normA = a && a.length > 0 ? a : undefined;
  const normB = b && b.length > 0 ? b : undefined;

  if (normA === normB) return true;
  if (!normA || !normB) return false;
  if (normA.length !== normB.length) return false;

  return normA.every((value, index) => value === normB[index]);
};

// Brand identity equality. Compares only the keys that define the
// brand (`name` and `salesforceAccountId`); the cached
// `salesforceAccountSnapshot` is a descriptive copy and is ignored so
// snapshot refreshes alone don't flag the brief as changed.
const brandEqual = (a?: BrandRef, b?: BrandRef): boolean =>
  nullishEqual(a?.name, b?.name) &&
  nullishEqual(a?.salesforceAccountId, b?.salesforceAccountId);

export function isNotChanged(source: ProjectBrief, changed: ProjectBrief) {
  return (
    nullishEqual(source.clientDescription, changed.clientDescription) &&
    nullishEqual(source.creativeBrief, changed.creativeBrief) &&
    nullishEqual(source.campaignFormat, changed.campaignFormat) &&
    nullishEqual(source.selectedLanguage, changed.selectedLanguage) &&
    nullishEqual(source.selectedProvider, changed.selectedProvider) &&
    regionEqual(source.selectedRegion, changed.selectedRegion) &&
    source.adDuration === changed.adDuration &&
    nullishEqual(source.selectedAccent, changed.selectedAccent) &&
    nullishEqual(source.selectedAiModel, changed.selectedAiModel) &&
    nullishEqual(source.musicProvider, changed.musicProvider) &&
    nullishEqual(source.selectedCTA, changed.selectedCTA) &&
    nullishEqual(source.selectedPacing, changed.selectedPacing) &&
    referenceUrlsEqual(source.referenceUrls, changed.referenceUrls) &&
    nullishEqual(source.forbiddenWords, changed.forbiddenWords) &&
    nullishEqual(source.providedScript, changed.providedScript) &&
    nullishEqual(source.brandVoice, changed.brandVoice) &&
    nullishEqual(source.enrichWithWebSearch, changed.enrichWithWebSearch) &&
    nullishEqual(source.salesforceAccountId, changed.salesforceAccountId) &&
    nullishEqual(source.creativeAngle, changed.creativeAngle) &&
    nullishEqual(source.varianceMode, changed.varianceMode) &&
    nullishEqual(source.selectedTone, changed.selectedTone) &&
    nullishEqual(source.voiceInstructions, changed.voiceInstructions) &&
    brandEqual(source.brand, changed.brand)
  );
}

/**
 * Returns `true` while `changed` is semantically equivalent to
 * `source` — i.e., the user has not meaningfully edited the brief.
 * Used to gate "save" / "regenerate" affordances so they only light up
 * for real edits, not for round-trips through the form (e.g. a select
 * that returns `"all"` instead of the original `null`).
 */
export function useAdBriefNotChanged(
  source: ProjectBrief,
  changed: ProjectBrief,
) {
  return useMemo(() => {
    return isNotChanged(source, changed);
  }, [source, changed]);
}
