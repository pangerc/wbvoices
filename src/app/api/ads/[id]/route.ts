/**
 * Ad CRUD API
 *
 * DELETE /api/ads/{adId} - Delete an ad and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteAd, getAdMetadata, setAdMetadata } from "@/lib/redis/versions";
import { requireAuth, verifyAdAccess, AuthError } from "@/lib/auth-helpers";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * PATCH /api/ads/{adId}
 *
 * Update ad metadata (currently supports renaming).
 * Only the ad owner or an admin can update.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { email, role } = await requireAuth();
    const { id: adId } = await params;

    const allowed = await verifyAdAccess(adId, email, role);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const metadata = await getAdMetadata(adId);
    if (!metadata) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    metadata.name = name.trim();
    metadata.lastModified = Date.now();
    await setAdMetadata(adId, metadata);

    return NextResponse.json({ success: true, adId, name: metadata.name });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Error updating ad:", error);
    return NextResponse.json(
      {
        error: "Failed to update ad",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

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
