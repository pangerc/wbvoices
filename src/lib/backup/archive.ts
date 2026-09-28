/**
 * Backup archive orchestrator — the export engine (AAC-185, P1-5).
 *
 * Produces a `.tar.gz` `ReadableStream<Uint8Array>`:
 *
 *   manifest.json          # format/scope/models/blobStrategy/createdAt/region
 *   records/{seq}.ndjson    # record batches (batchSize), one JSON per line
 *   blobs/{sha256(url)}.ext # embedded blob bytes (blobStrategy = "embed")
 *   blobs/index.ndjson      # blob metadata (sha256, originalUrl, type, size)
 *
 * Constant memory + backpressure: records are produced one at a time by the
 * model generators (which await their Redis/PG reads), batched into small
 * buffers, and blob bytes are streamed straight into the tar from `fetch` —
 * never fully buffered (unless the source omits content-length; see fallback).
 * The whole pipeline is pulled by the consumer through Web Streams, so a slow
 * reader throttles production (the destination-speed requirement, §6).
 *
 * Design choices (see `p1-tasks.md` §P1-5): records are chunked into numbered
 * parts (tar needs per-entry size upfront; this is also the cursor addressing
 * R-7 wants); blob filenames are `sha256(url)` (no buffering-to-hash); the
 * manifest carries no precomputed counts (import recomputes).
 */

import { blobExtension, extractBlobUrls } from "./blobRefs";
import { activeModels } from "./models";
import { resolveScopePlan } from "./scope";
import {
  asyncIterableToStream,
  gzipStream,
  packTar,
  type TarEntry,
} from "./tar";
import {
  FORMAT_VERSION,
  type BlobIndexEntry,
  type ExportConfig,
  type ExportContext,
  type Manifest,
} from "./types";

const DEFAULT_BATCH_SIZE = 50;
const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ndjsonBytes(lines: string[]): Uint8Array {
  return encoder.encode(lines.join("\n") + "\n");
}

/** Build the ordered stream of tar entries for a run. */
async function* archiveEntries(
  config: ExportConfig,
  ctx: ExportContext,
): AsyncGenerator<TarEntry> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const models = activeModels(config, ctx);

  // 1) manifest.json (first entry so import can validate before reading records).
  const manifest: Manifest = {
    formatVersion: FORMAT_VERSION,
    createdAt: ctx.now.toISOString(),
    sourceRegion: ctx.sourceRegion,
    scope: config.scope,
    models: models.map((m) => m.kind),
    blobStrategy: config.blobStrategy,
    appVersion: ctx.appVersion ?? null,
  };
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
  yield { name: "manifest.json", size: manifestBytes.byteLength, body: manifestBytes };

  // 2) record batches, collecting referenced blob URLs as we go.
  const blobUrls = new Set<string>();
  let seq = 0;
  let batch: string[] = [];

  const flush = function* (): Generator<TarEntry> {
    if (!batch.length) return;
    seq += 1;
    const body = ndjsonBytes(batch);
    const name = `records/${String(seq).padStart(8, "0")}.ndjson`;
    batch = [];
    yield { name, size: body.byteLength, body };
  };

  for (const model of models) {
    for await (const record of model.export(config, ctx)) {
      if (config.blobStrategy === "embed") {
        for (const url of extractBlobUrls(record)) blobUrls.add(url);
      }
      batch.push(JSON.stringify(record));
      if (batch.length >= batchSize) yield* flush();
    }
  }
  yield* flush();

  // 3) embedded blobs + blobs/index.ndjson.
  if (config.blobStrategy === "embed" && blobUrls.size > 0) {
    const index: BlobIndexEntry[] = [];
    for (const url of blobUrls) {
      const sha = await sha256Hex(url);
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) {
          console.warn(`[backup] blob fetch failed (${res.status}): ${url}`);
          continue;
        }
        const contentType = res.headers.get("content-type");
        const ext = blobExtension(url, contentType);
        const file = `blobs/${sha}.${ext}`;
        const lenHeader = res.headers.get("content-length");

        if (lenHeader != null && Number.isFinite(Number(lenHeader))) {
          const size = Number(lenHeader);
          yield { name: file, size, body: streamBody(res.body) };
          index.push({ sha256: sha, file, originalUrl: url, contentType, size });
        } else {
          // Fallback: source omitted content-length → buffer to learn the size.
          const bytes = new Uint8Array(await res.arrayBuffer());
          yield { name: file, size: bytes.byteLength, body: bytes };
          index.push({
            sha256: sha,
            file,
            originalUrl: url,
            contentType,
            size: bytes.byteLength,
          });
        }
      } catch (err) {
        console.warn(`[backup] blob fetch error for ${url}:`, err);
      }
    }

    if (index.length) {
      const body = ndjsonBytes(index.map((e) => JSON.stringify(e)));
      yield { name: "blobs/index.ndjson", size: body.byteLength, body };
    }
  }
}

async function* streamBody(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Build the export archive as a gzip'd tar `ReadableStream`. Resolves the
 * concrete scope plan first, then streams manifest → records → blobs.
 */
export async function createBackupArchiveStream(
  config: ExportConfig,
  ctx: Omit<ExportContext, "scopePlan">,
): Promise<ReadableStream<Uint8Array>> {
  const scopePlan = await resolveScopePlan(config);
  const fullCtx: ExportContext = { ...ctx, scopePlan };
  const tarStream = asyncIterableToStream(packTar(archiveEntries(config, fullCtx)));
  return gzipStream(tarStream);
}
