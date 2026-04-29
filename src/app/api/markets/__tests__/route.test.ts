/**
 * Smoke tests for GET /api/markets — the alaric proxy that surfaces the
 * canonical 86-market mapping to the brief panel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { createMockRequest } from "@/test/utils";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(async () => ({ email: "test@alephdigital.com" })),
  AuthError: class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockGetMarkets = vi.fn();
vi.mock("@/lib/alaric-client", () => ({
  alaric: { getMarkets: (opts: unknown) => mockGetMarkets(opts) },
  AlaricRequestError: class AlaricRequestError extends Error {
    status: number;
    body?: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

const mockResponse = {
  markets: [
    {
      code: "SI",
      name: "Slovenia",
      region: "Southern Europe",
      aliases: ["slovenian"],
      tld: ".si",
      platformCoverage: { spotify: "available" },
      language: {
        code: "sl",
        name: "Slovenian",
        script: "latin",
        commerceVocabulary: ["nakup"],
        legalDescriptors: [],
      },
    },
  ],
  totalCount: 1,
  generatedAt: "2026-04-29T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMarkets.mockResolvedValue(mockResponse);
});

describe("GET /api/markets", () => {
  it("defaults to platform=spotify when no query param", async () => {
    const res = await GET(
      createMockRequest({ url: "http://localhost/api/markets" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockGetMarkets).toHaveBeenCalledWith({ platform: "spotify" });
    const body = await res.json();
    expect(body.markets).toHaveLength(1);
    expect(body.markets[0].code).toBe("SI");
  });

  it("skips the platform filter when showAll=true", async () => {
    const res = await GET(
      createMockRequest({
        url: "http://localhost/api/markets?showAll=true",
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockGetMarkets).toHaveBeenCalledWith({});
  });

  it("returns 502 when alaric throws AlaricRequestError", async () => {
    const { AlaricRequestError } = await import("@/lib/alaric-client");
    mockGetMarkets.mockRejectedValueOnce(
      new AlaricRequestError("alaric down", 503),
    );
    const res = await GET(
      createMockRequest({ url: "http://localhost/api/markets" }) as never,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("alaric down");
  });

  it("includes Cache-Control header mirroring alaric's posture", async () => {
    const res = await GET(
      createMockRequest({ url: "http://localhost/api/markets" }) as never,
    );
    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(res.headers.get("Cache-Control")).toContain("stale-while-revalidate");
  });
});
