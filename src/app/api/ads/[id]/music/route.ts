/**
 * Music Stream API - List & Create
 *
 * GET  /api/ads/{adId}/music - List all music versions
 * POST /api/ads/{adId}/music - Create new music version
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listVersions,
  getActiveVersion,
  getAllVersionsWithData,
  createVersion,
} from "@/lib/redis/versions";
import {
  MusicVersion,
  VersionStreamResponse,
  CreateVersionResponse,
} from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/music
 *
 * List all music versions with full data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Listing music versions for ad ${adId}`);

    const versions = await listVersions(adId, "music");
    const active = await getActiveVersion(adId, "music");
    const versionsData = await getAllVersionsWithData(adId, "music");

    const response: VersionStreamResponse = {
      versions,
      active,
      versionsData,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error listing music versions:", error);
    return NextResponse.json(
      {
        error: "Failed to list music versions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ads/{adId}/music
 *
 * Create a new music version (draft status)
 *
 * Body:
 * {
 *   musicPrompt: string,
 *   musicPrompts: MusicPrompts,
 *   duration: number,
 *   provider: MusicProvider,
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

    console.log(`✨ Creating new music version for ad ${adId}`);

    // Validate required fields
    if (!body.musicPrompt || !body.provider) {
      return NextResponse.json(
        { error: "musicPrompt and provider are required" },
        { status: 400 }
      );
    }

    // Build version data
    const versionData: MusicVersion = {
      musicPrompt: body.musicPrompt,
      musicPrompts: body.musicPrompts || {
        loudly: body.musicPrompt,
        mubert: body.musicPrompt,
        elevenlabs: body.musicPrompt,
      },
      generatedUrl: "", // Empty initially - filled by generate endpoint
      duration: body.duration || 30,
      provider: body.provider,
      createdAt: Date.now(),
      createdBy: body.createdBy || "user",
      status: "draft",
    };

    // Create version in Redis
    const versionId = await createVersion(adId, "music", versionData);

    const response: CreateVersionResponse = {
      versionId,
      status: "draft",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating music version:", error);
    return NextResponse.json(
      {
        error: "Failed to create music version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
