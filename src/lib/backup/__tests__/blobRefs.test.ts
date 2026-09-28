import { describe, expect, it } from "vitest";
import { blobExtension, extractBlobUrls } from "../blobRefs";
import type { BackupRecord } from "../types";

describe("extractBlobUrls", () => {
  it("pulls voice/music/sfx/mixer urls from a version record", () => {
    const rec: BackupRecord = {
      kind: "version",
      id: "ad1:voices:v1",
      data: {
        voiceTracks: [{ generatedUrl: "u://voice" }, {}],
        generatedUrls: ["u://sfx1", "u://sfx2"],
        generatedUrl: "u://music",
        mixedAudioUrl: "u://mix",
      },
    };
    expect(extractBlobUrls(rec).sort()).toEqual(
      ["u://voice", "u://sfx1", "u://sfx2", "u://music", "u://mix"].sort(),
    );
  });

  it("pulls logo/visual from a preview record", () => {
    const rec: BackupRecord = {
      kind: "preview",
      id: "ad1",
      data: { logoUrl: "u://logo", visualUrl: "u://visual" },
    };
    expect(extractBlobUrls(rec).sort()).toEqual(["u://logo", "u://visual"].sort());
  });

  it("ignores non-blob kinds", () => {
    expect(extractBlobUrls({ kind: "user", id: "a", data: { email: "a" } })).toEqual([]);
  });

  it("derives extension from content-type then url", () => {
    expect(blobExtension("x://a", "audio/mpeg")).toBe("mp3");
    expect(blobExtension("x://a.WAV", null)).toBe("wav");
    expect(blobExtension("x://a", null)).toBe("bin");
  });
});
