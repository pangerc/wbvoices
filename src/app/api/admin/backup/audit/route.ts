/**
 * Backup audit log viewer (AAC-185, P5 / §12). Admin-only (middleware gates
 * /api/admin/*). Returns the most recent backup actions, newest first.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { listAudit } from "@/lib/backup/audit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50,
      200,
    );
    const entries = await listAudit(limit);
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
