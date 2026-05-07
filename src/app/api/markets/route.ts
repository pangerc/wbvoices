/**
 * GET /api/markets
 * GET /api/markets?showAll=true
 *
 * Browser-callable proxy that forwards alaric's canonical 86-market mapping
 * to the brief picker UI. The browser can't sign HMAC requests directly
 * (shared-secret exposure + CORS) — this endpoint runs server-side, signs
 * via the shared alaric client, and returns the markets list to the picker.
 *
 * Default behaviour: filters to `platform=spotify` (drops markets where
 * Spotify Ads is `unsupported`; `empty` markets stay because Spotify may
 * still operate there). Pass `?showAll=true` to skip the filter — useful
 * for greenfield brand workflows that need the full geopolitical list.
 *
 * Auth: NextAuth session (same as the rest of the app).
 *
 * Caching: alaric ships `Cache-Control: max-age=60, s-maxage=300, swr=300`
 * on its side; we don't add another layer. Reference data churns slowly
 * and the HTTP cache layer is sufficient.
 *
 * Failure mode: alaric unreachable or misconfigured → 502 with the error
 * text. Markets list is non-essential for generation — absence falls back
 * to legacy `selectedRegion` semantics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { alaric, AlaricRequestError } from "@/lib/alaric-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await requireAuth();

  const url = new URL(req.url);
  const showAll = url.searchParams.get("showAll") === "true";

  try {
    const response = await alaric.getMarkets(
      showAll ? {} : { platform: "spotify" },
    );
    return NextResponse.json(response, {
      // Mirror alaric's caching posture so our edge layer can also benefit
      // when called from the brief panel multiple times in quick succession.
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    if (err instanceof AlaricRequestError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.status === 401 ? 502 : err.status },
      );
    }
    console.error("[/api/markets] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "markets fetch failed" },
      { status: 502 },
    );
  }
}
