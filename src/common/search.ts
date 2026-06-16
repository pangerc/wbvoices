import { AdMetadataQuery } from "@/database/ads";
import { FuzzyResult } from "@/database/base";
import { AdMetadata } from "@/types/versions";
import fuzzysort from "fuzzysort";

export function adMetadataMatchQuery(
  meta: AdMetadata,
  query: AdMetadataQuery,
): boolean | FuzzyResult {
  if (
    query.client &&
    query.client.length > 0 &&
    meta.brief.brand?.name !== query.client
  ) {
    return false;
  }

  if (
    query.market &&
    query.market.length > 0 &&
    meta?.brief.selectedRegion !== query.market
  ) {
    return false;
  }

  if (
    query.language &&
    query.language.length > 0 &&
    meta?.brief.selectedLanguage !== query.language
  ) {
    return false;
  }

  if (query.status && query.status.length > 0) {
    // Projects with no explicit status are in "Exploration Mode" — treat a
    // missing/empty projectStatus as "exploration" so the filter matches them.
    const status = meta?.brief.projectStatus ?? "exploration";
    if (status !== query.status) {
      return false;
    }
  }

  if (query.name && query.name.length > 0) {
    if (!meta) {
      // If there is no meta to search in, we pass it
      return false;
    }

    const item = fuzzysort.single(query.name, meta.name);

    if (item && item.score > 0.5) {
      return {
        score: item.score,
        indexes: item.indexes,
      };
    }

    // We continue if we do not find the item
    // We also continue after we yield, to not send the item twice
    return false;
  }

  return true;
}
