/**
 * Import engine (AAC-185, P3). Consumes a `.tar.gz` produced by the export
 * engine and applies it under a chosen conflict strategy, with the `replace`
 * guardrails (dry-run, typed confirm, pre-import backup — R-16/17/18).
 *
 * Flow: gunzip → parse tar entries in order → validate manifest → buffer records
 * (JSON only) + upload blobs one at a time (apply mode) → rewrite URLs → wipe
 * target scope (replace) → write records in importOrder → rebuild indexes.
 */

import { rewriteBlobUrls } from "./blobRefs";
import {
  countTargetScope,
  rebuildIndexes,
  wipeScope,
  writeRecord,
  type IndexAccumulator,
} from "./importers";
import { REGISTRY } from "./models";
import { resolveScopePlan } from "./scope";
import { gunzipStream, parseTarStream } from "./tar";
import {
  FORMAT_VERSION,
  type BackupRecord,
  type BlobIndexEntry,
  type ExportConfig,
  type ImportConfig,
  type ImportPlan,
  type ImportResult,
  type Manifest,
} from "./types";

export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

const ORDER = new Map(REGISTRY.map((m) => [m.kind as string, m.importOrder]));
const dec = new TextDecoder();

type ParsedArchive = {
  manifest: Manifest;
  records: BackupRecord[];
  /** originalUrl → newUrl (populated only in apply mode after blob upload). */
  urlMap: Map<string, string>;
  blobCount: number;
};

/** Read + classify all archive entries. Uploads blobs when `apply` is true. */
async function parseArchive(
  stream: ReadableStream<Uint8Array>,
  apply: boolean,
): Promise<ParsedArchive> {
  let manifest: Manifest | null = null;
  const records: BackupRecord[] = [];
  const fileToUrl = new Map<string, string>(); // basename → newUrl (uploaded)
  const indexByFile = new Map<string, string>(); // basename → originalUrl
  let blobCount = 0;

  const basename = (name: string) => name.split("/").pop() ?? name;

  for await (const entry of parseTarStream(gunzipStream(stream))) {
    if (entry.name === "manifest.json") {
      manifest = JSON.parse(dec.decode(entry.data)) as Manifest;
      if (manifest.formatVersion !== FORMAT_VERSION) {
        throw new ImportError(
          `Unsupported archive format ${manifest.formatVersion} (expected ${FORMAT_VERSION})`,
          "FORMAT_MISMATCH",
        );
      }
    } else if (entry.name.startsWith("records/")) {
      const text = dec.decode(entry.data).trim();
      if (!text) continue;
      for (const line of text.split("\n")) {
        if (line.trim()) records.push(JSON.parse(line) as BackupRecord);
      }
    } else if (entry.name === "blobs/index.ndjson") {
      const text = dec.decode(entry.data).trim();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as BlobIndexEntry;
        indexByFile.set(basename(e.file), e.originalUrl);
      }
    } else if (entry.name.startsWith("blobs/")) {
      blobCount++;
      if (apply) {
        const { put } = await import("@vercel/blob");
        // Blob filenames are content-addressed (sha256 of the source URL), so
        // the same name always carries the same bytes. Allow overwrite so import
        // is idempotent — re-importing an archive, a `replace` after a prior
        // `merge`, or resuming a partial import must not fail with Vercel Blob's
        // "This blob already exists".
        const res = await put(
          `imported/${basename(entry.name)}`,
          Buffer.from(entry.data),
          { access: "public", allowOverwrite: true },
        );
        fileToUrl.set(basename(entry.name), res.url);
      }
    }
  }

  if (!manifest) {
    throw new ImportError("Archive is missing manifest.json", "NO_MANIFEST");
  }

  // originalUrl → newUrl (join the two blob maps by filename).
  const urlMap = new Map<string, string>();
  for (const [file, originalUrl] of indexByFile) {
    const newUrl = fileToUrl.get(file);
    if (newUrl) urlMap.set(originalUrl, newUrl);
  }

  return { manifest, records, urlMap, blobCount };
}

function scopeDescription(manifest: Manifest): string {
  const s = manifest.scope;
  if (s.type === "complete") return "all data";
  if (s.type === "per-user") return `${s.emails.length} user(s)`;
  return `${s.adIds.length} ad(s)`;
}

function confirmPhraseFor(manifest: Manifest): string {
  return `replace ${scopeDescription(manifest)}`;
}

function countByKind(records: BackupRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

/**
 * Dry-run: parse + validate, count incoming writes and (for replace) the target
 * records a wipe would delete. No writes, no blob uploads.
 */
export async function dryRunImport(
  stream: ReadableStream<Uint8Array>,
): Promise<ImportPlan> {
  const { manifest, records, blobCount } = await parseArchive(stream, false);

  const presentKinds = new Set(records.map((r) => r.kind));
  const targetPlan = await resolveScopePlan(scopeToConfig(manifest));
  const deletes = await countTargetScope(targetPlan, presentKinds);

  return {
    manifest,
    writes: countByKind(records),
    deletes,
    blobCount,
    confirmPhrase: confirmPhraseFor(manifest),
  };
}

/** Turn a manifest's scope into an ExportConfig for destination scope resolution. */
function scopeToConfig(manifest: Manifest): ExportConfig {
  return { scope: manifest.scope, blobStrategy: "embed" };
}

/**
 * Apply the archive. `replace` wipes the target scope first (after a pre-import
 * backup taken by the caller) and requires a matching typed confirmation.
 */
export async function applyImport(
  stream: ReadableStream<Uint8Array>,
  config: ImportConfig,
  onPreImportBackup?: (targetConfig: ExportConfig) => Promise<string>,
): Promise<ImportResult> {
  if (config.conflictStrategy === "remap") {
    throw new ImportError(
      "The 'remap' strategy is not supported yet",
      "REMAP_UNSUPPORTED",
    );
  }

  const { manifest, records, urlMap, blobCount } = await parseArchive(
    stream,
    true,
  );
  const presentKinds = new Set(records.map((r) => r.kind));

  let safetyBackup: string | null = null;

  if (config.conflictStrategy === "replace") {
    const expected = confirmPhraseFor(manifest);
    if ((config.confirm ?? "").trim().toLowerCase() !== expected.toLowerCase()) {
      throw new ImportError(
        `Type "${expected}" to confirm the replace`,
        "CONFIRM_REQUIRED",
      );
    }
    const targetConfig = scopeToConfig(manifest);
    // Pre-import safety backup BEFORE wiping (R-16/17/18).
    if (onPreImportBackup) {
      safetyBackup = await onPreImportBackup(targetConfig);
    }
    const targetPlan = await resolveScopePlan(targetConfig);
    await wipeScope(targetPlan, presentKinds);
  }

  // Rewrite blob URLs, then write records in importOrder.
  const ordered = [...records].sort(
    (a, b) => (ORDER.get(a.kind) ?? 999) - (ORDER.get(b.kind) ?? 999),
  );
  const indexAcc: IndexAccumulator = new Map();
  const written: Record<string, number> = {};
  for (const record of ordered) {
    const rewritten = rewriteBlobUrls(record, urlMap);
    await writeRecord(rewritten, indexAcc);
    written[record.kind] = (written[record.kind] ?? 0) + 1;
  }

  await rebuildIndexes(indexAcc);

  return {
    applied: true,
    strategy: config.conflictStrategy,
    written,
    blobsUploaded: blobCount,
    safetyBackup,
  };
}
