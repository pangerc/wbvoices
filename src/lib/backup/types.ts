/**
 * Backup/export/import types (AAC-185, P1).
 *
 * The archive is a `.tar.gz` of NDJSON records + embedded blob bytes. See
 * `plan.md` §4 (model abstraction), §5 (format), §9 (blobs). Everything here is
 * transport-agnostic — the same shapes drive file export/import and the
 * server-to-server stream.
 */

/** Bumped on any breaking change to the archive layout; import refuses a mismatch. */
export const FORMAT_VERSION = 1 as const;

/** One export/import unit. Order matters on import (see `importOrder`). */
export type ModelKind =
  | "server-settings"
  | "user"
  | "voice-metadata"
  | "voice-blacklist"
  | "voice-description"
  | "suggested-tone"
  | "instruction-template"
  | "ad-meta"
  | "version"
  | "conversation"
  | "preview"
  | "blob";

export type ModelScope = "global" | "per-user" | "per-ad";

/** One NDJSON line in `records/{seq}.ndjson`. `data` is the JSON payload. */
export type BackupRecord = {
  kind: ModelKind;
  /** Stable id within the kind (email, ad id, `${adId}:${stream}:${versionId}`, …). */
  id: string;
  data: unknown;
  /** Optional per-record hints (e.g. which ad a version belongs to). */
  meta?: Record<string, unknown>;
};

/** What to include — chosen at the start of each export/migration (§13.4). */
export type ExportScope =
  | { type: "complete" }
  | {
      type: "per-user";
      emails: string[];
      /** Also include global reference data (tones/templates/voice-meta)? */
      includeGlobalReference: boolean;
    }
  | { type: "per-ad"; adIds: string[] };

export type BlobStrategy = "embed";

export type ExportConfig = {
  scope: ExportScope;
  blobStrategy: BlobStrategy;
  /** Optional subset of model kinds; omitted = all applicable to the scope. */
  models?: ModelKind[];
  /** Records per `records/{seq}.ndjson` part (from `server_settings`). */
  batchSize?: number;
};

/** `manifest.json` — the first tar entry; validated before any records import. */
export type Manifest = {
  formatVersion: typeof FORMAT_VERSION;
  createdAt: string;
  sourceRegion: string | null;
  scope: ExportScope;
  models: ModelKind[];
  blobStrategy: BlobStrategy;
  appVersion?: string | null;
};

/** One line in `blobs/index.ndjson`. Filename = `sha256(url)` (§P1-5 decision). */
export type BlobIndexEntry = {
  sha256: string;
  file: string;
  originalUrl: string;
  contentType: string | null;
  size: number | null;
};

/** Resolved concrete scope — which ads/users are in play — computed once. */
export type ScopePlan = {
  adIds: string[];
  emails: string[];
  /** Whether global reference data (voices/tones/templates) is included. */
  includeGlobalReference: boolean;
  /** Whether the server-settings singleton is included. */
  includeServerSettings: boolean;
};

/** Ambient inputs an exporter needs that aren't in the config. */
export type ExportContext = {
  now: Date;
  sourceRegion: string | null;
  appVersion?: string | null;
  /** Filled by the orchestrator before any exporter runs. */
  scopePlan: ScopePlan;
};

// --- Import (P3) -------------------------------------------------------------

/**
 * How to resolve id/email collisions on import (§8).
 * - `merge`   — upsert; incoming overwrites existing on collision.
 * - `replace` — wipe the target scope first, then write (clean migration).
 * - `remap`   — clone with fresh ids (v1: not yet supported).
 */
export type ConflictStrategy = "merge" | "replace" | "remap";

export type ImportConfig = {
  conflictStrategy: ConflictStrategy;
  /** For `replace`: the admin must type this to confirm the wipe. */
  confirm?: string;
};

/** Counts surfaced by a dry-run so the admin sees the blast radius. */
export type ImportPlan = {
  manifest: Manifest;
  /** Incoming record count per kind. */
  writes: Record<string, number>;
  /** Existing records in the target scope that a `replace` would delete. */
  deletes: Record<string, number>;
  blobCount: number;
  /** The phrase the admin must type to confirm a `replace`. */
  confirmPhrase: string;
};

export type ImportResult = {
  applied: true;
  strategy: ConflictStrategy;
  written: Record<string, number>;
  blobsUploaded: number;
  /** Location of the pre-import safety backup (replace only). */
  safetyBackup: string | null;
};

/** A model's read side. The write side (`import`) lands in P3. */
export interface BackupModel {
  kind: ModelKind;
  scope: ModelScope;
  /** Lower imports first (referential order). */
  importOrder: number;
  /** Whether this model participates given the chosen scope. */
  appliesTo(config: ExportConfig): boolean;
  /** Streaming producer — never buffers the whole model in memory. */
  export(config: ExportConfig, ctx: ExportContext): AsyncIterable<BackupRecord>;
}
