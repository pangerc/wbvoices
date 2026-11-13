/**
 * POST /api/sfx/upload — only a validated upload joins the user's library,
 * and the same bytes never join it twice.
 */

import { createMockRequest } from "@/test/utils";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const EMAIL = "owner@example.com";
const FOLDER = "user-assets/abc/sfx";
const BLOB = "https://store.public.blob.vercel-storage.com";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(async () => ({ email: EMAIL })),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/user-assets", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/user-assets")>()),
  userSfxFolder: () => FOLDER,
}));

/** SHA-256 of the 1024 zero bytes the mocked storage returns. */
const STORED_HASH = createHash("sha256")
  .update(new Uint8Array(1024))
  .digest("hex");

const mockReadBlobBytes = vi.fn(async (_url: string) => new Uint8Array(1024));
vi.mock("@/utils/blob-storage", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/blob-storage")>()),
  readBlobBytes: (url: string) => mockReadBlobBytes(url),
}));

const mockDel = vi.fn(async (_url: string) => undefined);
vi.mock("@vercel/blob", () => ({
  del: (url: string) => mockDel(url),
}));

const mockValidateAudioFile = vi.fn();
vi.mock("@/lib/audio-validation", () => ({
  validateAudioFile: () => mockValidateAudioFile(),
}));

const mockRecordSfx = vi.fn();
vi.mock("@/database/user-assets", () => ({
  userAssets: { recordSfx: (asset: unknown) => mockRecordSfx(asset) },
}));

/** A validation request for a file in the caller's own folder. */
function uploadRequest(url = `${BLOB}/${FOLDER}/1.mp3`) {
  return createMockRequest({
    method: "POST",
    body: { url, filename: "  Whoosh.mp3  " },
  }) as unknown as NextRequest;
}

const PLAYABLE = { ok: true, format: "mp3", durationSeconds: 1.25 } as const;

describe("POST /api/sfx/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a playable upload in the owner's library and returns its id", async () => {
    mockValidateAudioFile.mockResolvedValue(PLAYABLE);
    mockRecordSfx.mockImplementation(async (asset) => ({
      ...asset,
      id: "asset-1",
      kind: "sfx",
      createdAt: new Date(),
    }));

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRecordSfx).toHaveBeenCalledWith({
      ownerEmail: EMAIL,
      path: `${BLOB}/${FOLDER}/1.mp3`,
      filename: "Whoosh.mp3",
      format: "mp3",
      sizeBytes: 1024,
      durationSeconds: 1.25,
      contentHash: STORED_HASH,
    });
    expect(body.upload).toEqual({
      assetId: "asset-1",
      url: `${BLOB}/${FOLDER}/1.mp3`,
      filename: "Whoosh.mp3",
      durationSeconds: 1.25,
    });
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("reuses the item already holding these bytes and deletes the new copy", async () => {
    mockValidateAudioFile.mockResolvedValue(PLAYABLE);
    mockRecordSfx.mockResolvedValue({
      id: "asset-0",
      kind: "sfx",
      path: `${BLOB}/${FOLDER}/0.mp3`,
      filename: "Original name.mp3",
      durationSeconds: 1.25,
      contentHash: STORED_HASH,
      createdAt: new Date(),
    });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDel).toHaveBeenCalledWith(`${BLOB}/${FOLDER}/1.mp3`);
    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(body.upload).toEqual({
      assetId: "asset-0",
      url: `${BLOB}/${FOLDER}/0.mp3`,
      filename: "Original name.mp3",
      durationSeconds: 1.25,
    });
  });

  it("keeps the file when a retried check returns the item at the same URL", async () => {
    mockValidateAudioFile.mockResolvedValue(PLAYABLE);
    mockRecordSfx.mockImplementation(async (asset) => ({
      ...asset,
      id: "asset-1",
      kind: "sfx",
      createdAt: new Date(),
    }));

    await POST(uploadRequest());
    await POST(uploadRequest());

    expect(mockDel).not.toHaveBeenCalled();
  });

  it("still answers with the existing item when deleting the duplicate fails", async () => {
    mockValidateAudioFile.mockResolvedValue(PLAYABLE);
    mockRecordSfx.mockResolvedValue({
      id: "asset-0",
      kind: "sfx",
      path: `${BLOB}/${FOLDER}/0.mp3`,
      filename: "Original name.mp3",
      durationSeconds: 1.25,
      contentHash: STORED_HASH,
      createdAt: new Date(),
    });
    mockDel.mockRejectedValueOnce(new Error("Blob down"));

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.upload.assetId).toBe("asset-0");
  });

  it("deletes a file that is not playable and never records it", async () => {
    mockValidateAudioFile.mockResolvedValue({
      ok: false,
      error: "This file is not a playable MP3, WAV or M4A file.",
    });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(422);
    expect(mockDel).toHaveBeenCalledWith(`${BLOB}/${FOLDER}/1.mp3`);
    expect(mockRecordSfx).not.toHaveBeenCalled();
  });

  it("refuses a file outside the caller's folder and never reads it", async () => {
    const response = await POST(
      uploadRequest(`${BLOB}/user-assets/other/sfx/1.mp3`),
    );

    expect(response.status).toBe(403);
    expect(mockReadBlobBytes).not.toHaveBeenCalled();
    expect(mockRecordSfx).not.toHaveBeenCalled();
  });

  it("refuses a URL that is not on a Vercel Blob store and never fetches it", async () => {
    const response = await POST(
      uploadRequest(`https://evil.example.com/${FOLDER}/1.mp3`),
    );

    expect(response.status).toBe(403);
    expect(mockReadBlobBytes).not.toHaveBeenCalled();
    expect(mockRecordSfx).not.toHaveBeenCalled();
  });

  it("refuses a URL with a malformed escape and never fetches it", async () => {
    const response = await POST(uploadRequest(`${BLOB}/${FOLDER}/%E0%A4%A`));

    expect(response.status).toBe(403);
    expect(mockReadBlobBytes).not.toHaveBeenCalled();
    expect(mockRecordSfx).not.toHaveBeenCalled();
  });
});
