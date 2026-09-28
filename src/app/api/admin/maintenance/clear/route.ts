/**
 * Break-glass: force maintenance OFF (AAC-185, P0).
 *
 * Turns maintenance off by clearing the Redis mirror first, so writes are
 * unblocked even when Postgres is unreachable (e.g. mid-migration). This is the
 * escape hatch guaranteeing an admin can never lock themselves out — it does
 * NOT depend on the Postgres settings write succeeding.
 *
 * Admin-gated by middleware (/api/admin/*). Deliberately NOT maintenance-guarded.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { forceClearMaintenance } from "@/services/serverSettingsService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { email } = await requireAuth();
    const result = await forceClearMaintenance(email);
    return NextResponse.json({
      ok: true,
      maintenanceMode: false,
      ...result,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Break-glass maintenance clear failed:", error);
    return NextResponse.json(
      { error: "Failed to clear maintenance mode" },
      { status: 500 },
    );
  }
}
