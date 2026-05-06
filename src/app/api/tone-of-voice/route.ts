import { NextResponse } from "next/server";
import { suggestedTonesService } from "@/services/suggestedTonesService";

/**
 * Public read-only list of active suggested tones, consumed by BriefPanelV3
 * (the brief selector). Admin-only CRUD lives under /api/admin/tone-of-voice.
 */

// Without this, Next.js sees no dynamic API calls in the GET handler and
// statically optimizes it — baking the DB query result into the build at
// deploy time. New rows added by the admin panel never surface until the
// next deploy. Force dynamic so every request hits Neon live.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tones = await suggestedTonesService.list({ activeOnly: true });
    return NextResponse.json({ tones });
  } catch (error) {
    console.error("Error listing public tones:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list tones" },
      { status: 500 }
    );
  }
}
