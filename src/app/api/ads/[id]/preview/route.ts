/**
 * Preview API
 *
 * GET   /api/ads/{adId}/preview - Get preview data + mixedAudioUrl from mixer
 * PATCH /api/ads/{adId}/preview - Update preview data (partial)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getPreviewData,
  setPreviewData,
  getMixerState,
  getAdMetadata,
  type PreviewData,
} from "@/lib/redis/versions";

// Force Node.js runtime for Redis access
export const runtime = "nodejs";

/**
 * GET /api/ads/{adId}/preview
 *
 * Get preview data combined with mixedAudioUrl from mixer state.
 * Also includes auto-fill from brief if preview fields are empty.
 *
 * Response:
 * {
 *   brandName: string,
 *   slogan: string,
 *   cta: string,
 *   destinationUrl: string,
 *   logoUrl?: string,
 *   visualUrl?: string,
 *   mixedAudioUrl?: string
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;

    console.log(`📖 Getting preview data for ad ${adId}`);

    // Load preview data from Redis
    const previewData = await getPreviewData(adId);

    // Load mixer state to get mixedAudioUrl
    const mixerState = await getMixerState(adId);

    // Load ad metadata for auto-fill fallback
    const adMetadata = await getAdMetadata(adId);

    // Helper to extract brand name from client description
    const extractBrandName = (description?: string): string => {
      if (!description) return "";
      const brandName = description
        .split(/[.,]|(\s+is\s+)|(\s+offers\s+)|(\s+provides\s+)|(\s+sells\s+)/)[0]
        ?.trim();
      return brandName || "";
    };

    // Helper to capitalize text
    const capitalizeText = (text: string): string => {
      return text
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    };

    // Auto-fill from brief if preview data is empty
    const briefCTA = adMetadata?.brief?.selectedCTA?.replace(/-/g, " ") || "";
    const briefBrandName = extractBrandName(adMetadata?.brief?.clientDescription);

    const response = {
      brandName:
        previewData?.brandName ||
        (briefBrandName ? capitalizeText(briefBrandName) : ""),
      slogan: previewData?.slogan || "",
      cta:
        previewData?.cta && previewData.cta !== "Learn More"
          ? previewData.cta
          : briefCTA
          ? capitalizeText(briefCTA)
          : "Learn More",
      destinationUrl: previewData?.destinationUrl || "",
      logoUrl: previewData?.logoUrl,
      visualUrl: previewData?.visualUrl,
      mixedAudioUrl: mixerState?.mixedAudioUrl,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error getting preview data:", error);
    return NextResponse.json(
      {
        error: "Failed to get preview data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ads/{adId}/preview
 *
 * Update preview data (partial update, merges with existing)
 *
 * Request body: Partial<PreviewData>
 * Response: Updated PreviewData
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: adId } = await params;
    const updates: Partial<PreviewData> = await request.json();

    console.log(`✏️ Updating preview data for ad ${adId}`, {
      hasBrandName: !!updates.brandName,
      hasSlogan: !!updates.slogan,
      hasCta: !!updates.cta,
      hasLogoUrl: !!updates.logoUrl,
      hasVisualUrl: !!updates.visualUrl,
    });

    const updated = await setPreviewData(adId, updates);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Error updating preview data:", error);
    return NextResponse.json(
      {
        error: "Failed to update preview data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
