import { db as defaultDb } from "@/lib/db";
import { userAssets as userAssetsTable, type UserAsset } from "@/lib/db/schema";
import type { UploadedAudioFormat } from "@/lib/audio-validation";
import { and, desc, eq, ilike } from "drizzle-orm";
import { Base } from "./base";

type Db = typeof defaultDb;

/** A validated sound-effect upload about to be added to its owner's library. */
export type NewSfxAsset = {
  ownerEmail: string;
  /** Public Vercel Blob URL, inside the owner's `userSfxFolder`. */
  path: string;
  filename: string;
  format: UploadedAudioFormat;
  sizeBytes: number;
  durationSeconds: number;
  /** SHA-256 of the stored bytes (`contentHashOf`). */
  contentHash: string;
};

/**
 * The User Assets library: uploads a user can reuse in any ad they own.
 *
 * Every read is scoped to an owner, so one user can never list — and therefore
 * never reuse — another's file.
 */
export class UserAssets extends Base {
  protected constructor(private readonly db: Db) {
    super();
  }

  static instance: UserAssets;
  static getInstance(): UserAssets {
    if (!this.instance) {
      this.instance = new UserAssets(defaultDb);
    }

    return this.instance;
  }

  /**
   * Adds a validated sound effect to its owner's library — unless the owner
   * already has a file with the same bytes, in which case that existing item
   * is returned untouched. Callers tell the two apart by `path`: a different
   * path than the one they recorded means their upload was a duplicate.
   *
   * The unique `(owner, kind, hash)` index decides, so two identical uploads
   * racing each other still end up as one item, and validating the same
   * stored file twice (a retried request) returns the same row.
   */
  public async recordSfx(asset: NewSfxAsset): Promise<UserAsset> {
    const [inserted] = await this.db
      .insert(userAssetsTable)
      .values({ ...asset, kind: "sfx" })
      .onConflictDoNothing({
        target: [
          userAssetsTable.ownerEmail,
          userAssetsTable.kind,
          userAssetsTable.contentHash,
        ],
      })
      .returning();
    if (inserted) return inserted;

    const existing = await this.findByHash(
      asset.ownerEmail,
      "sfx",
      asset.contentHash,
    );
    if (!existing) {
      // The conflicting row vanished between the two statements (deleted).
      throw new Error(`No library item holds hash ${asset.contentHash}`);
    }

    return existing;
  }

  /**
   * Removes one of the owner's sound effects from their library. Only the
   * entry: the stored file stays, since ads that use it reference its URL
   * directly. Resolves false when the owner has no such item.
   */
  public async deleteSfx(ownerEmail: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userAssetsTable)
      .where(
        and(
          eq(userAssetsTable.id, id),
          eq(userAssetsTable.ownerEmail, ownerEmail),
          eq(userAssetsTable.kind, "sfx"),
        ),
      )
      .returning({ id: userAssetsTable.id });

    return deleted.length > 0;
  }

  /** The owner's item of `kind` whose stored bytes hash to `contentHash`. */
  public async findByHash(
    ownerEmail: string,
    kind: string,
    contentHash: string,
  ): Promise<UserAsset | null> {
    const [row] = await this.db
      .select()
      .from(userAssetsTable)
      .where(
        and(
          eq(userAssetsTable.ownerEmail, ownerEmail),
          eq(userAssetsTable.kind, kind),
          eq(userAssetsTable.contentHash, contentHash),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * The owner's newest sound effects, up to `limit`, optionally only those
   * whose filename contains `query` (case-insensitive). `hasMore` says older
   * matches were left out.
   */
  public async listSfx(
    ownerEmail: string,
    { query, limit }: ListSfxOptions,
  ): Promise<ListSfxResult> {
    const search = query?.trim();
    // One extra row tells whether there are more than `limit`.
    const rows = await this.db
      .select()
      .from(userAssetsTable)
      .where(
        and(
          eq(userAssetsTable.ownerEmail, ownerEmail),
          eq(userAssetsTable.kind, "sfx"),
          search
            ? ilike(userAssetsTable.filename, `%${escapeLikePattern(search)}%`)
            : undefined,
        ),
      )
      .orderBy(desc(userAssetsTable.createdAt))
      .limit(limit + 1);

    return { assets: rows.slice(0, limit), hasMore: rows.length > limit };
  }
}

/** What {@link UserAssets.listSfx} lists. */
export type ListSfxOptions = {
  /** Only filenames containing this, ignoring case. Blank lists everything. */
  query?: string;
  /** The most assets to return. */
  limit: number;
};

/** A page of {@link UserAssets.listSfx}. */
export type ListSfxResult = {
  /** Newest first. */
  assets: UserAsset[];
  /** Older matches exist beyond `limit`. */
  hasMore: boolean;
};

/**
 * Escapes `LIKE` wildcards so `text` matches literally: a search for "100%"
 * finds "100%" rather than everything starting with "100".
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export const userAssets = UserAssets.getInstance();
