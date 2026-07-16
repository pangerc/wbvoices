/**
 * Admin server-settings API (AAC-185, P0-4).
 *
 * GET   — full settings (admin only; middleware gates /api/admin/*).
 * PATCH — partial update of flags / maintenance mode.
 *
 * Not maintenance-guarded: toggling settings must work *during* maintenance
 * (that's how you turn it off).
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import {
  getServerSettings,
  isMissingSettingsTableError,
  updateServerSettings,
  type ServerSettingsPatch,
} from "@/services/serverSettingsService";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAuth();
    const settings = await getServerSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isMissingSettingsTableError(error)) {
      // Table not created yet (migration 0004 not applied on this env). Tell the
      // UI so it can offer a "create table" action instead of a bare 500.
      return NextResponse.json(
        {
          error: "The server_settings table does not exist yet.",
          code: "SETTINGS_TABLE_MISSING",
        },
        { status: 503 },
      );
    }
    console.error("❌ Failed to load server settings:", error);
    return NextResponse.json(
      { error: "Failed to load server settings" },
      { status: 500 },
    );
  }
}

const BOOL_KEYS = [
  "maintenanceMode",
  "backupExportEnabled",
  "backupImportEnabled",
  "restoreFromFileEnabled",
] as const;
const INT_KEYS = ["importWriteConcurrency", "importBatchSize"] as const;

export async function PATCH(request: NextRequest) {
  try {
    const { email } = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;

    // Whitelist + type-validate — never trust the body shape.
    const patch: ServerSettingsPatch = {};
    for (const k of BOOL_KEYS) {
      if (k in body) {
        if (typeof body[k] !== "boolean") {
          return NextResponse.json(
            { error: `${k} must be a boolean` },
            { status: 400 },
          );
        }
        patch[k] = body[k] as boolean;
      }
    }
    for (const k of INT_KEYS) {
      if (k in body) {
        const v = body[k];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
          return NextResponse.json(
            { error: `${k} must be a positive integer` },
            { status: 400 },
          );
        }
        patch[k] = v;
      }
    }
    if ("maintenanceMessage" in body) {
      const v = body.maintenanceMessage;
      if (v !== null && typeof v !== "string") {
        return NextResponse.json(
          { error: "maintenanceMessage must be a string or null" },
          { status: 400 },
        );
      }
      patch.maintenanceMessage = v as string | null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No valid settings fields in body" },
        { status: 400 },
      );
    }

    const settings = await updateServerSettings(patch, email);
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Failed to update server settings:", error);
    return NextResponse.json(
      { error: "Failed to update server settings" },
      { status: 500 },
    );
  }
}
