import { ProjectBrief } from "@/types";
import { AdMetadata } from "@/types/versions";
import { describe, expect, it } from "vitest";
import { SearchableAd, searchAdList } from "../search";

const BASE_AD: Pick<AdMetadata, "owner" | "createdAt" | "lastModified"> = {
  owner: "Burebista",
  lastModified: Date.now(),
  createdAt: Date.now(),
};

const ads: SearchableAd[] = [
  {
    adId: "some-ad-1",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Cove",
      brief: {
        selectedLanguage: "ro",
        selectedRegion: "RO",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-2",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Lake",
      brief: {
        selectedLanguage: "en",
        selectedRegion: "GB",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-3",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Mountain",
      brief: {
        selectedLanguage: "fr",
        selectedRegion: "DZ",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-4",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Forest",
      brief: {
        selectedLanguage: "de",
        selectedRegion: "AT",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-5",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Prairie",
      brief: {
        selectedLanguage: "en",
        selectedRegion: "RO",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-6",
    meta: {
      ...BASE_AD,
      name: "Coca Cola by the Cave",
      brief: {
        selectedLanguage: "en",
        selectedRegion: "RO",
        brand: {
          name: "Coca Cola",
        },
      } as ProjectBrief,
    },
  },
  {
    adId: "some-ad-7",
    meta: {
      ...BASE_AD,
      name: "Pesi Cola",
      brief: {
        selectedLanguage: "en",
        selectedRegion: "RO",
        brand: {
          name: "Pepsi",
        },
      } as ProjectBrief,
    },
  },
];

describe("projects", () => {
  describe("searchAdList", () => {
    it("should corectly skip & take", () => {
      const skipped = searchAdList(ads, { skip: 2, take: 1 });
      const showedAll = searchAdList(ads, { showAll: true });

      expect(skipped).length(1);
      expect(skipped[0].meta.name).toStrictEqual(ads[2].meta.name);
      expect(showedAll).length(ads.length);
    });

    it("should correclty search by name", () => {
      expect(
        searchAdList(ads, { name: "pepsi", showAll: true }).length,
      ).toStrictEqual(1);
      expect(
        searchAdList(ads, { name: "kola", showAll: true }).length,
      ).toStrictEqual(ads.length);
    });

    it("should correctly filter by client", () => {
      expect(searchAdList(ads, { client: "Pepsi", showAll: true })).length(1);
    });

    it("should correctly filter by market", () => {
      expect(searchAdList(ads, { market: "RO", showAll: true })).length(4);
      expect(searchAdList(ads, { market: "AT", showAll: true })).length(1);
    });

    it("should correctly filter by language", () => {
      expect(searchAdList(ads, { language: "en", showAll: true })).length(4);
      expect(searchAdList(ads, { language: "fr", showAll: true })).length(1);
    });

    it("should correctly compound filter to get one result", () => {
      const result = searchAdList(ads, {
        name: "Coca Cola by the Prairie",
        client: "Coca Cola",
        market: "RO",
        language: "en",
        showAll: true,
      });
      expect(result).length(1);
      expect(result[0].adId).toBe("some-ad-5");
    });

    it("should correctly compound filter to get multiple results", () => {
      const result = searchAdList(ads, {
        name: "kola",
        client: "Coca Cola",
        market: "RO",
        language: "en",
        skip: 0,
        take: 1,
      });
      expect(result).length(1);
      expect(result[0].adId).toBe("some-ad-6");
    });
  });
});
