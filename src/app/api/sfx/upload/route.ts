/**
 * Validate an uploaded sound effect — `POST /api/sfx/upload`
 *
 * The second half of an upload. The browser first puts the file into Vercel
 * Blob with a token from `POST /api/upload-asset-token`, scoped to one pathname
 * in the user's User Assets folder; this route then reads the stored bytes back
 * and checks they are a complete, playable audio file. A file that fails is
 * deleted, so nothing unvalidated stays in the folder or reaches an ad. A file
 * that passes is added to the user's User Assets library, so it can be reused
 * in their other ads.
 *
 * A file whose bytes are already in the user's library isn't added twice: the
 * copy just uploaded is deleted and the existing item is returned as it is.
 *
 * JSON body: `{ url, filename }`. Returns `{ upload }` with the library entry
 * id and the measured duration.
 */
import { userAssets } from "@/database/user-assets";
import { validateAudioFile } from "@/lib/audio-validation";
import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { contentHashOf, userSfxFolder } from "@/lib/user-assets";
import type { UploadedSfx } from "@/types";
import { blobPathname, readBlobBytes } from "@/utils/blob-storage";
import { del } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email } = await requireAuth();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Expected a JSON body" },
        { status: 400 },
      );
    }
    const { url, filename } = (body ?? {}) as Record<string, unknown>;

    if (typeof url !== "string" || !url) {
      return NextResponse.json({ error: "`url` is required" }, { status: 400 });
    }
    if (typeof filename !== "string" || !filename.trim()) {
      return NextResponse.json(
        { error: "`filename` is required" },
        { status: 400 },
      );
    }

    // Only a file in our Blob store, directly inside the caller's own folder.
    // `/api/upload-asset-token` is the only thing that hands out tokens for
    // paths there, and only to their owner.
    const folder = `${userSfxFolder(email)}/`;
    const pathname = blobPathname(url) ?? "";
    const name = pathname.slice(folder.length);
    if (!pathname.startsWith(folder) || !name || name.includes("/")) {
      return NextResponse.json(
        { error: "That upload does not belong to you" },
        { status: 403 },
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await readBlobBytes(url);
    } catch (error) {
      console.error(`❌ Uploaded SFX "${pathname}" could not be read:`, error);
      return NextResponse.json(
        { error: "The upload was not found. Please try again." },
        { status: 404 },
      );
    }

    const validation = await validateAudioFile(bytes);
    if (!validation.ok) {
      console.warn(
        `🚫 Rejected uploaded SFX "${pathname}" (${filename}): ${validation.error}`,
      );
      await del(url).catch((error) =>
        console.error(`❌ Failed to delete rejected "${pathname}":`, error),
      );
      return NextResponse.json({ error: validation.error }, { status: 422 });
    }

    const asset = await userAssets.recordSfx({
      ownerEmail: email,
      path: url,
      filename: filename.trim().slice(0, 255),
      format: validation.format,
      sizeBytes: bytes.length,
      durationSeconds: validation.durationSeconds,
      contentHash: contentHashOf(bytes),
    });

    // Already in the library: the existing item wins, and the copy just
    // uploaded is unreferenced, so it goes.
    if (asset.path !== url) {
      console.log(
        `♻️ Uploaded SFX "${pathname}" (${filename}) duplicates "${asset.path}"; using that`,
      );
      await del(url).catch((error) =>
        console.error(`❌ Failed to delete duplicate "${pathname}":`, error),
      );
    }

    const upload: UploadedSfx = {
      assetId: asset.id,
      url: asset.path,
      filename: asset.filename,
      durationSeconds: asset.durationSeconds,
    };
    console.log(
      `🎵 Validated uploaded SFX "${pathname}" (${validation.format}, ${validation.durationSeconds.toFixed(2)}s)`,
    );
    return NextResponse.json({ upload });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("❌ Failed to validate uploaded SFX:", error);
    return NextResponse.json(
      { error: "Failed to check your upload" },
      { status: 500 },
    );
  }
}
