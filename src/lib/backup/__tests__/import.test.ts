import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupRecord } from "../types";

// --- mocks for the data-access layers -------------------------------------
// Hoisted so the vi.mock factory (also hoisted) can safely reference them.
const { written, wipeSpy, writeSpy } = vi.hoisted(() => ({
  written: [] as BackupRecord[],
  wipeSpy: vi.fn(async () => ({ ad: 1 })),
  writeSpy: vi.fn(),
}));

vi.mock("../importers", () => ({
  writeRecord: vi.fn(async (r: BackupRecord) => {
    written.push(r);
    writeSpy(r);
  }),
  wipeScope: wipeSpy,
  rebuildIndexes: vi.fn(async () => {}),
  countTargetScope: vi.fn(async () => ({ "ad-meta": 1, user: 2 })),
}));

vi.mock("../scope", () => ({
  resolveScopePlan: vi.fn(async () => ({
    adIds: ["ad1"],
    emails: [],
    includeGlobalReference: true,
    includeServerSettings: true,
  })),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://new.example/${pathname.split("/").pop()}`,
  })),
}));

import { applyImport, dryRunImport, ImportError } from "../import";
import {
  asyncIterableToStream,
  gzipStream,
  packTar,
  type TarEntry,
} from "../tar";

const enc = new TextEncoder();
const OLD_URL = "https://old.example/voice.mp3";

function buildArchive(): ReadableStream<Uint8Array> {
  const manifest = {
    formatVersion: 1,
    createdAt: "2026-07-02T00:00:00Z",
    sourceRegion: "eu",
    scope: { type: "complete" },
    models: ["ad-meta", "version"],
    blobStrategy: "embed",
  };
  const records = [
    { kind: "ad-meta", id: "ad1", data: { name: "Ad One", owner: "u@x.com" } },
    {
      kind: "version",
      id: "ad1:voices:v1",
      data: { voiceTracks: [{ generatedUrl: OLD_URL }] },
      meta: { adId: "ad1", stream: "voices", versionId: "v1", type: "data" },
    },
  ];
  const blobBytes = new Uint8Array([9, 8, 7]);
  const index = [{ sha256: "abc", file: "blobs/abc.mp3", originalUrl: OLD_URL, contentType: "audio/mpeg", size: 3 }];

  const nd = (arr: unknown[]) => enc.encode(arr.map((x) => JSON.stringify(x)).join("\n") + "\n");
  const mBytes = enc.encode(JSON.stringify(manifest));
  const rBytes = nd(records);
  const iBytes = nd(index);

  const entries: TarEntry[] = [
    { name: "manifest.json", size: mBytes.byteLength, body: mBytes },
    { name: "records/00000001.ndjson", size: rBytes.byteLength, body: rBytes },
    { name: "blobs/abc.mp3", size: blobBytes.byteLength, body: blobBytes },
    { name: "blobs/index.ndjson", size: iBytes.byteLength, body: iBytes },
  ];
  async function* gen() {
    for (const e of entries) yield e;
  }
  return gzipStream(asyncIterableToStream(packTar(gen())));
}

beforeEach(() => {
  written.length = 0;
  wipeSpy.mockClear();
});

describe("import engine", () => {
  it("dry-run reports writes, deletes, blob count, and confirm phrase", async () => {
    const plan = await dryRunImport(buildArchive());
    expect(plan.manifest.formatVersion).toBe(1);
    expect(plan.writes).toEqual({ "ad-meta": 1, version: 1 });
    expect(plan.deletes).toEqual({ "ad-meta": 1, user: 2 });
    expect(plan.blobCount).toBe(1);
    expect(plan.confirmPhrase).toBe("replace all data");
    expect(wipeSpy).not.toHaveBeenCalled(); // dry-run never wipes
  });

  it("merge writes records in importOrder with blob URLs rewritten", async () => {
    const result = await applyImport(buildArchive(), { conflictStrategy: "merge" });
    expect(result.applied).toBe(true);
    expect(result.blobsUploaded).toBe(1);
    // ad-meta (40) before version (50)
    expect(written.map((r) => r.kind)).toEqual(["ad-meta", "version"]);
    const version = written.find((r) => r.kind === "version")!;
    const url = (version.data as { voiceTracks: { generatedUrl: string }[] })
      .voiceTracks[0].generatedUrl;
    expect(url).toBe("https://new.example/abc.mp3");
    expect(wipeSpy).not.toHaveBeenCalled();
  });

  it("replace requires the typed confirmation", async () => {
    await expect(
      applyImport(buildArchive(), { conflictStrategy: "replace" }),
    ).rejects.toThrow(ImportError);
  });

  it("replace wipes after a pre-import backup when confirmed", async () => {
    const backup = vi.fn(async () => "/tmp/pre-import.tar.gz");
    const result = await applyImport(
      buildArchive(),
      { conflictStrategy: "replace", confirm: "replace all data" },
      backup,
    );
    expect(backup).toHaveBeenCalledOnce();
    expect(wipeSpy).toHaveBeenCalledOnce();
    expect(result.safetyBackup).toBe("/tmp/pre-import.tar.gz");
    // backup must be taken BEFORE the wipe
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(
      wipeSpy.mock.invocationCallOrder[0],
    );
  });

  it("rejects remap in v1", async () => {
    await expect(
      applyImport(buildArchive(), { conflictStrategy: "remap" }),
    ).rejects.toThrow(/remap/i);
  });
});
