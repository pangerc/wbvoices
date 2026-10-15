/**
 * Match-review apply log (AAC-255)
 *
 * POST /api/ads/[id]/match-review/apply
 * Records an `applied` event for a match-review improvement the user acted on.
 * The actual fix (chat turn / brief patch) runs through the existing paths on
 * the client; this endpoint only logs the acceptance for the stats page.
 */

import { AuthError, requireAuth, verifyAdAccess } from "@/lib/auth-helpers";
import { recordImprovementApplied } from "@/lib/match-review";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const { email, role } = await requireAuth();

    if (!(await verifyAdAccess(adId, email, role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      dimension?: string;
      improvementId?: string;
      method?: "click" | "manual";
    };
    const { dimension, improvementId } = body;
    const method = body.method ?? "click";

    if (!dimension || !improvementId) {
      return NextResponse.json(
        { error: "Missing dimension or improvementId" },
        { status: 400 },
      );
    }

    await recordImprovementApplied(
      { adId, ownerEmail: email },
      { dimension, improvementId, method },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[match-review/apply] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
