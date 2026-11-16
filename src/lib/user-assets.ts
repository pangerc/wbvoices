import { createHash } from "node:crypto";

/**
 * Storage folder holding one user's uploaded sound effects, e.g.
 * `user-assets/3f9a1c0b7d2e4a51/sfx`.
 *
 * The owner is a hash of the email, so the address never appears in a bucket
 * key or a media URL. Server-only: the presign route builds paths under it and
 * the validate route refuses any path outside it, which is what stops one user
 * validating — or deleting — another's upload.
 */
export function userSfxFolder(email: string): string {
  const ownerKey = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `user-assets/${ownerKey}/sfx`;
}

/**
 * SHA-256 (hex) of a stored upload's bytes — what makes two uploads "the same
 * file" in a user's library. Computed from the bytes as they landed in
 * storage, never from anything the browser claims.
 */
export function contentHashOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
