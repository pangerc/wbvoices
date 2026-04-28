/**
 * GET /api/brands/recent
 *
 * Per-user "Recent brands" feed for the BriefPanelV3 picker. Derives the
 * list from existing ad history — no parallel persistence layer for
 * brands. Each row carries the SF snapshot (when present) and the last
 * inheritable brief settings, so the client doesn't need a second
 * roundtrip when the user picks one.
 *
 * Source of truth:
 *   `ads:by_user:{ownerEmail}` (JSON array of adIds) → batch-mget each
 *   `ad:{adId}:meta` blob → project to brand info → dedupe by brand name.
 *
 * Backwards-compat: legacy briefs without `brand.name` get a derived name
 * from `salesforceAccountSnapshot.name`, then a heuristic on
 * `clientDescription`. Ads without any usable brand identity are skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisV3 } from "@/lib/redis-v3";
import { getAdMetadataBatch } from "@/lib/redis/versions";
import { requireAuth, AuthError } from "@/lib/auth-helpers";
import type { AdMetadata } from "@/types/versions";
import type {
  BrandRef,
  Language,
  ProjectBrief,
  ToneOfVoiceTag,
} from "@/types";

export const runtime = "nodejs";

const USER_ADS_KEY = (ownerEmail: string) => `ads:by_user:${ownerEmail}`;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Inheritable brief defaults — the brand-shaped axes that should be
 * sticky per client. NOT inheritable: provider, pacing, format
 * (per-spot A/B per user choice), and per-spot variance fields
 * (clientDescription, creativeBrief, creativeAngle, etc.).
 */
export interface InheritableBriefDefaults {
  toneOfVoice?: ToneOfVoiceTag[];
  brandVoice?: string | null;
  selectedLanguage?: Language;
  selectedRegion?: string | null;
  selectedAccent?: string | null;
  forbiddenWords?: string | null;
}

export interface RecentBrand {
  name: string;
  salesforceAccountId?: string | null;
  salesforceAccountSnapshot?: BrandRef["salesforceAccountSnapshot"];
  lastUsedAt: number;
  adCount: number;
  inheritable: InheritableBriefDefaults;
}

/**
 * Best-effort brand name derivation for legacy briefs that pre-date the
 * unified `brand` field. Order: explicit brand.name → SF snapshot name →
 * heuristic on clientDescription → null (skip the ad).
 */
function deriveBrandName(brief: ProjectBrief | undefined): string | null {
  if (!brief) return null;

  const explicit = brief.brand?.name;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const snapshotName = brief.brand?.salesforceAccountSnapshot?.name;
  if (typeof snapshotName === "string" && snapshotName.trim()) return snapshotName.trim();

  // clientDescription is free text. Common shapes we see in production
  // briefs: "Maybelline Create Your Beat", "Jack Daniels Playlist",
  // "Rapid KL Kembara". The first capitalised run is usually the brand.
  const desc = brief.clientDescription?.trim();
  if (desc) {
    const cleaned = desc.replace(/^[^A-Za-zÀ-ɏ]+/, "");
    const tokens = cleaned.split(/\s+/).slice(0, 5);
    if (tokens.length === 0) return null;
    const leading: string[] = [];
    for (const t of tokens) {
      if (/^[A-ZÀ-ɏ]/.test(t) || !/^[a-z]/.test(t)) {
        leading.push(t);
      } else {
        break;
      }
    }
    if (leading.length > 0) return leading.join(" ");
    return tokens.slice(0, 3).join(" ");
  }

  return null;
}

function pickInheritable(brief: ProjectBrief): InheritableBriefDefaults {
  const out: InheritableBriefDefaults = {};
  if (Array.isArray(brief.toneOfVoice) && brief.toneOfVoice.length) {
    out.toneOfVoice = brief.toneOfVoice;
  }
  if (typeof brief.brandVoice === "string" && brief.brandVoice.trim()) {
    out.brandVoice = brief.brandVoice;
  }
  if (brief.selectedLanguage) out.selectedLanguage = brief.selectedLanguage;
  if (brief.selectedRegion !== undefined && brief.selectedRegion !== null) {
    out.selectedRegion = brief.selectedRegion;
  }
  if (brief.selectedAccent) out.selectedAccent = brief.selectedAccent;
  if (typeof brief.forbiddenWords === "string" && brief.forbiddenWords.trim()) {
    out.forbiddenWords = brief.forbiddenWords;
  }
  return out;
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

/**
 * Aggregate ad metadatas into per-brand recents. Most recent ad wins for
 * the snapshot + inheritable; ad count is the total, not the dedup index.
 */
function aggregate(metas: AdMetadata[], limit: number): RecentBrand[] {
  const sorted = [...metas].sort((a, b) => b.lastModified - a.lastModified);

  const byKey = new Map<string, RecentBrand>();
  for (const meta of sorted) {
    const brief = meta.brief;
    const name = deriveBrandName(brief);
    if (!name) continue;

    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.adCount += 1;
      continue;
    }

    byKey.set(key, {
      name,
      salesforceAccountId: effectiveSfId(brief),
      salesforceAccountSnapshot: effectiveSfSnapshot(brief),
      lastUsedAt: meta.lastModified,
      adCount: 1,
      inheritable: brief ? pickInheritable(brief) : {},
    });
    if (byKey.size >= limit) break;
  }

  return Array.from(byKey.values());
}

export async function GET(req: NextRequest) {
  try {
    const { email } = await requireAuth();
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");

    let limit = DEFAULT_LIMIT;
    if (limitParam) {
      const n = Number(limitParam);
      if (Number.isFinite(n) && n >= 1 && n <= MAX_LIMIT) limit = Math.floor(n);
    }

    const redis = getRedisV3();
    const adIds = (await redis.get<string[]>(USER_ADS_KEY(email))) || [];

    if (adIds.length === 0) {
      return NextResponse.json({ brands: [] });
    }

    const metadataMap = await getAdMetadataBatch(adIds);
    const metas = Array.from(metadataMap.values());

    const brands = aggregate(metas, limit);
    return NextResponse.json({ brands });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/brands/recent] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed", brands: [] },
      { status: 500 }
    );
  }
}
