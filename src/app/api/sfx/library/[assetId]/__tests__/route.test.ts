/**
 * DELETE /api/sfx/library/{assetId} — removes the caller's own library entry,
 * never another user's, and never the stored file.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../route";

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: () => mockRequireAuth(),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockDeleteSfx = vi.fn();
vi.mock("@/database/user-assets", () => ({
  userAssets: {
    deleteSfx: (email: string, id: string) => mockDeleteSfx(email, id),
  },
}));

const mockDel = vi.fn();
vi.mock("@vercel/blob", () => ({
  del: (url: string) => mockDel(url),
}));

function remove(assetId: string) {
  return DELETE(
    new NextRequest(`http://localhost/api/sfx/library/${assetId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ assetId }) },
  );
}

describe("DELETE /api/sfx/library/{assetId}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ email: "owner@example.com" });
  });

  it("removes the caller's item and leaves its file alone", async () => {
    mockDeleteSfx.mockResolvedValue(true);

    const response = await remove("asset-1");

    expect(response.status).toBe(200);
    expect(mockDeleteSfx).toHaveBeenCalledWith("owner@example.com", "asset-1");
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("answers 404 for an item the caller doesn't own", async () => {
    mockDeleteSfx.mockResolvedValue(false);

    const response = await remove("someone-elses");

    expect(response.status).toBe(404);
  });

  it("refuses an anonymous caller without touching the library", async () => {
    const { AuthError } = await import("@/lib/auth-helpers");
    mockRequireAuth.mockRejectedValue(new AuthError("Not authenticated", 401));

    const response = await remove("asset-1");

    expect(response.status).toBe(401);
    expect(mockDeleteSfx).not.toHaveBeenCalled();
  });
});
