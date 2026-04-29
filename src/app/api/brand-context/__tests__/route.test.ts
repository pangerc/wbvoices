/**
 * Smoke tests for POST /api/brand-context — the unified brand-lookup
 * endpoint that folds SF search, recents, and dossier resolution into
 * one discriminated-union route. Each `kind` is exercised end-to-end
 * with mocked alaric + auth so the response shape stays in lockstep
 * with the BrandContextResponse type.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { createMockRequest, createMockRedis } from "@/test/utils";

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

const mockSearchSfAccounts = vi.fn();
const mockGetSfClient = vi.fn();

vi.mock("@/lib/alaric-client", () => ({
  alaric: {
    searchSfAccounts: (q: string, opts: unknown) =>
      mockSearchSfAccounts(q, opts),
    getSfClient: (id: string) => mockGetSfClient(id),
  },
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

let mockRedis: ReturnType<typeof createMockRedis>;
vi.mock("@/lib/redis-v3", () => ({
  getRedisV3: () => mockRedis,
}));

const mockGetAdMetadataBatch = vi.fn();
vi.mock("@/lib/redis/versions", () => ({
  getAdMetadataBatch: (ids: string[]) => mockGetAdMetadataBatch(ids),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis = createMockRedis();
});

describe("POST /api/brand-context", () => {
  it("kind=search returns candidates with default Spotify-only filter", async () => {
    mockSearchSfAccounts.mockResolvedValueOnce([
      { id: "001", name: "Spotify Test Co", website: null, industry: "Tech" },
    ]);
    const req = createMockRequest({
      method: "POST",
      body: { kind: "search", query: "spot" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockSearchSfAccounts).toHaveBeenCalledWith(
      "spot",
      expect.objectContaining({ clientPlatforms: ["spotify"] }),
    );
    const body = await res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.brand).toBeNull();
    expect(body.dossier).toBeNull();
  });

  it("kind=search bypasses filter when clientPlatforms=[]", async () => {
    mockSearchSfAccounts.mockResolvedValueOnce([]);
    const req = createMockRequest({
      method: "POST",
      body: { kind: "search", query: "redbull", clientPlatforms: [] },
    });
    await POST(req as never);
    expect(mockSearchSfAccounts).toHaveBeenCalledWith(
      "redbull",
      expect.not.objectContaining({ clientPlatforms: expect.anything() }),
    );
  });

  it("kind=search returns 400 when query is too short", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { kind: "search", query: "x" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("kind=sf-account returns BrandRef + dossier + enrichmentSummary", async () => {
    mockGetSfClient.mockResolvedValueOnce({
      account: {
        Id: "001",
        Name: "Heineken Bulgaria",
        Website: null,
        Industry: "Beverages",
        Description: null,
        BillingCountry: "BG",
        Status__c: null,
      },
      intelligence: null,
      intelligenceAge: null,
      alaricProfile: null,
      dossier: {
        identity: { name: "Heineken Bulgaria", market: "BG" },
        commercial: {},
        creative: {},
        competitive: {},
        audience: {},
        policy: {},
        meta: {
          state: "rich",
          lastEnrichedAt: 1234567890,
          reportTypesPresent: ["companies", "voicebox", "creatives"],
        },
      },
    });

    const req = createMockRequest({
      method: "POST",
      body: { kind: "sf-account", accountId: "001" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brand?.name).toBe("Heineken Bulgaria");
    expect(body.brand?.salesforceAccountId).toBe("001");
    expect(body.dossier?.meta.state).toBe("rich");
    expect(body.enrichmentSummary?.slotCount).toBe(3);
    expect(body.enrichmentSummary?.lastEnrichedAt).toBe(1234567890);
  });

  it("kind=sf-account returns 400 when accountId missing", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { kind: "sf-account" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("kind=greenfield returns recents aggregated from user's ad history", async () => {
    await mockRedis.set(
      "ads:by_user:test@alephdigital.com",
      JSON.stringify(["ad1", "ad2"]),
    );
    mockGetAdMetadataBatch.mockResolvedValueOnce(
      new Map([
        [
          "ad1",
          {
            name: "First Ad",
            brief: {
              clientDescription: "Heineken Bulgaria summer push",
              brand: { name: "Heineken", salesforceAccountId: "001" },
            },
            createdAt: 1000,
            lastModified: 2000,
            owner: "test@alephdigital.com",
          },
        ],
        [
          "ad2",
          {
            name: "Second Ad",
            brief: {
              clientDescription: "Coca Cola DACH",
              brand: { name: "Coca Cola" },
            },
            createdAt: 1500,
            lastModified: 2500,
            owner: "test@alephdigital.com",
          },
        ],
      ]),
    );

    const req = createMockRequest({
      method: "POST",
      body: { kind: "greenfield" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recents).toHaveLength(2);
    // Most recently modified first
    expect(body.recents[0].name).toBe("Coca Cola");
    expect(body.recents[1].name).toBe("Heineken");
  });

  it("kind=spotify-ad-manager returns 501 (sealed reservation)", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { kind: "spotify-ad-manager", campaignId: "cmp_123" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(501);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/brand-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'kind' is missing", async () => {
    const req = createMockRequest({ method: "POST", body: { foo: "bar" } });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
