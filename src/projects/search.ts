import { Language } from "@/types";
import { AdMetadata } from "@/types/versions";
import Fuse from "fuse.js";

function fuzzy(list: SearchableAd[], text: string): SearchableAd[] {
  const fuse = new Fuse(list, {
    keys: ["meta.name"],
    includeScore: true,
  });

  let almost_zero_idx = -1;

  const result = fuse
    .search(text)
    .sort((a, b) => {
      if (!a.score || !b.score) {
        throw new Error("Fuse must includeScore: true");
      }

      return a.score > b.score ? 1 : -1;
    })
    .map((result, idx) => {
      if (!result.score) {
        throw new Error("Fuse must includeScore: true");
      }

      // NOTE: Extreme confidence that this is the correct result
      if (result.score < 0.001) {
        almost_zero_idx = idx;
      }

      return result.item;
    });

  if (almost_zero_idx !== -1) {
    return [result[almost_zero_idx]];
  }

  return result;
}

export type SearchableAd = { adId: string; meta: AdMetadata };

export type AdSearch = {
  name?: string;
  client?: string;
  market?: string;
  language?: Language;
} & (
  | {
      skip: number;
      take: number;
    }
  | { showAll: true }
);

export function searchAdList(
  list: SearchableAd[],
  search: AdSearch,
): Array<SearchableAd> {
  let result = list;

  if (search.client && search.client.length > 0) {
    result = result.filter(
      (item) => item.meta.brief.brand?.name === search.client,
    );
  }

  if (search.market && search.market.length > 0) {
    result = result.filter(
      (item) => item.meta.brief.selectedRegion === search.market,
    );
  }

  if (search.language && search.language.length > 0) {
    result = result.filter(
      (item) => item.meta.brief.selectedLanguage === search.language,
    );
  }

  // Sort before fuzying
  result.sort((a, b) => b.meta.lastModified - a.meta.lastModified);

  // Most expensive operation is last
  if (search.name && search.name.length > 0) {
    result = fuzzy(result, search.name);
  }

  if ("skip" in search) {
    result = result.slice(search.skip, search.skip + search.take);
  }

  return result;
}
