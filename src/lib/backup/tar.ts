/**
 * Minimal streaming USTAR encoder + parser (AAC-185, P1).
 *
 * Why hand-rolled: the app has no tar dependency, and the tar wire format is
 * simple + forward-only-streamable by construction (inline 512-byte header per
 * entry, no trailing central directory — unlike ZIP). All our entry names stay
 * under 100 bytes (`manifest.json`, `records/00000001.ndjson`,
 * `blobs/<64-hex>.mp3`), so we never need PAX/GNU long-name extensions.
 *
 * gzip is layered on with the Web `CompressionStream("gzip")` global (Node 25),
 * keeping one archive format for both the file-download and the live
 * server-to-server stream paths.
 */

const BLOCK = 512;
const ZERO_BLOCK = new Uint8Array(BLOCK);

/** An entry to pack. `size` MUST equal the total bytes yielded by `body`. */
export type TarEntry = {
  name: string;
  size: number;
  body: Uint8Array | AsyncIterable<Uint8Array>;
};

function writeString(buf: Uint8Array, str: string, offset: number, len: number) {
  const bytes = new TextEncoder().encode(str);
  if (bytes.length > len) {
    throw new Error(`tar: field too long (${bytes.length} > ${len}): ${str}`);
  }
  buf.set(bytes, offset);
}

/** Octal, zero-padded, NUL-terminated — the USTAR numeric field convention. */
function writeOctal(buf: Uint8Array, value: number, offset: number, len: number) {
  const str = value.toString(8).padStart(len - 1, "0");
  writeString(buf, str, offset, len - 1);
  buf[offset + len - 1] = 0;
}

function buildHeader(name: string, size: number, mtime: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  writeString(h, name, 0, 100);
  writeOctal(h, 0o644, 100, 8); // mode
  writeOctal(h, 0, 108, 8); // uid
  writeOctal(h, 0, 116, 8); // gid
  writeOctal(h, size, 124, 12); // size
  writeOctal(h, mtime, 136, 12); // mtime
  h[156] = 0x30; // typeflag '0' (regular file)
  writeString(h, "ustar", 257, 6); // magic
  h[263] = 0x30; // version "00"
  h[264] = 0x30;

  // Checksum: sum of all bytes with the checksum field taken as ASCII spaces.
  for (let i = 148; i < 156; i++) h[i] = 0x20;
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  // 6 octal digits, NUL, then space (POSIX convention).
  writeString(h, sum.toString(8).padStart(6, "0"), 148, 6);
  h[154] = 0;
  h[155] = 0x20;
  return h;
}

function padding(size: number): number {
  const rem = size % BLOCK;
  return rem === 0 ? 0 : BLOCK - rem;
}

/**
 * Pack entries into a tar byte stream. Yields the header, body (verbatim, in
 * whatever chunks `body` produces), and per-entry padding, then two trailing
 * zero blocks. Constant memory: a streamed `body` is never buffered here.
 */
export async function* packTar(
  entries: AsyncIterable<TarEntry> | Iterable<TarEntry>,
  mtime = 0,
): AsyncGenerator<Uint8Array> {
  for await (const entry of entries as AsyncIterable<TarEntry>) {
    yield buildHeader(entry.name, entry.size, mtime);

    let written = 0;
    if (entry.body instanceof Uint8Array) {
      yield entry.body;
      written = entry.body.byteLength;
    } else {
      for await (const chunk of entry.body) {
        yield chunk;
        written += chunk.byteLength;
      }
    }
    if (written !== entry.size) {
      throw new Error(
        `tar: entry "${entry.name}" declared size ${entry.size} but wrote ${written}`,
      );
    }

    const pad = padding(entry.size);
    if (pad > 0) yield ZERO_BLOCK.subarray(0, pad);
  }
  // End-of-archive: two zero blocks.
  yield ZERO_BLOCK;
  yield ZERO_BLOCK;
}

function readString(buf: Uint8Array, offset: number, len: number): string {
  let end = offset;
  const max = offset + len;
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(offset, end));
}

function readOctal(buf: Uint8Array, offset: number, len: number): number {
  const str = readString(buf, offset, len).trim();
  return str.length ? parseInt(str, 8) : 0;
}

function concat(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Memory-bounded streaming tar parser. Appends incoming chunks to a rolling
 * buffer, emits one `{name, data}` per entry, and drops consumed bytes — so the
 * live buffer stays ~one entry, not the whole archive. A record batch is small;
 * a blob is one audio file at a time (documented v1 ceiling — P3 import streams
 * that single entry to the blob store).
 */
export async function* parseTarStream(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): AsyncGenerator<{ name: string; data: Uint8Array }> {
  const iter: AsyncIterator<Uint8Array> = (
    source instanceof ReadableStream
      ? streamToAsyncIterable(source)
      : source
  )[Symbol.asyncIterator]();

  let buf = new Uint8Array(0);
  let ended = false;

  async function ensure(n: number): Promise<boolean> {
    while (buf.length < n && !ended) {
      const { value, done } = await iter.next();
      if (done) {
        ended = true;
        break;
      }
      if (value) buf = concat(buf, value);
    }
    return buf.length >= n;
  }

  for (;;) {
    if (!(await ensure(BLOCK))) return; // no full header left → end
    const header = buf.subarray(0, BLOCK);
    if (header.every((b) => b === 0)) return; // end-of-archive marker

    const name = readString(header, 0, 100);
    const size = readOctal(header, 124, 12);
    const consumed = BLOCK + size + padding(size);
    if (!(await ensure(consumed))) {
      throw new Error(`tar: truncated entry "${name}"`);
    }
    const data = buf.slice(BLOCK, BLOCK + size);
    buf = buf.slice(consumed);
    yield { name, data };
  }
}

/** Back-compat alias — same streaming parser. */
export const parseTar = parseTarStream;

/** Wrap an async iterable of bytes as a ReadableStream (for gzip piping). */
export function asyncIterableToStream(
  iter: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = iter[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

async function* streamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
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

// The DOM lib types CompressionStream over BufferSource, which doesn't unify
// with ReadableStream<Uint8Array> under exactOptionalPropertyTypes. The runtime
// contract is bytes-in/bytes-out, so we assert the pair shape.
type BytePair = ReadableWritablePair<Uint8Array, Uint8Array>;

/** Gzip a byte stream with the Web CompressionStream (Node 25 global). */
export function gzipStream(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  return source.pipeThrough(new CompressionStream("gzip") as unknown as BytePair);
}

/** Gunzip a byte stream (parser side / P3 import). */
export function gunzipStream(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  return source.pipeThrough(new DecompressionStream("gzip") as unknown as BytePair);
}
