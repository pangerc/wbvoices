/**
 * Sound Effects Stream API - List & Create
 *
 * GET  /api/ads/{adId}/sfx - List all SFX versions
 * POST /api/ads/{adId}/sfx - Create new SFX version
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listVersions,
  getActiveVersion,
  getAllVersionsWithData,
  createVersion,
} from "@/lib/redis/versions";
import {
  SfxVersion,
  VersionStreamResponse,
  CreateVersionResponse,
} from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/sfx
 *
 * List all sound effects versions with full data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Listing SFX versions for ad ${adId}`);

    const versions = await listVersions(adId, "sfx");
    const active = await getActiveVersion(adId, "sfx");
    const versionsData = await getAllVersionsWithData(adId, "sfx");

    const response: VersionStreamResponse = {
      versions,
      active,
      versionsData,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error listing SFX versions:", error);
    return NextResponse.json(
      {
        error: "Failed to list SFX versions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ads/{adId}/sfx
 *
 * Create a new sound effects version (draft status)
 *
 * Body:
 * {
 *   soundFxPrompts: SoundFxPrompt[],
 *   createdBy?: "user" | "llm"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await request.json();

    console.log(`✨ Creating new SFX version for ad ${adId}`);

    // Validate required fields
    if (!body.soundFxPrompts || !Array.isArray(body.soundFxPrompts)) {
      return NextResponse.json(
        { error: "soundFxPrompts array is required" },
        { status: 400 }
      );
    }

    // Build version data
    const versionData: SfxVersion = {
      soundFxPrompts: body.soundFxPrompts,
      generatedUrls: [], // Empty initially - filled by generate endpoint
      createdAt: Date.now(),
      createdBy: body.createdBy || "user",
      status: "draft",
    };

    // Create version in Redis
    const versionId = await createVersion(adId, "sfx", versionData);

    const response: CreateVersionResponse = {
      versionId,
      status: "draft",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating SFX version:", error);
    return NextResponse.json(
      {
        error: "Failed to create SFX version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
