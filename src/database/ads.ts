import { adMetadataMatchQuery } from "@/common/search";
import { safeJSONParse } from "@/core/safe-json-parse";
import { getRedisV3 } from "@/lib/redis-v3";
import { Language, ProjectStatus } from "@/types";
import { ConversationMessage } from "@/lib/tool-calling";
import { AdMetadata, StreamType, VersionId } from "@/types/versions";
import { Redis } from "@upstash/redis";
import {
  Base,
  FuzzyQueryResult,
  FuzzyResult,
  Options,
  Pagination,
  QueryResult,
} from "./base";

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
  /** Conversation history: ad:{adId}:conversation */
  conversation: (adId: string) => `ad:${adId}:conversation`,
} as const;

export type AdMetadataQuery = {
  name?: string;
  client?: string;
  market?: string;
  language?: Language;
  status?: ProjectStatus;
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

  /**
   * Loads the stored conversation history for a single ad.
   * Returns the parsed messages, or `undefined` when the ad has no
   * conversation stored.
   */
  public async getAdConversation(
    adId: string,
  ): Promise<ConversationMessage[] | void> {
    // Conversations are persisted as a JSON string under a per-ad Redis key.
    const data = await this.redis.get(AD_KEYS.conversation(adId));

    if (data) {
      return safeJSONParse<ConversationMessage[]>(data);
    }

    // No conversation stored for this ad.
    return;
  }

  /**
   * Streams every known ad id, one at a time. Yielding lazily lets callers
   * stop early; an aborted signal ends the stream between yields.
   */
  public async *getAdIds({
    opts,
  }: {
    opts?: Options;
  }): AsyncGenerator<string, void, unknown> {
    // Stored as a single JSON array of ids (empty if unset).
    const ids = (await this.redis.get<string[]>(ALL_ADS_KEY)) || [];

    for (const id of ids) {
      // Stop streaming if the caller disconnected/cancelled.
      if (opts?.signal?.aborted) {
        return;
      }

      yield id;
    }

    return;
  }

  /**
   * Streams each ad's conversation, paired with its id. Yields lazily so
   * callers can stop early; an aborted signal ends the stream between yields.
   * Ads with no stored conversation are skipped.
   */
  public async *getAdConversations({
    opts,
  }: {
    opts?: Options;
  }): AsyncGenerator<QueryResult<ConversationMessage[]>, void, unknown> {
    // Stored as a single JSON array of ids (empty if unset).
    const ids = (await this.redis.get<string[]>(ALL_ADS_KEY)) || [];

    for (const id of ids) {
      // Stop streaming if the caller disconnected/cancelled.
      if (opts?.signal?.aborted) {
        return;
      }

      const document = await this.getAdConversation(id);

      // Skip ids with no conversation. This happens because the id list can
      // contain stale ids: ads that were deleted or only ever partially
      // written in an invalid state.
      if (!document) {
        // FIXME: prune these dangling ids from the list instead of just
        // logging them on every scan.
        console.error("❌ Ad", id, "does not have a conversation");
        continue;
      }

      yield { id, document };
    }

    return;
  }

  public async *getAdsMetadataByEmail({
    email,
    query,
    opts,
    pagination,
  }: {
    email?: string;
    query?: AdMetadataQuery;
    opts?: Options;
    pagination?: Pagination;
  }): AsyncGenerator<FuzzyQueryResult<AdMetadata>, void, unknown> {
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
      if (opts?.signal?.aborted) {
        return;
      }

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

      if (typeof pagination?.take === "number" && taken === pagination.take) {
        return;
      }

      if (query) {
        const match = adMetadataMatchQuery(meta, query);

        if (match === true || match !== false) {
          if (pagination?.skip && skipped < pagination.skip) {
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
