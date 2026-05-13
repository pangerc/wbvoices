import { suggestedTonesService } from "@/services/suggestedTonesService";
import { NextResponse } from "next/server";

/**
 * Public read-only list of active suggested tones, consumed by BriefPanelV3
 * (the brief selector). Admin-only CRUD lives under /api/admin/tone-of-voice.
 */
export async function GET() {
  try {
    const tones = await suggestedTonesService.list({ activeOnly: true });
    return NextResponse.json({ tones });
  } catch (error) {
    console.error("Error listing public tones:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list tones",
      },
      { status: 500 },
    );
  }
}
