import { validateAudioFile } from "@/lib/audio-validation";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "fixtures", name)));

describe("validateAudioFile", () => {
  it.each([
    ["sfx.mp3", "mp3"],
    ["sfx.wav", "wav"],
    ["sfx.m4a", "m4a"],
  ] as const)(
    "accepts %s as %s and measures its duration",
    async (name, format) => {
      const result = await validateAudioFile(fixture(name));

      expect(result).toMatchObject({ ok: true, format });
      if (result.ok) {
        expect(result.durationSeconds).toBeGreaterThan(0);
      }
    },
  );

  it("rejects text renamed to .mp3", async () => {
    const bytes = new TextEncoder().encode("definitely not audio\n");

    expect(await validateAudioFile(bytes)).toMatchObject({ ok: false });
  });

  it("rejects ADTS AAC even though it shares the MPEG sync bytes", async () => {
    expect(await validateAudioFile(fixture("sfx.aac"))).toMatchObject({
      ok: false,
    });
  });

  it("rejects junk that only contains an MPEG sync word further in", async () => {
    const bytes = new Uint8Array(4096);
    bytes.set([0xff, 0xfb, 0x90, 0x64], 512);

    expect(await validateAudioFile(bytes)).toMatchObject({ ok: false });
  });

  it.each(["sfx.wav", "sfx.m4a", "sfx.mp3"])(
    "rejects a truncated %s",
    async (name) => {
      const bytes = fixture(name);

      expect(await validateAudioFile(bytes.subarray(0, 30))).toMatchObject({
        ok: false,
      });
    },
  );

  it("rejects a WAV cut off mid-data", async () => {
    const bytes = fixture("sfx.wav");

    expect(
      await validateAudioFile(bytes.subarray(0, bytes.length - 100)),
    ).toMatchObject({ ok: false });
  });

  it("rejects an M4A whose media data was cut off", async () => {
    const bytes = fixture("sfx.m4a");

    expect(
      await validateAudioFile(bytes.subarray(0, bytes.length - 100)),
    ).toMatchObject({ ok: false });
  });

  it("rejects an empty file", async () => {
    expect(await validateAudioFile(new Uint8Array())).toMatchObject({
      ok: false,
    });
  });

  it("rejects a file over the 5MB limit", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set(fixture("sfx.mp3"));

    expect(await validateAudioFile(bytes)).toMatchObject({
      ok: false,
      error: expect.stringContaining("5MB"),
    });
  });
});
