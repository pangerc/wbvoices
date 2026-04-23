/**
 * Slot identity reconciliation.
 *
 * Slots are the stable referents mixer anchors bind to. When a stream draft is
 * derived from a parent version, we want slot ids to carry forward by ordinal
 * match so anchors like `atFraction(voice-2-slot, 0.8)` keep resolving against
 * the intended slot after regeneration — even if the voice, text, or provider
 * changed inside that slot.
 *
 * This module is a pure function of `(parent slot ids, new count) → (assigned
 * ids, reconciliation report)`. It does not read or write Redis; callers supply
 * the parent's slot ids and persist the report.
 */

import type { StreamType, VersionId } from "@/types/versions";
import type { SlotReconciliation } from "./types";

/**
 * Reconcile slot identities from a parent version into a new draft.
 *
 * - If `parentSlotIds` is null/empty, every slot gets a fresh UUID; the report
 *   has no parentVersionId and only `created` entries.
 * - If `parentSlotIds` has entries: the first N new slots inherit the first N
 *   parent slot ids by ordinal (where N = min(parent.length, newCount)).
 *   Trailing new slots get fresh UUIDs; trailing parent slots are recorded as
 *   orphaned (absent from the new draft).
 *
 * Any parent entry that is missing (undefined/null because the parent version
 * pre-dates slot id introduction) is treated as if it had no id and is given
 * a freshly-minted id in the assigned output — so the new draft is always
 * fully slot-identified regardless of parent state.
 */
export function reconcileSlots(
  parentSlotIds: ReadonlyArray<string | undefined | null> | null,
  newCount: number,
  stream: StreamType,
  parentVersionId: VersionId | null,
  mintId: () => string = () => crypto.randomUUID()
): {
  assigned: string[];
  report: SlotReconciliation;
} {
  const preserved: SlotReconciliation["preserved"] = [];
  const created: SlotReconciliation["created"] = [];
  const orphaned: SlotReconciliation["orphaned"] = [];
  const assigned: string[] = new Array(newCount);

  const parentLength = parentSlotIds ? parentSlotIds.length : 0;
  const overlap = Math.min(parentLength, newCount);

  // Ordinal-matched copy for the overlap range.
  for (let i = 0; i < overlap; i++) {
    const parentId = parentSlotIds?.[i];
    if (parentId) {
      assigned[i] = parentId;
      preserved.push({ slotId: parentId, ordinalIndex: i });
    } else {
      // Parent version pre-dates slot ids at this ordinal — mint one now.
      const fresh = mintId();
      assigned[i] = fresh;
      created.push({ slotId: fresh, ordinalIndex: i });
    }
  }

  // New slots beyond parent length.
  for (let i = overlap; i < newCount; i++) {
    const fresh = mintId();
    assigned[i] = fresh;
    created.push({ slotId: fresh, ordinalIndex: i });
  }

  // Parent slots dropped by the new draft.
  if (parentSlotIds) {
    for (let i = newCount; i < parentLength; i++) {
      const parentId = parentSlotIds[i];
      if (parentId) {
        orphaned.push({ slotId: parentId, ordinalIndex: i });
      }
    }
  }

  return {
    assigned,
    report: {
      stream,
      parentVersionId,
      preserved,
      created,
      orphaned,
    },
  };
}
