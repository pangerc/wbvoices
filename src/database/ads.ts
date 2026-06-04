import { adMetadataMatchQuery } from "@/common/search";
import { safeJSONParse } from "@/core/safe-json-parse";
import { getRedisV3 } from "@/lib/redis-v3";
import { Language } from "@/types";
import { AdMetadata, StreamType, VersionId } from "@/types/versions";
import { Redis } from "@upstash/redis";
import { Base, FuzzyResult, Options, QueryResult } from "./base";

// User ads index key pattern
const USER_ADS_KEY = (ownerEmail: string) => `ads:by_user:${ownerEmail}`;

// All ads index (for admin listing)
const ALL_ADS_KEY = "ads:all";

/**
 * Generate Redis keys for version stream operations
 */
const AD_KEYS = {
  /** Ad metadata: ad:{adId}:meta */
  meta: (adId: string) => `ad:${adId}:meta`,

  /** Version list: ad:{adId}:voices:versions */
  versions: (adId: string, streamType: StreamType) =>
    `ad:${adId}:${streamType}:versions`,

  /** Active version pointer: ad:{adId}:voices:active */
  active: (adId: string, streamType: StreamType) =>
    `ad:${adId}:${streamType}:active`,

  /** Specific version: ad:{adId}:voices:v:v3 */
  version: (adId: string, streamType: StreamType, versionId: VersionId) =>
    `ad:${adId}:${streamType}:v:${versionId}`,

  /**
   * Legacy mixer snapshot: ad:{adId}:mixer
   *
   * Pre-stage-6 single-key blob storing the full MixerState. Retained until
   * each ad is bootstrapped into the mixer version stream, at which point
   * this key is deleted. New reads/writes should route through the mixer
   * version stream via the generic helpers (`AD_KEYS.versions(adId, "mixer")`
   * etc.).
   */
  mixer: (adId: string) => `ad:${adId}:mixer`,

  /** Preview data: ad:{adId}:preview */
  preview: (adId: string) => `ad:${adId}:preview`,

  /** Version counter for atomic ID generation: ad:{adId}:voices:counter */
  counter: (adId: string, streamType: StreamType) =>
    `ad:${adId}:${streamType}:counter`,
} as const;

export type AdMetadataQuery = {
  name?: string;
  client?: string;
  market?: string;
  language?: Language;
};

export class Ads extends Base {
  protected constructor(private readonly redis: Redis) {
    super();
  }

  static instance: Ads;
  static getInstance(): Ads {
    if (!this.instance) {
      this.instance = new Ads(getRedisV3());
    }

    return this.instance;
  }

  public async getAdMetadata(adId: string): Promise<AdMetadata | void> {
    const data = await this.redis.get(AD_KEYS.meta(adId));

    if (data) {
      return safeJSONParse<AdMetadata>(data);
    }

    return;
  }

  public async *getAdsMetadataByEmail({
    email,
    query,
    opts,
  }: {
    email?: string;
    query?: AdMetadataQuery;
    opts?: Options;
  }): AsyncGenerator<QueryResult<AdMetadata>, void, unknown> {
    // Regular user: show only their ads
    // Or admin: show all
    const key = email ? USER_ADS_KEY(email) : ALL_ADS_KEY;

    const ids = (await this.redis.get<string[]>(key)) || [];

    let skipped = 0;
    let taken = 0;

    const metas: Array<{ id: string; meta: AdMetadata }> = [];

    // First we need to take all the metas because we need to sort them later
    // And we do not know who is first / last or in the middle
    for (const id of ids) {
      // meta can be null, so we default to undefined
      // either we have something, or we do not
      const meta = await this.getAdMetadata(id);

      if (!meta) {
        // FIXME: There are ads in the ad lists that do not exist anymore
        // Or they have partially exist in an invalid state
        console.error("❌ Ad", id, "does not have meta field");
        continue;
      }

      metas.push({ id, meta });
    }

    // We need to sort them in descending order
    // Last modified, first
    metas.sort((a, b) => b.meta.lastModified - a.meta.lastModified);

    for (const { id, meta } of metas) {
      if (opts?.signal?.aborted) {
        return;
      }

      if (typeof opts?.take === "number" && taken === opts.take) {
        return;
      }

      if (query) {
        const match = adMetadataMatchQuery(meta, query);

        if (match === true || match !== false) {
          if (opts?.skip && skipped < opts.skip) {
            skipped++;
            continue;
          }

          let fuzzy: FuzzyResult | undefined;

          if (match !== true) {
            fuzzy = match;
          }

          taken++;
          yield {
            id,
            meta,
            fuzzy,
          };
        }
      }
    }

    return;
  }
}
