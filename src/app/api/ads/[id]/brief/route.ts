/**
 * Brief Update API
 *
 * PATCH /api/ads/[id]/brief - Update advertisement brief
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdMetadata, setAdMetadata } from "@/lib/redis/versions";
import type { ProjectBrief } from "@/types";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * PATCH /api/ads/[id]/brief
 *
 * Update brief for an existing advertisement
 *
 * Body:
 * {
 *   brief: ProjectBrief
 * }
 *
 * Response:
 * {
 *   success: true,
 *   brief: ProjectBrief
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await request.json();

    console.log(`📝 PATCH /api/ads/${adId}/brief`);

    const { brief } = body as { brief: ProjectBrief };

    if (!brief) {
      return NextResponse.json(
        { error: "brief is required" },
        { status: 400 }
      );
    }

    // Load existing metadata
    const meta = await getAdMetadata(adId);
    if (!meta) {
      return NextResponse.json(
        { error: "Ad not found" },
        { status: 404 }
      );
    }

    // Update brief and lastModified timestamp
    const updatedMeta = {
      ...meta,
      brief,
      lastModified: Date.now(),
    };

    await setAdMetadata(adId, updatedMeta);

    console.log(`✅ Updated brief for ad ${adId}`);

    return NextResponse.json({
      success: true,
      brief,
    });
  } catch (error) {
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
