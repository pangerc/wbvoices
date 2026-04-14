/**
 * Brief API
 *
 * GET   /api/ads/[id]/brief - Fetch brief + light metadata for an ad
 * PATCH /api/ads/[id]/brief - Update advertisement brief
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdMetadata, setAdMetadata } from "@/lib/redis/versions";
import { requireAuth, AuthError } from "@/lib/auth-helpers";
import type { ProjectBrief } from "@/types";

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
  { params }: { params: Promise<{ id: string }> }
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
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Failed to load brief:", error);
    return NextResponse.json(
      {
        error: "Failed to load brief",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/[id]/brief
 *
 * Update brief for an existing advertisement.
 *
 * Body: { brief: ProjectBrief }
 * Response: { success: true, brief: ProjectBrief }
 *
 * Returns 404 (not 403) for unpersisted ads — the client auto-saves as the
 * user types, and the ad is created lazily on Generate. See BriefPanelV3.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const { email, role } = await requireAuth();

    const body = await request.json();
    const { brief } = body as { brief: ProjectBrief };

    if (!brief) {
      return NextResponse.json(
        { error: "brief is required" },
        { status: 400 }
      );
    }

    const meta = await getAdMetadata(adId);
    if (!meta) {
      return NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }

    if (role !== "admin" && meta.owner !== email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatedMeta = {
      ...meta,
      brief,
      lastModified: Date.now(),
    };

    await setAdMetadata(adId, updatedMeta);

    console.log(`✅ Updated brief for ad ${adId}`);

    return NextResponse.json({ success: true, brief });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("❌ Failed to update brief:", error);
    return NextResponse.json(
      {
        error: "Failed to update brief",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
