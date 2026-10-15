/**
 * AI Match-Review (AAC-255) — event persistence + orchestration.
 *
 * Writes the append-only `match_review_events` rows that power the stats page,
 * and offers `runMatchReview` which runs the deterministic review and records
 * its findings in one call. Every write is best-effort and non-throwing: a
 * match-review failure must never break generation.
 */

import { db } from "@/lib/db";
import { matchReviewEvents } from "@/lib/db/schema";
import { reviewWithCritic } from "./critic";
import { reviewDeterministic } from "./deterministic";
import type { MatchFinding, ReviewBrief, ReviewResult } from "./types";

export interface MatchReviewContext {
  adId: string;
  jobId?: string | null;
  ownerEmail?: string | null;
}

type EventRow = typeof matchReviewEvents.$inferInsert;

/**
 * Record a completed review: one `mismatch` row per failed dimension plus one
 * `proposed` row per improvement card shown. No-op when there are no findings.
 */
export async function recordMatchReview(
  ctx: MatchReviewContext,
  findings: MatchFinding[],
): Promise<void> {
  if (!findings.length) return;

  const rows: EventRow[] = [];
  for (const f of findings) {
    rows.push({
      adId: ctx.adId,
      jobId: ctx.jobId ?? null,
      ownerEmail: ctx.ownerEmail ?? null,
      dimension: f.dimension,
      matched: false,
      severity: f.severity,
      expected: f.expected ?? null,
      actual: f.actual ?? null,
      event: "mismatch",
    });
    for (const imp of f.improvements) {
      rows.push({
        adId: ctx.adId,
        jobId: ctx.jobId ?? null,
        ownerEmail: ctx.ownerEmail ?? null,
        dimension: f.dimension,
        matched: false,
        severity: f.severity,
        improvementId: imp.id,
        event: "proposed",
      });
    }
  }

  try {
    await db.insert(matchReviewEvents).values(rows);
  } catch (err) {
    console.warn("[match-review] failed to record events:", err);
  }
}

/** Record that the user applied an improvement (by click or resolved manually). */
export async function recordImprovementApplied(
  ctx: MatchReviewContext,
  args: {
    dimension: string;
    improvementId: string;
    method: "click" | "manual";
  },
): Promise<void> {
  try {
    await db.insert(matchReviewEvents).values({
      adId: ctx.adId,
      jobId: ctx.jobId ?? null,
      ownerEmail: ctx.ownerEmail ?? null,
      dimension: args.dimension,
      matched: false,
      improvementId: args.improvementId,
      event: "applied",
      applyMethod: args.method,
    });
  } catch (err) {
    console.warn("[match-review] failed to record applied event:", err);
  }
}

/**
 * Run the full review (deterministic + AI critic) and persist its events.
 * Returns the merged findings so the caller can surface them in the UI. Never
 * throws. The critic is best-effort (returns [] on any failure / when no soft
 * dimension applies) and its findings — on disjoint soft dimensions — are merged
 * with the deterministic ones, de-duped by dimension (deterministic wins).
 */
export async function runMatchReview(
  ctx: MatchReviewContext,
  brief: ReviewBrief,
  result: ReviewResult,
): Promise<MatchFinding[]> {
  let findings: MatchFinding[] = [];
  try {
    const deterministic = reviewDeterministic(brief, result);
    const critic = await reviewWithCritic(brief, result);
    const seen = new Set(deterministic.map((f) => f.dimension));
    findings = [
      ...deterministic,
      ...critic.filter((f) => !seen.has(f.dimension)),
    ];
    await recordMatchReview(ctx, findings);
  } catch (err) {
    console.warn("[match-review] runMatchReview failed:", err);
  }
  return findings;
}
