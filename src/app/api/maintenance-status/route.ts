/**
 * Public maintenance status (AAC-185, P0-4).
 *
 * Returns only the maintenance bool + message — no other settings, no secrets —
 * so a non-admin banner can render. Added to `isPublicRoute` in middleware.
 */

import { getServerSettings } from "@/services/serverSettingsService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const s = await getServerSettings();
    return NextResponse.json({
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
    });
  } catch (error) {
    // Fail open: if settings can't be read, don't wrongly show maintenance.
    console.error("❌ maintenance-status read failed:", error);
    return NextResponse.json({
      maintenanceMode: false,
      maintenanceMessage: null,
    });
  }
}
