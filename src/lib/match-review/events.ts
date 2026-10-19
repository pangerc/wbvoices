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
import { sql } from "drizzle-orm";
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
 * True when an error is Postgres "undefined_table" (42P01) — the
 * `match_review_events` table hasn't been created on this env (migration 0006
 * not applied). Drizzle wraps the driver error, so walk the `cause` chain.
 */
export function isMissingEventsTableError(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (e.code === "42P01") return true;
    if (
      e.message &&
      /relation "?match_review_events"? does not exist/i.test(e.message)
    ) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

/**
 * Create the `match_review_events` table + indexes if they don't exist.
 * Idempotent — mirrors `drizzle/migrations/0006_match_review_events.sql` so an
 * unmigrated env self-provisions on first write/read instead of 500ing.
 */
export async function ensureMatchReviewEventsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "match_review_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "ad_id" text NOT NULL,
      "job_id" text,
      "owner_email" text,
      "dimension" text NOT NULL,
      "matched" boolean DEFAULT false NOT NULL,
      "severity" text,
      "expected" text,
      "actual" text,
      "improvement_id" text,
      "event" text NOT NULL,
      "apply_method" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "match_review_events_created_at_idx" ON "match_review_events" ("created_at")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "match_review_events_ad_idx" ON "match_review_events" ("ad_id")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "match_review_events_dimension_idx" ON "match_review_events" ("dimension")`,
  );
}

/** Insert rows, self-provisioning the table once if the migration hasn't run. */
async function insertEvents(rows: EventRow[]): Promise<void> {
  try {
    await db.insert(matchReviewEvents).values(rows);
  } catch (err) {
    if (isMissingEventsTableError(err)) {
      await ensureMatchReviewEventsTable();
      await db.insert(matchReviewEvents).values(rows);
    } else {
      throw err;
    }
  }
}

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
    await insertEvents(rows);
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
    await insertEvents([
      {
        adId: ctx.adId,
        jobId: ctx.jobId ?? null,
        ownerEmail: ctx.ownerEmail ?? null,
        dimension: args.dimension,
        matched: false,
        improvementId: args.improvementId,
        event: "applied",
        applyMethod: args.method,
      },
    ]);
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
