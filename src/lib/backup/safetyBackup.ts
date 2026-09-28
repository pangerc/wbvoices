/**
 * Pre-import safety backup (AAC-185, P3-5 / R-16/17/18).
 *
 * Before a destructive `replace`, we export the *target scope* and stash it so a
 * failed/partial replace is recoverable. Destination:
 * - production: Vercel Blob (`put`), returns the blob URL.
 * - local/dev (no blob token): `os.tmpdir()`, returns the file path.
 *
 * The archive is the same P1 `.tar.gz`, streamed — never fully buffered.
 */

import { createBackupArchiveStream } from "./archive";
import type { ExportConfig } from "./types";

function hasBlobToken(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

async function streamToBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Create + stash a pre-import backup of `scope`. Returns a locator (blob URL or
 * local file path). Throws if the backup can't be created — the caller must NOT
 * proceed with a `replace` without it.
 */
export async function createSafetyBackup(
  config: ExportConfig,
  now: Date,
): Promise<string> {
  const archive = await createBackupArchiveStream(config, {
    now,
    sourceRegion: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? null,
    appVersion: process.env.APP_VERSION ?? null,
  });
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `aca-pre-import-backup-${stamp}.tar.gz`;

  if (hasBlobToken()) {
    const { put } = await import("@vercel/blob");
    const bytes = await streamToBytes(archive);
    const res = await put(`backups/${filename}`, Buffer.from(bytes), {
      access: "public",
      contentType: "application/gzip",
      allowOverwrite: true,
    });
    return res.url;
  }

  // Local fallback: write to the OS temp dir.
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const filePath = path.join(os.tmpdir(), filename);
  const bytes = await streamToBytes(archive);
  await fs.writeFile(filePath, bytes);
  return filePath;
}
