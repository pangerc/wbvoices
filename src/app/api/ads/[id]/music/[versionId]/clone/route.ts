/**
 * Music Version Clone API
 *
 * POST /api/ads/{adId}/music/{versionId}/clone - Clone music version
 */

import { cloneVersion } from "@/lib/redis/versions";
import { NextRequest, NextResponse } from "next/server";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * POST /api/ads/{adId}/music/{versionId}/clone
 *
 * Clone a music version (creates draft copy with fork metadata)
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
      `📦 POST /api/ads/${adId}/music/${sourceVersionId}/clone - Cloning music version`,
    );

    // Clone the version
    const newVersionId = await cloneVersion(adId, "music", sourceVersionId);

    console.log(`✅ Cloned music ${sourceVersionId} → ${newVersionId}`);

    return NextResponse.json(
      {
        versionId: newVersionId,
        sourceId: sourceVersionId,
        status: "draft",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("❌ Failed to clone music version:", error);
    return NextResponse.json(
      {
        error: "Failed to clone version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
