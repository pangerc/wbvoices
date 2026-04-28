/**
 * GET /api/sf-accounts/search?q=<query>&limit=<n>
 *
 * Browser-callable proxy that forwards SF Account name searches to alaric.
 * The browser can't sign HMAC requests directly (shared-secret exposure +
 * CORS) — this endpoint runs server-side, signs via the shared alaric
 * client, and returns the hits to the brief picker UI.
 *
 * Auth: NextAuth session (same as the rest of the app). Out-of-session
 * callers go through the normal redirect.
 *
 * Failure mode: alaric unreachable or misconfigured → returns the error
 * text + an HTTP status from alaric. The picker UI is non-essential —
 * absence of SF doesn't block the user from generating a brief.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { alaric, AlaricRequestError } from "@/lib/alaric-client";

export async function GET(req: NextRequest) {
  // Session-gated like every other ACA endpoint.
  await requireAuth();

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const limitParam = url.searchParams.get("limit");
  const clientPlatformsParam = url.searchParams.get("clientPlatforms");

  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { error: "q must be at least 2 characters" },
      { status: 400 }
    );
  }

  let limit: number | undefined;
  if (limitParam) {
    const n = Number(limitParam);
    if (Number.isFinite(n) && n >= 1 && n <= 50) limit = Math.floor(n);
  }

  // Comma-separated platform filter, forwarded to alaric. The picker UI
  // defaults to "spotify" so reps don't see non-Spotify accounts; an
  // explicit empty value (or the param being omitted) requests the
  // unfiltered SF search.
  let clientPlatforms: string[] | undefined;
  if (clientPlatformsParam) {
    const tokens = clientPlatformsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tokens.length > 0) clientPlatforms = tokens;
  }

  try {
    const hits = await alaric.searchSfAccounts(q, {
      ...(limit ? { limit } : {}),
      ...(clientPlatforms ? { clientPlatforms } : {}),
    });
    return NextResponse.json({ hits });
  } catch (err) {
    if (err instanceof AlaricRequestError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.status === 401 ? 502 : err.status }
      );
    }
    console.error("[/api/sf-accounts/search] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search failed" },
      { status: 502 }
    );
  }
}
