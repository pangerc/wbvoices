export const runtime = "nodejs";

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import {
  FILE_CONFIGS,
  isUploadFileType,
  uploadPath,
  validateUpload,
} from "@/lib/upload-configs";
import { userSfxFolder } from "@/lib/user-assets";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Generate a client upload token for direct Vercel Blob upload.
 * This bypasses the 4.5MB Vercel Serverless Function body limit.
 * Same pattern as /api/upload-mixed-audio-token.
 *
 * A sound effect belongs to the user, not the ad: it lands in their User
 * Assets folder, the only place `/api/sfx/upload` will validate it from. Its
 * token is scoped to that one pathname, so the browser can't write anywhere
 * else with it.
 */
export async function POST(req: NextRequest) {
  try {
    const { fileType, projectId, contentType, fileSize, originalFilename } =
      await req.json();

    if (!isUploadFileType(fileType)) {
      return NextResponse.json(
        { error: "Invalid file type", allowedTypes: Object.keys(FILE_CONFIGS) },
        { status: 400 },
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 },
      );
    }

    const invalid = validateUpload({ fileType, contentType, fileSize });
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    if (fileType === "custom-sfx") {
      const { email } = await requireAuth();
      const config = FILE_CONFIGS[fileType];
      const filename = uploadPath({
        fileType,
        projectId,
        ownerPrefix: userSfxFolder(email),
        originalFilename,
        timestamp: Date.now(),
      });
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname: filename,
        maximumSizeInBytes: config.maxSize,
      });

      return NextResponse.json({ filename, token });
    }

    const filename = uploadPath({
      fileType,
      projectId,
      originalFilename,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      filename,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Failed to generate upload token:", error);
    return NextResponse.json(
      { error: "Failed to generate upload token" },
      { status: 500 },
    );
  }
}
