import { describe, expect, it } from "vitest";
import {
  asyncIterableToStream,
  gunzipStream,
  gzipStream,
  packTar,
  parseTar,
  type TarEntry,
} from "../tar";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function* toAsync(entries: TarEntry[]) {
  for (const e of entries) yield e;
}

async function collect(entries: TarEntry[]) {
  const tar = asyncIterableToStream(packTar(toAsync(entries)));
  const out = new Map<string, Uint8Array>();
  for await (const e of parseTar(tar)) out.set(e.name, e.data);
  return out;
}

describe("tar encoder/parser", () => {
  it("roundtrips text + binary entries byte-identically", async () => {
    const bin = new Uint8Array(1000);
    for (let i = 0; i < bin.length; i++) bin[i] = (i * 37) % 256;

    const entries: TarEntry[] = [
      { name: "manifest.json", size: 13, body: enc.encode('{"a":"hello"}') },
      { name: "records/00000001.ndjson", size: 6, body: enc.encode("x\ny\nz\n".slice(0, 6)) },
      { name: "blobs/deadbeef.bin", size: bin.byteLength, body: bin },
    ];

    const out = await collect(entries);
    expect(dec.decode(out.get("manifest.json"))).toBe('{"a":"hello"}');
    expect(out.get("blobs/deadbeef.bin")).toEqual(bin);
    expect(out.size).toBe(3);
  });

  it("streams a chunked body and preserves order", async () => {
    async function* chunks() {
      yield enc.encode("abc");
      yield enc.encode("defgh");
    }
    const entries: TarEntry[] = [
      { name: "a.txt", size: 8, body: chunks() },
      { name: "b.txt", size: 3, body: enc.encode("xyz") },
    ];
    const out = await collect(entries);
    expect(dec.decode(out.get("a.txt"))).toBe("abcdefgh");
    expect(dec.decode(out.get("b.txt"))).toBe("xyz");
  });

  it("throws when declared size mismatches the body", async () => {
    const entries: TarEntry[] = [{ name: "bad", size: 99, body: enc.encode("short") }];
    await expect(collect(entries)).rejects.toThrow(/declared size/);
  });

  it("survives a gzip roundtrip", async () => {
    const entries: TarEntry[] = [
      { name: "hello.txt", size: 5, body: enc.encode("hello") },
    ];
    const gz = gzipStream(asyncIterableToStream(packTar(toAsync(entries))));
    const plain = gunzipStream(gz);
    const out = new Map<string, Uint8Array>();
    for await (const e of parseTar(plain)) out.set(e.name, e.data);
    expect(dec.decode(out.get("hello.txt"))).toBe("hello");
  });
});
