/**
 * Ad CRUD API
 *
 * DELETE /api/ads/{adId} - Delete an ad and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteAd } from "@/lib/redis/versions";
import { requireAuth, verifyAdAccess, AuthError } from "@/lib/auth-helpers";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * DELETE /api/ads/{adId}
 *
 * Delete an ad and all its associated Redis data.
 * Only the ad owner or an admin can delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { email, role } = await requireAuth();
    const { id: adId } = await params;

    // Verify ownership
    const allowed = await verifyAdAccess(adId, email, role);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.log(`🗑️ Deleting ad ${adId} by ${email}`);

    await deleteAd(adId, email);

    return NextResponse.json({ success: true, adId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
