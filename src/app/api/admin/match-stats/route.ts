/**
 * Match-review statistics (AAC-255)
 *
 * GET /api/admin/match-stats?granularity=day|month|year&dimension=&severity=&owner=
 *
 * Aggregates the append-only `match_review_events` log into time buckets so the
 * admin page can show, per day / month / year, how often the generated ad didn't
 * match the brief and how many improvement cards were proposed vs applied
 * (click vs manual). Admin-only is enforced by middleware (`/api/admin/*`);
 * `requireAuth()` here is defense-in-depth, matching the other admin routes.
 *
 * Rows are pulled and bucketed in JS (same approach as `ads/statistics`) — the
 * event log is append-only and this is a gated admin view.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { matchReviewEvents } from "@/lib/db/schema";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export type Granularity = "day" | "month" | "year";

export interface MatchStatsBreakdown {
  /** mismatch events grouped by dimension. */
  byDimension: Record<string, number>;
  /** mismatch events grouped by severity. */
  bySeverity: Record<string, number>;
  mismatches: number;
  proposed: number;
  applied: number;
  appliedClick: number;
  appliedManual: number;
}

export interface MatchStatsBucket extends MatchStatsBreakdown {
  /** "2026-10-15" (day) | "2026-10" (month) | "2026" (year) — UTC. */
  key: string;
}

export interface MatchStats {
  /** Buckets for each granularity (newest first), so the client can switch
   *  day/month/year without re-fetching. */
  byGranularity: Record<Granularity, MatchStatsBucket[]>;
  totals: MatchStatsBreakdown & {
    /** Most-applied improvements across the whole (filtered) range. */
    topImprovements: { improvementId: string; applied: number }[];
  };
}

const GRANULARITIES: Granularity[] = ["day", "month", "year"];

function emptyBreakdown(): MatchStatsBreakdown {
  return {
    byDimension: {},
    bySeverity: {},
    mismatches: 0,
    proposed: 0,
    applied: 0,
    appliedClick: 0,
    appliedManual: 0,
  };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/** UTC bucket key for a timestamp at the given granularity. */
function bucketKey(d: Date, g: Granularity): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (g === "year") return `${y}`;
  if (g === "month") return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

type EventRow = {
  createdAt: Date;
  event: string;
  dimension: string;
  severity: string | null;
  applyMethod: string | null;
  improvementId: string | null;
};

/** Fold one event row into a breakdown accumulator. */
function tally(b: MatchStatsBreakdown, row: EventRow) {
  switch (row.event) {
    case "mismatch":
      b.mismatches += 1;
      bump(b.byDimension, row.dimension);
      if (row.severity) bump(b.bySeverity, row.severity);
      break;
    case "proposed":
      b.proposed += 1;
      break;
    case "applied":
      b.applied += 1;
      if (row.applyMethod === "manual") b.appliedManual += 1;
      else b.appliedClick += 1;
      break;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const sp = request.nextUrl.searchParams;

    // Optional filters (supported for direct/API use; not yet surfaced in the UI).
    const dimension = sp.get("dimension")?.trim() || undefined;
    const severity = sp.get("severity")?.trim() || undefined;
    const owner = sp.get("owner")?.trim() || undefined;

    const conds: SQL[] = [];
    if (dimension) conds.push(eq(matchReviewEvents.dimension, dimension));
    if (severity) conds.push(eq(matchReviewEvents.severity, severity));
    if (owner) conds.push(eq(matchReviewEvents.ownerEmail, owner));

    const rows = (await db
      .select({
        createdAt: matchReviewEvents.createdAt,
        event: matchReviewEvents.event,
        dimension: matchReviewEvents.dimension,
        severity: matchReviewEvents.severity,
        applyMethod: matchReviewEvents.applyMethod,
        improvementId: matchReviewEvents.improvementId,
      })
      .from(matchReviewEvents)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(matchReviewEvents.createdAt))) as EventRow[];

    const maps: Record<Granularity, Map<string, MatchStatsBucket>> = {
      day: new Map(),
      month: new Map(),
      year: new Map(),
    };
    const totals = emptyBreakdown();
    const appliedById: Record<string, number> = {};

    for (const row of rows) {
      const date = new Date(row.createdAt);
      for (const g of GRANULARITIES) {
        const key = bucketKey(date, g);
        let bucket = maps[g].get(key);
        if (!bucket) {
          bucket = { key, ...emptyBreakdown() };
          maps[g].set(key, bucket);
        }
        tally(bucket, row);
      }
      tally(totals, row);
      if (row.event === "applied" && row.improvementId) {
        appliedById[row.improvementId] =
          (appliedById[row.improvementId] ?? 0) + 1;
      }
    }

    const byGranularity = Object.fromEntries(
      GRANULARITIES.map((g) => [
        g,
        [...maps[g].values()].sort((a, b) =>
          a.key < b.key ? 1 : a.key > b.key ? -1 : 0,
        ),
      ]),
    ) as Record<Granularity, MatchStatsBucket[]>;

    const topImprovements = Object.entries(appliedById)
      .map(([improvementId, applied]) => ({ improvementId, applied }))
      .sort((a, b) => b.applied - a.applied)
      .slice(0, 10);

    return NextResponse.json({
      byGranularity,
      totals: { ...totals, topImprovements },
    } satisfies MatchStats);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[match-stats] error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
