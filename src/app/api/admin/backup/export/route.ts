/**
 * Backup export endpoint (AAC-185, P2).
 *
 * Streams a `.tar.gz` of the selected scope. Admin-gated by middleware
 * (`/api/admin/*`) and additionally by the `backupExportEnabled` flag. Wrapped
 * in the single-flight migration lock (R-15) so an export can't race another
 * backup/import; the lock is released when the stream finishes or is cancelled.
 *
 * - `POST` — JSON body `{ scope, blobStrategy?, models?, batchSize? }`. Canonical
 *   path (also what the server-to-server pull will call in P4).
 * - `GET`  — same config via query params. Lets the browser stream the archive
 *   straight to disk (no client-side buffering) for the download button.
 *
 * NOT maintenance-guarded: exporting is a read/transfer, and it must work while
 * maintenance is on (that's the whole point of the snapshot).
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { consumeAccessCode } from "@/lib/backup/accessCode";
import { recordAudit } from "@/lib/backup/audit";
import { createBackupArchiveStream } from "@/lib/backup/archive";
import type {
  ExportConfig,
  ExportScope,
  ModelKind,
} from "@/lib/backup/types";
import {
  releaseMigrationLock,
  tryAcquireMigrationLock,
} from "@/lib/redis/migrationLock";
import { getServerSettings } from "@/services/serverSettingsService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — see R-7 (single-request ceiling)

const VALID_KINDS: ModelKind[] = [
  "server-settings",
  "user",
  "voice-metadata",
  "voice-blacklist",
  "voice-description",
  "suggested-tone",
  "instruction-template",
  "ad-meta",
  "version",
  "conversation",
  "preview",
  "blob",
];

class ConfigError extends Error {}

function parseModels(raw: unknown): ModelKind[] | undefined {
  if (raw == null) return undefined;
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const kinds = list.map((k) => String(k));
  for (const k of kinds) {
    if (!VALID_KINDS.includes(k as ModelKind)) {
      throw new ConfigError(`Unknown model kind: ${k}`);
    }
  }
  return kinds as ModelKind[];
}

function toBool(v: unknown): boolean {
  return v === true || v === "1" || v === "true";
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Build a validated ExportConfig from a JSON body or a query param bag. */
function parseConfig(src: Record<string, unknown>): ExportConfig {
  const scopeType = src.scope ?? "complete";
  let scope: ExportScope;

  if (scopeType === "complete") {
    scope = { type: "complete" };
  } else if (scopeType === "per-user") {
    const emails = toList(src.emails);
    if (!emails.length) throw new ConfigError("per-user scope requires emails");
    scope = {
      type: "per-user",
      emails,
      includeGlobalReference: toBool(src.includeGlobalReference),
    };
  } else if (scopeType === "per-ad") {
    const adIds = toList(src.adIds);
    if (!adIds.length) throw new ConfigError("per-ad scope requires adIds");
    scope = { type: "per-ad", adIds };
  } else {
    throw new ConfigError(`Unknown scope: ${String(scopeType)}`);
  }

  const blobStrategy = src.blobStrategy ?? "embed";
  if (blobStrategy !== "embed") {
    throw new ConfigError(`Unsupported blobStrategy: ${String(blobStrategy)}`);
  }

  const batchSize =
    src.batchSize != null ? Number(src.batchSize) : undefined;
  if (batchSize != null && (!Number.isInteger(batchSize) || batchSize < 1)) {
    throw new ConfigError("batchSize must be a positive integer");
  }

  return { scope, blobStrategy: "embed", models: parseModels(src.models), batchSize };
}

function archiveFilename(config: ExportConfig, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const scope =
    config.scope.type === "complete"
      ? "complete"
      : config.scope.type === "per-user"
        ? "users"
        : "ads";
  return `aca-backup-${scope}-${stamp}.tar.gz`;
}

/** Wrap the archive so the migration lock is released on close/cancel/error. */
function releaseLockOnEnd(
  stream: ReadableStream<Uint8Array>,
  token: string,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await releaseMigrationLock(token);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          await release();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        await release();
        controller.error(err);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await release();
    },
  });
}

async function runExport(config: ExportConfig, actor: string): Promise<Response> {
  const settings = await getServerSettings();
  if (!settings.backupExportEnabled) {
    return NextResponse.json(
      { error: "Backup export is disabled", code: "EXPORT_DISABLED" },
      { status: 403 },
    );
  }

  const token = await tryAcquireMigrationLock();
  if (!token) {
    return NextResponse.json(
      { error: "A backup/migration is already in progress", code: "MIGRATION_IN_PROGRESS" },
      { status: 409 },
    );
  }

  try {
    const now = new Date();
    const archive = await createBackupArchiveStream(config, {
      now,
      sourceRegion:
        process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? null,
      appVersion: process.env.APP_VERSION ?? null,
    });
    // Ownership of the lock transfers to the stream wrapper below.
    const body = releaseLockOnEnd(archive, token);
    await recordAudit({
      action: "export",
      actor,
      status: "success",
      scope: config.scope.type,
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${archiveFilename(config, now)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Failure before the stream took ownership of the lock — release it here.
    await releaseMigrationLock(token);
    throw err;
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ConfigError) {
    return NextResponse.json({ error: error.message, code: "BAD_CONFIG" }, { status: 400 });
  }
  console.error("❌ Backup export failed:", error);
  return NextResponse.json(
    { error: "Backup export failed" },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  try {
    // Auth is EITHER an admin session OR a one-time access code (server-to-server
    // pull). The code path ignores client-supplied scope and uses the granted
    // config — the source admin fixed the scope when minting the code (§12).
    const code = request.headers.get("x-backup-access-code");
    if (code) {
      const granted = await consumeAccessCode(code);
      if (!granted) {
        return NextResponse.json(
          { error: "Invalid or expired access code", code: "CODE_INVALID" },
          { status: 401 },
        );
      }
      return await runExport(granted, "access-code");
    }

    const { email } = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await runExport(parseConfig(body), email);
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { email } = await requireAuth();
    const q = Object.fromEntries(request.nextUrl.searchParams.entries());
    return await runExport(parseConfig(q), email);
  } catch (error) {
    return handleError(error);
  }
}
