import { useMixerData } from "@/hooks/useMixerData";
import type { SlotId } from "@/types/versions";
import { useMemo } from "react";

/**
 * The slots the user has moved by hand in the mixer (anchor origin
 * `user-edit`). For those, a draft's "Placement" value no longer says where
 * the clip plays, so the panel flags them and offers a reset.
 */
export function useMixerOverriddenSlots(adId: string) {
  const { data: mixerData, patchAnchors } = useMixerData(adId);

  const overriddenSlotIds = useMemo(() => {
    const ids = new Set<string>();

    for (const track of mixerData?.tracks ?? []) {
      if (track.anchorOrigin === "user-edit" && track.slotId) {
        ids.add(track.slotId);
      }
    }

    return ids;
  }, [mixerData]);

  /** Drops the slot's mixer override, putting it back on its placement. */
  const resetPlacement = async (slotId: SlotId) => {
    await patchAnchors({ [slotId]: null });
  };

  return { overriddenSlotIds, resetPlacement };
}
