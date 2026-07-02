/**
 * Backup import from uploaded file (AAC-185, P3-6).
 *
 * `POST` with the raw `.tar.gz` as the request body. Query params:
 *   mode=dry-run|apply         (default dry-run — always preview first)
 *   conflictStrategy=merge|replace|remap
 *   confirm=<phrase>           (required for replace; from the dry-run response)
 *
 * Gated by `restoreFromFileEnabled`. `apply` runs under the single-flight
 * migration lock (R-15) and, for `replace`, takes a pre-import safety backup
 * before wiping (R-16/17/18). NOT maintenance-guarded here, but the admin is
 * told to enable maintenance for a clean migration.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { recordAudit } from "@/lib/backup/audit";
import {
  applyImport,
  dryRunImport,
  ImportError,
} from "@/lib/backup/import";
import { rateLimit } from "@/lib/backup/rateLimit";
import { createSafetyBackup } from "@/lib/backup/safetyBackup";
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
    if (!settings.restoreFromFileEnabled) {
      return NextResponse.json(
        { error: "Restore from file is disabled", code: "IMPORT_DISABLED" },
        { status: 403 },
      );
    }

    if (!request.body) {
      return NextResponse.json(
        { error: "Missing archive body", code: "NO_BODY" },
        { status: 400 },
      );
    }

    const q = request.nextUrl.searchParams;
    const mode = q.get("mode") === "apply" ? "apply" : "dry-run";
    const strategy = (q.get("conflictStrategy") ?? "merge") as ConflictStrategy;
    if (!STRATEGIES.includes(strategy)) {
      return NextResponse.json(
        { error: `Unknown conflictStrategy: ${strategy}`, code: "BAD_STRATEGY" },
        { status: 400 },
      );
    }

    if (mode === "dry-run") {
      const plan = await dryRunImport(request.body);
      return NextResponse.json({ mode, plan });
    }

    // apply — single-flight lock around the write.
    token = await tryAcquireMigrationLock();
    if (!token) {
      return NextResponse.json(
        { error: "A backup/migration is already in progress", code: "MIGRATION_IN_PROGRESS" },
        { status: 409 },
      );
    }

    const now = new Date();
    const result = await applyImport(
      request.body,
      { conflictStrategy: strategy, confirm: q.get("confirm") ?? undefined },
      (targetConfig) => createSafetyBackup(targetConfig, now),
    );
    await recordAudit({
      action: "import-file",
      actor: email,
      status: "success",
      scope: result.strategy,
      counts: result.written,
      detail: result.safetyBackup ? `pre-import backup: ${result.safetyBackup}` : undefined,
    });
    return NextResponse.json({ mode, result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("❌ Backup import failed:", error);
    return NextResponse.json({ error: "Backup import failed" }, { status: 500 });
  } finally {
    if (token) await releaseMigrationLock(token);
  }
}
