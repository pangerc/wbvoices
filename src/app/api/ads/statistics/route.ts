import { toNormalizedAsyncIterator } from "@/core/streams";
import { Ads } from "@/database/ads";
import { requireAuth } from "@/lib/auth-helpers";
import { NextRequest, NextResponse } from "next/server";

/** Categorical ad breakdowns for a single time period (or all-time). */
export type PeriodStats = {
  byMarket: Record<string, number>;
  byLanguage: Record<string, number>;
  byOwner: Record<string, number>;
  total: number;
};

/**
 * Period bucket within a year. `FY` is the full year, `H1`/`H2` the halves,
 * `Q1`..`Q4` the quarters, and `YTD` the year-to-date span (current year only).
 */
export type PeriodKey = "FY" | "H1" | "H2" | "Q1" | "Q2" | "Q3" | "Q4" | "YTD";

export type Statistics = {
  /** All-time totals — the default view. */
  all: PeriodStats;
  /** year -> periodKey -> breakdowns. Only non-empty buckets are present. */
  periods: Record<string, Partial<Record<PeriodKey, PeriodStats>>>;
  /** Years with at least one ad, descending. */
  years: number[];
};

/** An ad shape carrying the metadata fields the tally reads. */
type TalliedAd = {
  meta: {
    brief?: {
      selectedRegion?: string | null;
      selectedLanguage?: string | null;
    } | null;
    owner?: string;
  };
};

/** A fresh, empty period bucket. */
function emptyPeriodStats(): PeriodStats {
  return { byMarket: {}, byLanguage: {}, byOwner: {}, total: 0 };
}

/** Increment `key` in `breakdown`, initialising it on first sight. */
function increment(breakdown: Record<string, number>, key: string) {
  breakdown[key] = (breakdown[key] ?? 0) + 1;
}

/**
 * Add one ad's market/language/owner into a period bucket. Ads without a brief
 * are ignored by the caller, so `brief` is assumed present here.
 */
function tally(bucket: PeriodStats, ad: TalliedAd) {
  bucket.total++;
  increment(bucket.byMarket, ad.meta.brief?.selectedRegion || "without");
  increment(bucket.byLanguage, ad.meta.brief?.selectedLanguage || "without");

  if (ad.meta.owner) {
    increment(bucket.byOwner, ad.meta.owner);
  }
}

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

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;

  const all = emptyPeriodStats();
  const periods: Statistics["periods"] = {};

  /** Get-or-create the bucket for a given year + period key. */
  const bucketFor = (year: number, key: PeriodKey): PeriodStats => {
    const yearBuckets = (periods[year] ??= {});
    return (yearBuckets[key] ??= emptyPeriodStats());
  };

  for (const ad of ads) {
    if (!ad.meta.brief) {
      continue;
    }

    tally(all, ad);

    const createdAt = ad.meta.createdAt;

    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
      continue;
    }

    const created = new Date(createdAt);
    const year = created.getUTCFullYear();
    const quarter = Math.floor(created.getUTCMonth() / 3) + 1;
    const half = quarter <= 2 ? "H1" : "H2";

    tally(bucketFor(year, "FY"), ad);
    tally(bucketFor(year, `Q${quarter}` as PeriodKey), ad);
    tally(bucketFor(year, half), ad);

    if (year === currentYear && quarter <= currentQuarter) {
      tally(bucketFor(year, "YTD"), ad);
    }
  }

  const years = Object.keys(periods)
    .map(Number)
    .sort((a, b) => b - a);

  return NextResponse.json({ all, periods, years } satisfies Statistics);
}
