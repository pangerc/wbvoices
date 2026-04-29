/**
 * POST /api/brand-context
 *
 * Single discriminated-union endpoint for all brand-related lookups in the
 * brief panel. Replaces /api/sf-accounts/search (kind: "search") and
 * /api/brands/recent (kind: "greenfield"), and adds a one-shot
 * sf-account → BrandRef + dossier path so the picker doesn't have to
 * orchestrate two round-trips on every brand pick.
 *
 * Discriminated by `kind`:
 *   - "sf-account"          → resolve picked SF account; returns BrandRef +
 *                             dossier projection; the dossier is the same
 *                             shape `prefetchBriefEnrichments` embeds into
 *                             the LLM user message (single source of truth).
 *   - "search"              → SOQL-LIKE search; returns candidates.
 *                             Defaults clientPlatforms=["spotify"] like the
 *                             v3.5 picker; pass empty array to bypass.
 *   - "greenfield"          → user's recent brands aggregated from their
 *                             ad history. Used when the user is starting
 *                             from scratch (no SF account picked yet).
 *   - "spotify-ad-manager"  → 501 today; sealed-enum slot reserved for
 *                             future SAM ingestion. Schema reserved so we
 *                             don't repaint when SAM lands.
 *
 * Auth: NextAuth session.
 *
 * Failure mode: alaric unreachable → returns 502 with error text. Brand
 * picker is non-essential for generation — failures degrade to manual
 * brand entry, not blocked.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-helpers";
import {
  alaric,
  AlaricRequestError,
  type BrandDossier,
  type SfAccountSearchResult,
} from "@/lib/alaric-client";
import { getRedisV3 } from "@/lib/redis-v3";
import { getAdMetadataBatch } from "@/lib/redis/versions";
import type { BrandRef, ProjectBrief } from "@/types";
import type { AdMetadata } from "@/types/versions";

export const runtime = "nodejs";

const USER_ADS_KEY = (email: string) => `ads:by_user:${email}`;
const RECENTS_DEFAULT_LIMIT = 10;
const RECENTS_MAX_LIMIT = 50;

// ============ Request / Response shapes ============

export type BrandContextRequest =
  | {
      kind: "sf-account";
      accountId: string;
      marketAlpha2?: string;
    }
  | {
      kind: "search";
      query: string;
      marketAlpha2?: string;
      clientPlatforms?: string[];
      limit?: number;
    }
  | {
      kind: "greenfield";
      marketAlpha2?: string;
      limit?: number;
    }
  | {
      kind: "spotify-ad-manager";
      campaignId: string;
      marketAlpha2?: string;
    };

export interface BrandContextResponse {
  brand: BrandRef | null;
  candidates?: SfAccountSearchResult[];
  recents?: BrandRef[];
  dossier: BrandDossier | null;
  enrichmentSummary?: {
    slotCount: number;
    lastEnrichedAt?: number;
  };
}

// ============ Per-kind handlers ============

async function handleSfAccount(
  accountId: string
): Promise<BrandContextResponse> {
  const bundle = await alaric.getSfClient(accountId);

  const brand: BrandRef = {
    name: bundle.account.Name,
    salesforceAccountId: bundle.account.Id,
    salesforceAccountSnapshot: {
      id: bundle.account.Id,
      name: bundle.account.Name,
      industry: bundle.account.Industry,
    },
  };

  const dossier = bundle.dossier;
  const enrichmentSummary = dossier
    ? {
        slotCount: dossier.meta.reportTypesPresent.length,
        lastEnrichedAt: dossier.meta.lastEnrichedAt,
      }
    : undefined;

  return { brand, dossier, enrichmentSummary };
}

// alaric's /api/aca/sf-search validates `market` against /^[A-Za-z]{2}$/
// and 400s on anything else. Legacy ads can carry non-alpha-2 values in
// `selectedRegion` (pre-v4 voice-region taxonomy like "us-east"); silently
// drop those rather than break the picker. User re-picking the market
// promotes to a real alpha-2.
const ALPHA2_RE = /^[A-Za-z]{2}$/;

async function handleSearch(
  query: string,
  opts: { clientPlatforms?: string[]; limit?: number; marketAlpha2?: string }
): Promise<BrandContextResponse> {
  // Default to spotify-only filtering, matching the v3.5 picker UX. Pass
  // an empty array to skip the filter (the brief panel's "Show all" toggle).
  const clientPlatforms =
    opts.clientPlatforms === undefined ? ["spotify"] : opts.clientPlatforms;

  const market =
    opts.marketAlpha2 && ALPHA2_RE.test(opts.marketAlpha2)
      ? opts.marketAlpha2
      : undefined;

  const candidates = await alaric.searchSfAccounts(query, {
    ...(opts.limit ? { limit: opts.limit } : {}),
    ...(clientPlatforms.length > 0 ? { clientPlatforms } : {}),
    ...(market ? { market } : {}),
  });

  return { brand: null, candidates, dossier: null };
}

async function handleGreenfield(
  email: string,
  limit: number
): Promise<BrandContextResponse> {
  const redis = getRedisV3();
  const adIds = (await redis.get<string[]>(USER_ADS_KEY(email))) || [];

  if (adIds.length === 0) {
    return { brand: null, recents: [], dossier: null };
  }

  const metadataMap = await getAdMetadataBatch(adIds);
  const metas = Array.from(metadataMap.values());
  const recents = aggregateRecents(metas, limit);

  return { brand: null, recents, dossier: null };
}

// ============ Recents aggregation ============

function deriveBrandName(brief: ProjectBrief | undefined): string | null {
  if (!brief) return null;

  const explicit = brief.brand?.name;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const snapshotName = brief.brand?.salesforceAccountSnapshot?.name;
  if (typeof snapshotName === "string" && snapshotName.trim()) {
    return snapshotName.trim();
  }

  // clientDescription is free text; first capitalised run is usually brand.
  const desc = brief.clientDescription?.trim();
  if (desc) {
    const cleaned = desc.replace(/^[^A-Za-zÀ-ɏ]+/, "");
    const tokens = cleaned.split(/\s+/);
    const leading: string[] = [];
    for (const tok of tokens) {
      if (!tok) continue;
      const first = tok.charAt(0);
      if (first === first.toUpperCase() && /[A-Za-zÀ-ɏ]/.test(first)) {
        leading.push(tok.replace(/[^\w&'-]+$/, ""));
        if (leading.length >= 4) break;
      } else {
        break;
      }
    }
    if (leading.length > 0) return leading.join(" ");
    return tokens.slice(0, 3).join(" ");
  }

  return null;
}

function effectiveSfId(brief: ProjectBrief | undefined): string | null {
  if (!brief) return null;
  return brief.brand?.salesforceAccountId ?? brief.salesforceAccountId ?? null;
}

function effectiveSfSnapshot(
  brief: ProjectBrief | undefined
): BrandRef["salesforceAccountSnapshot"] {
  if (!brief) return null;
  return brief.brand?.salesforceAccountSnapshot ?? null;
}

function aggregateRecents(metas: AdMetadata[], limit: number): BrandRef[] {
  const sorted = [...metas].sort((a, b) => b.lastModified - a.lastModified);

  const byKey = new Map<string, BrandRef>();
  for (const meta of sorted) {
    const brief = meta.brief;
    const name = deriveBrandName(brief);
    if (!name) continue;

    const key = name.toLowerCase();
    if (byKey.has(key)) continue;

    byKey.set(key, {
      name,
      salesforceAccountId: effectiveSfId(brief),
      salesforceAccountSnapshot: effectiveSfSnapshot(brief),
    });
    if (byKey.size >= limit) break;
  }

  return Array.from(byKey.values());
}

// ============ Route handler ============

export async function POST(req: NextRequest) {
  let body: BrandContextRequest;
  try {
    body = (await req.json()) as BrandContextRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || !("kind" in body)) {
    return NextResponse.json(
      { error: "missing 'kind' discriminator" },
      { status: 400 }
    );
  }

  try {
    const { email } = await requireAuth();

    switch (body.kind) {
      case "sf-account": {
        if (!body.accountId || typeof body.accountId !== "string") {
          return NextResponse.json(
            { error: "accountId required for kind=sf-account" },
            { status: 400 }
          );
        }
        const result = await handleSfAccount(body.accountId);
        return NextResponse.json(result);
      }

      case "search": {
        if (!body.query || body.query.trim().length < 2) {
          return NextResponse.json(
            { error: "query must be at least 2 characters" },
            { status: 400 }
          );
        }
        let limit: number | undefined;
        if (body.limit !== undefined) {
          const n = Number(body.limit);
          if (Number.isFinite(n) && n >= 1 && n <= 50) limit = Math.floor(n);
        }
        const result = await handleSearch(body.query, {
          ...(body.clientPlatforms !== undefined
            ? { clientPlatforms: body.clientPlatforms }
            : {}),
          ...(limit !== undefined ? { limit } : {}),
          ...(body.marketAlpha2 ? { marketAlpha2: body.marketAlpha2 } : {}),
        });
        return NextResponse.json(result);
      }

      case "greenfield": {
        let limit = RECENTS_DEFAULT_LIMIT;
        if (body.limit !== undefined) {
          const n = Number(body.limit);
          if (Number.isFinite(n) && n >= 1 && n <= RECENTS_MAX_LIMIT) {
            limit = Math.floor(n);
          }
        }
        const result = await handleGreenfield(email, limit);
        return NextResponse.json(result);
      }

      case "spotify-ad-manager": {
        // Sealed-enum reservation. SAM ingestion not yet implemented.
        return NextResponse.json(
          {
            error: "spotify-ad-manager kind not yet implemented",
            kind: body.kind,
          },
          { status: 501 }
        );
      }

      default: {
        // Exhaustiveness check — TypeScript will error if a new kind
        // is added to BrandContextRequest without a handler here.
        const _exhaustive: never = body;
        return NextResponse.json(
          { error: "unknown kind", got: _exhaustive },
          { status: 400 }
        );
      }
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    if (err instanceof AlaricRequestError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.status === 401 ? 502 : err.status }
      );
    }
    console.error("[/api/brand-context] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "brand-context failed" },
      { status: 500 }
    );
  }
}
