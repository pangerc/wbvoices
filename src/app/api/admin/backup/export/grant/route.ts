/**
 * Mint a one-time access code for server-to-server pull (AAC-185, P4-3 / §7).
 *
 * The source admin mints a code bound to a chosen export scope. A destination
 * deployment presents it to `/api/admin/backup/export` (via the
 * `x-backup-access-code` header) to pull the archive without any admin session
 * on the source. Admin-gated by middleware + `backupExportEnabled`.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { mintAccessCode } from "@/lib/backup/accessCode";
import { recordAudit } from "@/lib/backup/audit";
import { rateLimit } from "@/lib/backup/rateLimit";
import type { ExportConfig, ExportScope, ModelKind } from "@/lib/backup/types";
import { getServerSettings } from "@/services/serverSettingsService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function parseScope(body: Record<string, unknown>): ExportScope {
  const type = body.scope ?? "complete";
  if (type === "complete") return { type: "complete" };
  if (type === "per-user") {
    const emails = Array.isArray(body.emails) ? body.emails.map(String) : [];
    if (!emails.length) throw new Error("per-user scope requires emails");
    return {
      type: "per-user",
      emails,
      includeGlobalReference: body.includeGlobalReference === true,
    };
  }
  if (type === "per-ad") {
    const adIds = Array.isArray(body.adIds) ? body.adIds.map(String) : [];
    if (!adIds.length) throw new Error("per-ad scope requires adIds");
    return { type: "per-ad", adIds };
  }
  throw new Error(`Unknown scope: ${String(type)}`);
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await requireAuth();

    const settings = await getServerSettings();
    if (!settings.backupExportEnabled) {
      return NextResponse.json(
        { error: "Backup export is disabled", code: "EXPORT_DISABLED" },
        { status: 403 },
      );
    }

    const rl = await rateLimit(`grant:${email}`, 10, 60);
    if (!rl.allowed) {
      await recordAudit({ action: "grant", actor: email, status: "blocked", detail: "rate limited" });
      return NextResponse.json(
        { error: "Too many grant requests, slow down", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const scope = parseScope(body);
    const config: ExportConfig = {
      scope,
      blobStrategy: "embed",
      models: Array.isArray(body.models) ? (body.models as ModelKind[]) : undefined,
    };
    const ttlSec =
      typeof body.ttlSec === "number" && body.ttlSec > 0
        ? Math.min(body.ttlSec, 24 * 3600)
        : undefined;

    const grant = await mintAccessCode(config, email, ttlSec);
    await recordAudit({
      action: "grant",
      actor: email,
      status: "success",
      scope: scope.type,
    });
    return NextResponse.json(grant);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mint code", code: "BAD_CONFIG" },
      { status: 400 },
    );
  }
}
