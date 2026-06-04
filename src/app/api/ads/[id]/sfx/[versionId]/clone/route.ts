/**
 * SFX Version Clone API
 *
 * POST /api/ads/{adId}/sfx/{versionId}/clone - Clone SFX version
 */

import { cloneVersion } from "@/lib/redis/versions";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/sfx/{versionId}/clone
 *
 * Clone a SFX version (creates draft copy with fork metadata)
 *
 * Response:
 * {
 *   versionId: string,     // New version ID
 *   sourceId: string,      // Original version ID
 *   status: "draft"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id: adId, versionId: sourceVersionId } = await params;

    console.log(
      `📦 POST /api/ads/${adId}/sfx/${sourceVersionId}/clone - Cloning SFX version`,
    );

    // Clone the version
    const newVersionId = await cloneVersion(adId, "sfx", sourceVersionId);

    console.log(`✅ Cloned SFX ${sourceVersionId} → ${newVersionId}`);

    return NextResponse.json(
      {
        versionId: newVersionId,
        sourceId: sourceVersionId,
        status: "draft",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Failed to clone SFX version:", error);
    return NextResponse.json(
      {
        error: "Failed to clone version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
