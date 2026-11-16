/**
 * GET /api/sfx/library — the caller's reusable sound effects.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

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

const mockListSfx = vi.fn();
vi.mock("@/database/user-assets", () => ({
  userAssets: {
    listSfx: (email: string, options: unknown) => mockListSfx(email, options),
  },
}));

const BLOB = "https://store.public.blob.vercel-storage.com";

/** A library request, with `search` as its `?q=` when given. */
function libraryRequest(search?: string) {
  const url = new URL("http://localhost/api/sfx/library");
  if (search !== undefined) url.searchParams.set("q", search);

  // A real NextRequest: the route reads `nextUrl`, which a plain Request lacks.
  return new NextRequest(url);
}

describe("GET /api/sfx/library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ email: "owner@example.com" });
    mockListSfx.mockResolvedValue({ assets: [], hasMore: false });
  });

  it("lists only the caller's assets, in the order the store returns them", async () => {
    mockListSfx.mockResolvedValue({
      assets: [
        {
          id: "asset-2",
          path: `${BLOB}/user-assets/abc/sfx/2.wav`,
          filename: "Brand sting.wav",
          durationSeconds: 1.5,
          createdAt: new Date("2026-11-03T10:00:00Z"),
        },
        {
          id: "asset-1",
          path: `${BLOB}/user-assets/abc/sfx/1.mp3`,
          filename: "Whoosh.mp3",
          durationSeconds: 0.8,
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      ],
      hasMore: false,
    });

    const response = await GET(libraryRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListSfx).toHaveBeenCalledWith("owner@example.com", {
      query: "",
      limit: 50,
    });
    expect(body).toEqual({
      assets: [
        {
          assetId: "asset-2",
          url: `${BLOB}/user-assets/abc/sfx/2.wav`,
          filename: "Brand sting.wav",
          durationSeconds: 1.5,
          createdAt: "2026-11-03T10:00:00.000Z",
        },
        {
          assetId: "asset-1",
          url: `${BLOB}/user-assets/abc/sfx/1.mp3`,
          filename: "Whoosh.mp3",
          durationSeconds: 0.8,
          createdAt: "2026-11-01T10:00:00.000Z",
        },
      ],
      hasMore: false,
    });
  });

  it("passes the trimmed search through and reports older matches", async () => {
    mockListSfx.mockResolvedValue({ assets: [], hasMore: true });

    const response = await GET(libraryRequest("  sting  "));
    const body = await response.json();

    expect(mockListSfx).toHaveBeenCalledWith("owner@example.com", {
      query: "sting",
      limit: 50,
    });
    expect(body.hasMore).toBe(true);
  });

  it("caps an overlong search", async () => {
    await GET(libraryRequest("x".repeat(1000)));

    expect(mockListSfx).toHaveBeenCalledWith("owner@example.com", {
      query: "x".repeat(255),
      limit: 50,
    });
  });

  it("refuses an anonymous caller without touching the store", async () => {
    const { AuthError } = await import("@/lib/auth-helpers");
    mockRequireAuth.mockRejectedValue(new AuthError("Not authenticated", 401));

    const response = await GET(libraryRequest());

    expect(response.status).toBe(401);
    expect(mockListSfx).not.toHaveBeenCalled();
  });
});
