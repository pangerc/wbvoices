import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupModel, BackupRecord } from "../types";

// Mock the data-access layers so the orchestrator is tested without DB/Redis.
vi.mock("../scope", () => ({
  resolveScopePlan: vi.fn(async () => ({
    adIds: ["ad1"],
    emails: ["u@x.com"],
    includeGlobalReference: true,
    includeServerSettings: true,
  })),
}));

const BLOB_URL = "https://blob.example/audio/track-1.mp3";

function model(kind: BackupModel["kind"], records: BackupRecord[]): BackupModel {
  return {
    kind,
    scope: "per-ad",
    importOrder: 40,
    appliesTo: () => true,
    async *export() {
      for (const r of records) yield r;
    },
  };
}

vi.mock("../models", () => ({
  activeModels: vi.fn(() => [
    model("ad-meta", [{ kind: "ad-meta", id: "ad1", data: { name: "Ad One" } }]),
    model("version", [
      {
        kind: "version",
        id: "ad1:voices:v1",
        data: { voiceTracks: [{ generatedUrl: BLOB_URL }] },
        meta: { adId: "ad1", stream: "voices", versionId: "v1", type: "data" },
      },
    ]),
  ]),
}));

import { createBackupArchiveStream } from "../archive";
import { gunzipStream, parseTar } from "../tar";

const dec = new TextDecoder();

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    }),
  );
});

describe("createBackupArchiveStream", () => {
  it("builds a parseable .tar.gz with manifest, records, and embedded blob", async () => {
    const stream = await createBackupArchiveStream(
      { scope: { type: "complete" }, blobStrategy: "embed", batchSize: 10 },
      { now: new Date("2026-07-01T00:00:00Z"), sourceRegion: "eu", appVersion: "test" },
    );

    const entries = new Map<string, Uint8Array>();
    for await (const e of parseTar(gunzipStream(stream))) entries.set(e.name, e.data);

    // manifest first + well-formed
    const manifest = JSON.parse(dec.decode(entries.get("manifest.json")));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.blobStrategy).toBe("embed");
    expect(manifest.scope).toEqual({ type: "complete" });
    expect(manifest.models).toContain("ad-meta");

    // records batch present, one JSON per line
    const recordFile = [...entries.keys()].find((n) => n.startsWith("records/"));
    expect(recordFile).toBeTruthy();
    const lines = dec
      .decode(entries.get(recordFile!))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].kind).toBe("ad-meta");

    // blob embedded + indexed
    const blobFile = [...entries.keys()].find(
      (n) => n.startsWith("blobs/") && n.endsWith(".mp3"),
    );
    expect(blobFile).toBeTruthy();
    expect(entries.get(blobFile!)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    const index = dec
      .decode(entries.get("blobs/index.ndjson"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(index).toHaveLength(1);
    expect(index[0].originalUrl).toBe(BLOB_URL);
    expect(index[0].contentType).toBe("audio/mpeg");
  });

  it("skips blob embedding when a fetch fails but still emits records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const stream = await createBackupArchiveStream(
      { scope: { type: "complete" }, blobStrategy: "embed" },
      { now: new Date("2026-07-01T00:00:00Z"), sourceRegion: null },
    );
    const names: string[] = [];
    for await (const e of parseTar(gunzipStream(stream))) names.push(e.name);

    expect(names).toContain("manifest.json");
    expect(names.some((n) => n.startsWith("records/"))).toBe(true);
    expect(names.some((n) => n.startsWith("blobs/"))).toBe(false);
  });
});
