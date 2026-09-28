/**
 * Maintenance-mode guard (AAC-185, P0-3).
 *
 * When maintenance mode is on, write actions (generation, ad mutations, chat,
 * new-user creation) are blocked so a backup/migration captures a consistent
 * snapshot. Reads, admin actions, and the backup endpoints stay allowed.
 *
 * The on/off decision is **Redis-authoritative** (`getMaintenanceState()`):
 * Postgres stays canonical for the full settings object, but enforcement reads
 * the Redis mirror so the break-glass (`forceClearMaintenance`) can unblock
 * writes even when Postgres is unreachable. The Edge middleware can't read
 * Postgres, so authoritative enforcement is here, at the top of Node write
 * routes:
 *
 *   await assertNotMaintenance();
 *
 * Blocks content writes for EVERYONE (including admins) while maintenance is
 * on — that's what makes the backup/migration snapshot consistent. The backup
 * endpoints are exempt simply by NOT calling this guard; they don't mutate
 * project content, they read/transfer it. Turning maintenance off goes through
 * the admin settings API, which likewise doesn't call this guard.
 */

import { getMaintenanceState } from "@/services/serverSettingsService";

export class MaintenanceError extends Error {
  readonly code = "MAINTENANCE";
  readonly status = 503;
  readonly maintenanceMessage: string | null;

  constructor(maintenanceMessage: string | null) {
    super(
      maintenanceMessage ||
        "The service is in maintenance mode. Changes are temporarily disabled.",
    );
    this.name = "MaintenanceError";
    this.maintenanceMessage = maintenanceMessage;
  }
}

/**
 * Throws {@link MaintenanceError} (→ 503) when maintenance mode is on. Call at
 * the top of every mutating (content-write) route. Backup endpoints do NOT
 * call this.
 */
export async function assertNotMaintenance(): Promise<void> {
  const state = await getMaintenanceState();
  if (state.on) {
    throw new MaintenanceError(state.message);
  }
}

/** Standard JSON body + status for a caught MaintenanceError. */
export function maintenanceErrorResponse(err: MaintenanceError) {
  return {
    body: {
      error: err.message,
      code: err.code,
      maintenanceMessage: err.maintenanceMessage,
    },
    status: err.status,
  };
}
