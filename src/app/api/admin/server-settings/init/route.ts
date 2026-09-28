/**
 * Provision the `server_settings` table from the admin UI (AAC-185).
 *
 * For preview / not-yet-migrated environments where migration 0004 hasn't run:
 * lets an admin create the table (idempotent `CREATE TABLE IF NOT EXISTS`)
 * instead of hitting a bare 500 on /admin/backup. Admin-gated by middleware
 * (/api/admin/*). Not maintenance-guarded — provisioning must always work.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import {
  ensureServerSettingsTable,
  getServerSettings,
} from "@/services/serverSettingsService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireAuth();
    await ensureServerSettingsTable();
    // Materialize the single row + return the settings so the UI can proceed.
    const settings = await getServerSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Failed to create server_settings table:", error);
    return NextResponse.json(
      {
        error: "Failed to create settings table",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
