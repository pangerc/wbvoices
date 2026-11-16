/**
 * Remove a sound effect from the caller's library —
 * `DELETE /api/sfx/library/{assetId}`
 *
 * Removes the library entry only. The stored file stays: ads that already use
 * the sound reference its URL directly and keep playing it. Only the caller's
 * own items can be removed; anything else answers 404, so ids of other users'
 * items can't be probed.
 */
import { userAssets } from "@/database/user-assets";
import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { email } = await requireAuth();
    const { assetId } = await params;

    const deleted = await userAssets.deleteSfx(email, assetId);
    if (!deleted) {
      return NextResponse.json(
        { error: "That sound effect isn't in your library" },
        { status: 404 },
      );
    }

    console.log(`🗑️ Removed SFX ${assetId} from ${email}'s library`);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to remove a sound effect:", error);
    return NextResponse.json(
      { error: "Failed to remove the sound effect" },
      { status: 500 },
    );
  }
}
