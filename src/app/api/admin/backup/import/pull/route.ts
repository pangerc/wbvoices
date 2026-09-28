/**
 * Server-to-server migration pull (AAC-185, P4-5 / §8 Mode A).
 *
 * The destination fetches the archive from a source deployment's export endpoint
 * using a one-time access code, and streams it through the P3 import engine.
 *
 * `POST { sourceUrl, accessCode, conflictStrategy, confirm?, mode }`
 *   mode=dry-run|apply (default dry-run).
 *
 * Guards: `backupImportEnabled` flag; SSRF validation of `sourceUrl` (R-13);
 * single-flight migration lock on apply; pre-import safety backup for replace.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { recordAudit } from "@/lib/backup/audit";
import { applyImport, dryRunImport, ImportError } from "@/lib/backup/import";
import { rateLimit } from "@/lib/backup/rateLimit";
import { createSafetyBackup } from "@/lib/backup/safetyBackup";
import { SsrfError, validateSourceUrl } from "@/lib/backup/ssrf";
import type { ConflictStrategy } from "@/lib/backup/types";
import {
  releaseMigrationLock,
  tryAcquireMigrationLock,
} from "@/lib/redis/migrationLock";
import { getServerSettings } from "@/services/serverSettingsService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const STRATEGIES: ConflictStrategy[] = ["merge", "replace", "remap"];

/** Open the source archive stream via the access-code'd export endpoint. */
async function openSourceArchive(
  sourceUrl: string,
  accessCode: string,
): Promise<ReadableStream<Uint8Array>> {
  const safeUrl = await validateSourceUrl(sourceUrl);
  const endpoint = new URL("/api/admin/backup/export", safeUrl).toString();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "x-backup-access-code": accessCode, "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new ImportError(
      `Source export failed (${res.status}) ${detail.slice(0, 200)}`,
      "SOURCE_ERROR",
      502,
    );
  }
  return res.body;
}

export async function POST(request: NextRequest) {
  let token: string | null = null;
  try {
    const { email } = await requireAuth();

    const rl = await rateLimit(`import:${email}`, 5, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many import attempts, slow down", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }

    const settings = await getServerSettings();
    if (!settings.backupImportEnabled) {
      return NextResponse.json(
        { error: "Backup import is disabled", code: "IMPORT_DISABLED" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceUrl = String(body.sourceUrl ?? "");
    const accessCode = String(body.accessCode ?? "");
    const mode = body.mode === "apply" ? "apply" : "dry-run";
    const strategy = (body.conflictStrategy ?? "merge") as ConflictStrategy;

    if (!sourceUrl || !accessCode) {
      return NextResponse.json(
        { error: "sourceUrl and accessCode are required", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    if (!STRATEGIES.includes(strategy)) {
      return NextResponse.json(
        { error: `Unknown conflictStrategy: ${strategy}`, code: "BAD_STRATEGY" },
        { status: 400 },
      );
    }

    if (mode === "dry-run") {
      const stream = await openSourceArchive(sourceUrl, accessCode);
      const plan = await dryRunImport(stream);
      return NextResponse.json({ mode, plan });
    }

    // apply — single-flight lock.
    token = await tryAcquireMigrationLock();
    if (!token) {
      return NextResponse.json(
        { error: "A backup/migration is already in progress", code: "MIGRATION_IN_PROGRESS" },
        { status: 409 },
      );
    }
    const stream = await openSourceArchive(sourceUrl, accessCode);
    const now = new Date();
    const result = await applyImport(
      stream,
      { conflictStrategy: strategy, confirm: body.confirm ? String(body.confirm) : undefined },
      (targetConfig) => createSafetyBackup(targetConfig, now),
    );
    await recordAudit({
      action: "import-pull",
      actor: email,
      status: "success",
      scope: result.strategy,
      sourceUrl,
      counts: result.written,
    });
    return NextResponse.json({ mode, result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SsrfError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ImportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("❌ Migration pull failed:", error);
    return NextResponse.json(
      {
        error: "Migration pull failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    if (token) await releaseMigrationLock(token);
  }
}
