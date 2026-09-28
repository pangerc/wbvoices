/**
 * One-time access codes for server-to-server pull (AAC-185, P4-1 / §12).
 *
 * A source admin mints a code bound to a specific export scope. The destination
 * presents it (never an admin session) to pull the archive. Codes are:
 * - random (crypto), returned once in plaintext to the minting admin;
 * - stored **hashed** (sha256) in Redis with a short TTL;
 * - **single-use** — consumed atomically (GETDEL) on first use.
 */

import { getRedisV3 } from "@/lib/redis-v3";
import type { ExportConfig } from "./types";

const KEY = (hash: string) => `backup:grant:${hash}`;
const DEFAULT_TTL_SEC = 3600; // 1 hour

type GrantValue = {
  config: ExportConfig;
  createdBy: string | null;
  createdAt: string;
};

const encoder = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode(): string {
  // 32 bytes of entropy, URL-safe hex.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintAccessCode(
  config: ExportConfig,
  createdBy: string | null,
  ttlSec = DEFAULT_TTL_SEC,
): Promise<{ code: string; expiresAt: string; scope: ExportConfig["scope"] }> {
  const code = randomCode();
  const hash = await sha256Hex(code);
  const value: GrantValue = {
    config,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  await getRedisV3().set(KEY(hash), JSON.stringify(value), { ex: ttlSec });
  return {
    code,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    scope: config.scope,
  };
}

/** Atomically consume a code. Returns the granted config or null (invalid/used). */
export async function consumeAccessCode(
  code: string,
): Promise<ExportConfig | null> {
  if (!code) return null;
  const hash = await sha256Hex(code);
  const raw = await getRedisV3().getdel(KEY(hash));
  if (raw == null) return null;
  try {
    const value = (typeof raw === "string" ? JSON.parse(raw) : raw) as GrantValue;
    return value.config;
  } catch {
    return null;
  }
}
