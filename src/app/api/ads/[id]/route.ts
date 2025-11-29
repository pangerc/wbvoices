/**
 * Ad CRUD API
 *
 * DELETE /api/ads/{adId} - Delete an ad and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteAd } from "@/lib/redis/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * DELETE /api/ads/{adId}
 *
 * Delete an ad and all its associated Redis data:
 * - Metadata
 * - All version streams (voices, music, sfx)
 * - Mixer state
 * - Preview data
 * - Session index entry
 *
 * Headers:
 * - x-session-id: Session ID for index cleanup (optional, defaults to 'default-session')
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const sessionId =
      request.headers.get("x-session-id") || "default-session";

    console.log(`🗑️ Deleting ad ${adId} from session ${sessionId}`);

    await deleteAd(adId, sessionId);

    return NextResponse.json({ success: true, adId });
  } catch (error) {
    console.error("❌ Error deleting ad:", error);
    return NextResponse.json(
      {
        error: "Failed to delete ad",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
