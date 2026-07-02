/**
 * Backup audit log (AAC-185, P5 / §12).
 *
 * Records who did what backup action, when, over which scope, with counts and
 * outcome. Kept as a capped Redis list (newest first) plus a structured console
 * line (so it also lands in the platform's log aggregation). Best-effort — an
 * audit write must never fail the underlying action.
 */

import { getRedisV3 } from "@/lib/redis-v3";

const AUDIT_KEY = "backup:audit";
const MAX_ENTRIES = 500;

export type BackupAction =
  | "export"
  | "grant"
  | "import-file"
  | "import-pull";

export type AuditEntry = {
  ts: string;
  action: BackupAction;
  actor: string | null;
  status: "success" | "failure" | "blocked";
  scope?: string;
  sourceUrl?: string;
  counts?: Record<string, number>;
  detail?: string;
};

export async function recordAudit(
  entry: Omit<AuditEntry, "ts">,
): Promise<void> {
  const full: AuditEntry = { ...entry, ts: new Date().toISOString() };
  console.log(
    `📒 [backup-audit] ${full.action} ${full.status} actor=${full.actor ?? "?"}` +
      `${full.scope ? ` scope=${full.scope}` : ""}` +
      `${full.sourceUrl ? ` from=${full.sourceUrl}` : ""}` +
      `${full.detail ? ` — ${full.detail}` : ""}`,
  );
  try {
    const redis = getRedisV3();
    await redis.lpush(AUDIT_KEY, JSON.stringify(full));
    await redis.ltrim(AUDIT_KEY, 0, MAX_ENTRIES - 1);
  } catch (err) {
    console.warn("[backup-audit] persist failed (non-fatal):", err);
  }
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  try {
    const rows = await getRedisV3().lrange(AUDIT_KEY, 0, limit - 1);
    return (rows ?? []).map((r) =>
      typeof r === "string" ? (JSON.parse(r) as AuditEntry) : (r as AuditEntry),
    );
  } catch (err) {
    console.warn("[backup-audit] read failed:", err);
    return [];
  }
}
