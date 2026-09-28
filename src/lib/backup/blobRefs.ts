/**
 * Blob URL extraction (AAC-185, P1-3).
 *
 * Blob bytes (audio + images) are referenced by URL *inside* version/preview
 * records (plan.md §3.3). The archive orchestrator walks emitted records,
 * collects the referenced URLs (strings only — never the bytes), dedups, then
 * streams the blob entries at the end (§P1-5). Keeping only URLs in memory
 * keeps the exporter constant-memory.
 */

import type { BackupRecord } from "./types";

/**
 * Pull embedded blob URLs from a single record. Uses the known blob-bearing
 * fields per kind (§3.3) rather than a blind deep-scan, so we don't accidentally
 * treat arbitrary strings as blobs.
 */
export function extractBlobUrls(record: BackupRecord): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0) urls.push(v);
  };

  if (record.kind === "version") {
    const d = record.data as {
      // voices
      voiceTracks?: Array<{ generatedUrl?: string }>;
      generatedUrls?: string[]; // deprecated voices field + sfx
      // music / mixer
      generatedUrl?: string;
      mixedAudioUrl?: string;
    } | null;
    if (d) {
      d.voiceTracks?.forEach((t) => push(t?.generatedUrl));
      d.generatedUrls?.forEach(push);
      push(d.generatedUrl);
      push(d.mixedAudioUrl);
    }
  } else if (record.kind === "preview") {
    const d = record.data as { logoUrl?: string; visualUrl?: string } | null;
    if (d) {
      push(d.logoUrl);
      push(d.visualUrl);
    }
  }

  return urls;
}

/**
 * Rewrite embedded blob URLs in a record using `originalUrl → newUrl` (P3-3).
 * Returns a new record; a URL absent from the map is left as-is (logged upstream).
 */
export function rewriteBlobUrls(
  record: BackupRecord,
  map: Map<string, string>,
): BackupRecord {
  if (map.size === 0) return record;
  const remap = (v: unknown): unknown =>
    typeof v === "string" && map.has(v) ? map.get(v)! : v;

  if (record.kind === "version") {
    const d = { ...(record.data as Record<string, unknown>) };
    if (Array.isArray(d.voiceTracks)) {
      d.voiceTracks = (d.voiceTracks as Array<Record<string, unknown>>).map((t) =>
        t && typeof t === "object" ? { ...t, generatedUrl: remap(t.generatedUrl) } : t,
      );
    }
    if (Array.isArray(d.generatedUrls)) {
      d.generatedUrls = (d.generatedUrls as unknown[]).map(remap);
    }
    if (d.generatedUrl != null) d.generatedUrl = remap(d.generatedUrl);
    if (d.mixedAudioUrl != null) d.mixedAudioUrl = remap(d.mixedAudioUrl);
    return { ...record, data: d };
  }
  if (record.kind === "preview") {
    const d = { ...(record.data as Record<string, unknown>) };
    if (d.logoUrl != null) d.logoUrl = remap(d.logoUrl);
    if (d.visualUrl != null) d.visualUrl = remap(d.visualUrl);
    return { ...record, data: d };
  }
  return record;
}

/** Best-effort file extension from a content-type or URL, defaulting to `bin`. */
export function blobExtension(
  url: string,
  contentType: string | null,
): string {
  const byType: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase();
    if (byType[base]) return byType[base];
  }
  const m = url.split("?")[0].match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}
