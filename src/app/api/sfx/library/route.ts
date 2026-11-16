/**
 * The caller's sound-effect library — `GET /api/sfx/library?q=`
 *
 * Lists the sound effects the user has uploaded (and that passed validation in
 * `POST /api/sfx/upload`), newest first, so any of them can be reused in
 * another ad. Only the caller's own uploads are ever listed.
 *
 * `q` keeps only filenames containing it (case-insensitive). At most
 * {@link LIBRARY_PAGE_SIZE} are returned; `hasMore` says older matches were
 * left out, so the user can narrow the search to find them.
 *
 * Returns `{ assets, hasMore }`, each asset an `UploadedSfx` plus its ISO
 * `createdAt`.
 */
import { userAssets } from "@/database/user-assets";
import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The most assets one response lists. */
const LIBRARY_PAGE_SIZE = 50;

/** Longest search kept; filenames are capped at 255 characters anyway. */
const MAX_QUERY_LENGTH = 255;

export async function GET(request: NextRequest) {
  try {
    const { email } = await requireAuth();

    const query = (request.nextUrl.searchParams.get("q") ?? "")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);

    const { assets: rows, hasMore } = await userAssets.listSfx(email, {
      query,
      limit: LIBRARY_PAGE_SIZE,
    });
    const assets = rows.map((row) => ({
      assetId: row.id,
      url: row.path,
      filename: row.filename,
      durationSeconds: row.durationSeconds,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ assets, hasMore });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to load the SFX library:", error);
    return NextResponse.json(
      { error: "Failed to load your sound effects" },
      { status: 500 },
    );
  }
}
