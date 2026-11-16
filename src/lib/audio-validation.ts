import { FILE_CONFIGS } from "@/lib/upload-configs";
import * as mm from "music-metadata";

/** Containers a user may upload as a sound effect. */
export type UploadedAudioFormat = "mp3" | "wav" | "m4a";

export type AudioValidationResult =
  | { ok: true; format: UploadedAudioFormat; durationSeconds: number }
  | { ok: false; error: string };

const NOT_PLAYABLE = "This file is not a playable MP3, WAV or M4A file.";

/**
 * Checks that stored bytes are a complete, playable MP3, WAV or M4A file and
 * measures its duration.
 *
 * Runs on the object as it landed in storage, so nothing the browser declared
 * (type, size, duration) is trusted. Three layers, each catching what the next
 * one would miss:
 *
 *  1. A signature at offset 0 — `music-metadata` scans forward for MPEG frame
 *     sync, so without this, arbitrary bytes containing `0xFFEx` could parse.
 *  2. Container integrity — a WAV or M4A cut short still has a header that
 *     claims the full duration; the declared sizes must fit in the file.
 *  3. A full parse — the container `music-metadata` reports decides the format
 *     (ADTS AAC shares the MPEG sync bytes and is rejected here), and the file
 *     must have at least one channel and a positive duration.
 */
export async function validateAudioFile(
  bytes: Uint8Array,
): Promise<AudioValidationResult> {
  const maxSize = FILE_CONFIGS["custom-sfx"].maxSize;
  if (bytes.length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (bytes.length > maxSize) {
    return {
      ok: false,
      error: `File too large. Max size: ${maxSize / (1024 * 1024)}MB`,
    };
  }

  const signature = sniffSignature(bytes);
  if (!signature) {
    return { ok: false, error: NOT_PLAYABLE };
  }
  if (signature === "wav" && !riffSizeFits(bytes)) {
    return { ok: false, error: NOT_PLAYABLE };
  }
  if (signature === "m4a" && !mp4BoxesFit(bytes)) {
    return { ok: false, error: NOT_PLAYABLE };
  }

  let metadata: mm.IAudioMetadata;
  try {
    metadata = await mm.parseBuffer(bytes, undefined, { duration: true });
  } catch {
    return { ok: false, error: NOT_PLAYABLE };
  }

  const { container, codec, numberOfChannels, duration } = metadata.format;
  const format = formatFromContainer(container, codec);
  if (!format || format !== signature) {
    return { ok: false, error: NOT_PLAYABLE };
  }
  if (!numberOfChannels || !duration || !Number.isFinite(duration)) {
    return { ok: false, error: NOT_PLAYABLE };
  }

  return { ok: true, format, durationSeconds: duration };
}

/** Which container the first bytes announce, if any we accept. */
function sniffSignature(bytes: Uint8Array): UploadedAudioFormat | null {
  if (ascii(bytes, 0, 3) === "ID3") return "mp3";
  // MPEG audio frame sync: 11 set bits.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return "wav";
  }
  if (ascii(bytes, 4, 4) === "ftyp") return "m4a";
  return null;
}

/**
 * Maps what `music-metadata` parsed to an accepted format. MP4 containers report
 * their brands (`M4A/mp42/isom`), so any MP4 brand with an AAC or ALAC track
 * counts as M4A.
 */
function formatFromContainer(
  container: string | undefined,
  codec: string | undefined,
): UploadedAudioFormat | null {
  if (!container) return null;
  if (container === "MPEG" && codec?.includes("Layer 3")) return "mp3";
  if (container === "WAVE") return "wav";
  if (
    /^(M4A|M4B|mp4|mp41|mp42|isom|iso\d)\b/i.test(container) &&
    /AAC|ALAC/i.test(codec ?? "")
  ) {
    return "m4a";
  }
  return null;
}

/** The RIFF chunk's declared size must not run past the end of the file. */
function riffSizeFits(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(4, true) + 8 <= bytes.length;
}

/** Every top-level MP4 box must fit inside the file. */
function mp4BoxesFit(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    let size = view.getUint32(offset);
    if (size === 1) {
      // 64-bit `largesize` follows the box type.
      if (offset + 16 > bytes.length) return false;
      size = Number(view.getBigUint64(offset + 8));
    } else if (size === 0) {
      // The box runs to the end of the file.
      return true;
    }
    if (size < 8 || offset + size > bytes.length) return false;
    offset += size;
  }
  return true;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
