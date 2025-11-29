/**
 * Voice Stream API - List & Create
 *
 * GET  /api/ads/{adId}/voices - List all voice versions
 * POST /api/ads/{adId}/voices - Create new voice version
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listVersions,
  getActiveVersion,
  getAllVersionsWithData,
  createVersion,
} from "@/lib/redis/versions";
import { ensureAdExists } from "@/lib/redis/ensureAd";
import {
  VoiceVersion,
  VersionStreamResponse,
  CreateVersionResponse,
} from "@/types/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/voices
 *
 * List all voice versions with full data
 *
 * Response:
 * {
 *   versions: ["v1", "v2", "v3"],
 *   active: "v3",
 *   versionsData: {
 *     v1: { voiceTracks, generatedUrls, ... },
 *     v2: { voiceTracks, generatedUrls, ... },
 *     v3: { voiceTracks, generatedUrls, ... }
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Listing voice versions for ad ${adId}`);

    // Get version list
    const versions = await listVersions(adId, "voices");

    // Get active version pointer
    const active = await getActiveVersion(adId, "voices");

    // Load all version data
    const versionsData = await getAllVersionsWithData(adId, "voices");

    const response: VersionStreamResponse = {
      versions,
      active,
      versionsData,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error listing voice versions:", error);
    return NextResponse.json(
      {
        error: "Failed to list voice versions",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ads/{adId}/voices
 *
 * Create a new voice version (draft status)
 *
 * Body:
 * {
 *   voiceTracks: VoiceTrack[],
 *   createdBy?: "user" | "llm"  // Default: "user"
 * }
 *
 * Response:
 * {
 *   versionId: "v4",
 *   status: "draft"
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const body = await request.json();

    console.log(`✨ Creating new voice version for ad ${adId}`);

    // Validate required fields
    if (!body.voiceTracks || !Array.isArray(body.voiceTracks)) {
      return NextResponse.json(
        { error: "voiceTracks array is required" },
        { status: 400 }
      );
    }

    // Ensure ad exists (lazy creation for manual version creation)
    const sessionId = request.headers.get("x-session-id") || "default-session";
    await ensureAdExists(adId, sessionId);

    // Build version data
    const versionData: VoiceVersion = {
      voiceTracks: body.voiceTracks,
      generatedUrls: [], // Empty initially - filled by generate endpoint
      createdAt: Date.now(),
      createdBy: body.createdBy || "user",
      status: "draft",
      promptContext: body.promptContext, // Optional LLM prompt
      parentVersionId: body.parentVersionId, // Optional fork parent
    };

    // Create version in Redis
    const versionId = await createVersion(adId, "voices", versionData);

    const response: CreateVersionResponse = {
      versionId,
      status: "draft",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating voice version:", error);
    return NextResponse.json(
      {
        error: "Failed to create voice version",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
