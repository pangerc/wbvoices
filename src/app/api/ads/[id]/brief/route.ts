/**
 * Brief API
 *
 * GET   /api/ads/[id]/brief - Fetch brief + light metadata for an ad
 * PATCH /api/ads/[id]/brief - Update advertisement brief
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import { getAdMetadata, setAdMetadata } from "@/lib/redis/versions";
import type { ProjectBrief } from "@/types";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/[id]/brief
 *
 * Returns the brief and light metadata for a single ad. Used by the workspace
 * page to populate the brief form without scraping the list endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const { email, role } = await requireAuth();

    const meta = await getAdMetadata(adId);
    if (!meta) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    if (role !== "admin" && meta.owner !== email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      brief: meta.brief ?? null,
      name: meta.name,
      owner: meta.owner,
      lastModified: meta.lastModified,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to load brief:", error);
    return NextResponse.json(
      {
        error: "Failed to load brief",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/ads/[id]/brief
 *
 * Update brief for an advertisement. Lazy-creates the ad row if it
 * doesn't exist yet (the client auto-saves as the user types, and ads
 * are otherwise persisted on Generate — without this lazy-create the
 * pre-Generate edits 404 in a loop and abandoned drafts vanish).
 *
 * Body: { brief: ProjectBrief }
 * Response: { success: true, brief: ProjectBrief }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: adId } = await params;
    const { email, role } = await requireAuth();

    const body = await request.json();
    const { brief } = body as { brief: ProjectBrief };

    if (!brief) {
      return NextResponse.json({ error: "brief is required" }, { status: 400 });
    }

    // Idempotent: if the ad row doesn't exist, create it on this PATCH.
    // The user's autosave keystrokes are the implicit "I want to keep
    // working on this ad" signal — losing them in a 404 spam loop just
    // because Generate hasn't fired yet is bad UX.
    const meta = await ensureAdExists(adId, email);

    if (role !== "admin" && meta.owner !== email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedMeta = {
      ...meta,
      brief,
      lastModified: Date.now(),
    };

    await setAdMetadata(adId, updatedMeta);

    return NextResponse.json({ success: true, brief });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to update brief:", error);
    return NextResponse.json(
      {
        error: "Failed to update brief",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
