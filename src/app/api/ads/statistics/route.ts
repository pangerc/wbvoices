import { toNormalizedAsyncIterator } from "@/core/streams";
import { Ads } from "@/database/ads";
import { requireAuth } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

export type Statistics = Record<
  "byMarket" | "byLanguage" | "byOwner",
  Record<string, number>
> & {
  total: number;
};

export async function GET(request: NextRequest) {
  const { email, role } = await requireAuth();

  const ads = await toNormalizedAsyncIterator(
    Ads.getInstance().getAdsMetadataByEmail({
      email: role === "admin" ? undefined : email,
      query: {},
      opts: {
        signal: request.signal,
      },
    }),
  ).toArray();

  const result = ads.reduce(
    (acc, ad) => {
      if (!ad.meta.brief) {
        return acc;
      }

      acc.total++;

      const market = ad.meta.brief.selectedRegion;

      if (market) {
        if (market in acc.byMarket) {
          acc.byMarket[market]++;
        } else {
          acc.byMarket[market] = 1;
        }
      } else {
        if (acc.byMarket["without"]) {
          acc.byMarket["without"]++;
        } else {
          acc.byMarket["without"] = 1;
        }
      }

      const language = ad.meta.brief.selectedLanguage;

      if (language) {
        if (language in acc.byLanguage) {
          acc.byLanguage[language]++;
        } else {
          acc.byLanguage[language] = 1;
        }
      } else {
        if (acc.byLanguage["without"]) {
          acc.byLanguage["without"]++;
        } else {
          acc.byLanguage["without"] = 1;
        }
      }

      const owner = ad.meta.owner;

      if (owner) {
        if (owner in acc.byOwner) {
          acc.byOwner[owner]++;
        } else {
          acc.byOwner[owner] = 1;
        }
      }

      return acc;
    },
    {
      byMarket: {} as Record<string, number>,
      byOwner: {} as Record<string, number>,
      byLanguage: {} as Record<string, number>,
      total: 0,
    },
  );

  return NextResponse.json(result);
}
