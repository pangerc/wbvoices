/**
 * Leftovers of deleted ads (Admin → Fixes).
 *
 * Deleting an ad used to keep its id in the `ads:all` / `ads:by_user:*`
 * indexes, plus some of its keys. Every dashboard load then fetched and
 * skipped those ids ("does not have meta field").
 *
 * GET  /api/admin/ads-leftovers - Dry run: what would be removed.
 * POST /api/admin/ads-leftovers - Remove it, and return what was removed.
 */

import { AuthError, requireAuth } from "@/lib/auth-helpers";
import { recordAudit } from "@/lib/backup/audit";
import { purgeAdLeftovers, type AdLeftovers } from "@/lib/backup/importers";
import { isMigrationInProgress } from "@/lib/redis/migrationLock";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Totals per category, for the audit log. */
function countsOf(leftovers: AdLeftovers): Record<string, number> {
  return {
    allIndex: leftovers.allIndex.length,
    userIndexes: Object.values(leftovers.userIndexes).flat().length,
    strayKeys: leftovers.strayKeys.length,
  };
}

async function requireAdmin(): Promise<string> {
  const { email, role } = await requireAuth();
  if (role !== "admin") {
    throw new AuthError("Admin role required", 403);
  }
  return email;
}

function errorResponse(error: unknown, action: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error(`❌ ads-leftovers ${action} failed:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : `${action} failed` },
    { status: 500 },
  );
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await purgeAdLeftovers({ dryRun: true }));
  } catch (error) {
    return errorResponse(error, "Check");
  }
}

export async function POST() {
  try {
    const email = await requireAdmin();

    // A replace-import wipes and re-adds ads; purging in between could remove
    // ids it is about to restore.
    if (await isMigrationInProgress()) {
      return NextResponse.json(
        {
          error: "A backup/migration is in progress — purge after it finishes",
          code: "MIGRATION_IN_PROGRESS",
        },
        { status: 409 },
      );
    }

    const removed = await purgeAdLeftovers({ dryRun: false });

    await recordAudit({
      action: "import-file",
      actor: email,
      status: "success",
      scope: "purge-ad-leftovers",
      counts: countsOf(removed),
    });

    return NextResponse.json(removed);
  } catch (error) {
    return errorResponse(error, "Purge");
  }
}
