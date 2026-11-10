/**
 * Pure-core tests for mixer reconciliation — no Redis involved.
 */

import {
  mockMusicVersionDraft,
  mockSfxVersionDraft,
  mockSoundFxPrompt,
  mockVoiceTrack,
  mockVoiceVersionDraft,
} from "@/test/fixtures/versions";
import type { MixerVersion } from "@/types/versions";
import { describe, expect, it } from "vitest";
import {
  buildSeedAnchors,
  computePatchedVersion,
  inferTrackShape,
  pinnedSlotIds,
  planDraftSync,
  reconcileAnchors,
  seedAnchorForSlot,
  slotIdForTrack,
  type PinnedVersions,
} from "../mixer-reconcile";

const pinned: PinnedVersions = {
  voice: {
    ...mockVoiceVersionDraft,
    voiceTracks: [
      { ...mockVoiceTrack, slotId: "v0" },
      { ...mockVoiceTrack, slotId: "v1", playAfter: undefined },
    ],
  },
  music: { ...mockMusicVersionDraft, slotId: "m0" },
  sfx: {
    ...mockSfxVersionDraft,
    soundFxPrompts: [
      { ...mockSoundFxPrompt, slotId: "s0", placement: { type: "start" } },
      {
        ...mockSoundFxPrompt,
        slotId: "s1",
        placement: { type: "afterVoice", index: 0 },
      },
    ],
  },
};

const draft: MixerVersion = {
  anchors: {},
  pins: { voices: "v1", music: "v1", sfx: "v1" },
  createdAt: 1,
  createdBy: "llm",
  status: "draft",
};

describe("slotIdForTrack / inferTrackShape", () => {
  it("maps positional track ids to slot ids", () => {
    const { voice, music, sfx } = pinned;
    expect(
      slotIdForTrack(inferTrackShape("voice-v3-1"), voice, music, sfx),
    ).toBe("v1");
    expect(slotIdForTrack(inferTrackShape("music-v2"), voice, music, sfx)).toBe(
      "m0",
    );
    expect(slotIdForTrack(inferTrackShape("sfx-v1-0"), voice, music, sfx)).toBe(
      "s0",
    );
  });

  it("returns null for out-of-range ordinals", () => {
    expect(
      slotIdForTrack(inferTrackShape("voice-v3-9"), pinned.voice, null, null),
    ).toBeNull();
  });
});

describe("seedAnchorForSlot", () => {
  it("seeds voices sequentially", () => {
    expect(seedAnchorForSlot("v0", pinned)).toEqual({ kind: "absolute", t: 0 });
    expect(seedAnchorForSlot("v1", pinned)).toEqual({
      kind: "relativeTo",
      slotId: "v0",
      edge: "end",
    });
  });

  it("translates sfx placement against voice slots", () => {
    expect(seedAnchorForSlot("s1", pinned)).toEqual({
      kind: "relativeTo",
      slotId: "v0",
      edge: "end",
    });
  });

  it("defaults music to absolute(0)", () => {
    expect(seedAnchorForSlot("m0", pinned)).toEqual({ kind: "absolute", t: 0 });
  });

  it("returns null for unknown slots", () => {
    expect(seedAnchorForSlot("nope", pinned)).toBeNull();
  });
});

describe("buildSeedAnchors", () => {
  it("seeds every pinned slot as llm-seed", () => {
    const anchors = buildSeedAnchors(pinned);
    expect(Object.keys(anchors).sort()).toEqual(pinnedSlotIds(pinned).sort());
    expect(Object.values(anchors).every((a) => a.origin === "llm-seed")).toBe(
      true,
    );
  });
});

describe("reconcileAnchors", () => {
  it("seeds slots that have no anchor yet (new tracks after a send)", () => {
    expect(reconcileAnchors({}, pinned)).toEqual(buildSeedAnchors(pinned));
  });

  it("re-seeds llm-seed anchors when the stream placement changed", () => {
    const stale: MixerVersion["anchors"] = {
      s1: { anchor: { kind: "absolute", t: 0 }, origin: "llm-seed" },
    };
    expect(reconcileAnchors(stale, pinned).s1).toEqual({
      anchor: { kind: "relativeTo", slotId: "v0", edge: "end" },
      origin: "llm-seed",
    });
  });

  it("keeps a user-edit anchor whose reference is still pinned", () => {
    const edited: MixerVersion["anchors"] = {
      v1: {
        anchor: { kind: "relativeTo", slotId: "v0", edge: "end", offset: 2 },
        origin: "user-edit",
      },
      s0: { anchor: { kind: "absolute", t: 7 }, origin: "user-edit" },
    };
    const next = reconcileAnchors(edited, pinned);
    expect(next.v1).toBe(edited.v1);
    expect(next.s0).toBe(edited.s0);
  });

  it("re-seeds a user-edit anchor whose reference is gone", () => {
    const dangling: MixerVersion["anchors"] = {
      v1: {
        anchor: { kind: "relativeTo", slotId: "deleted", edge: "end" },
        origin: "user-edit",
        layout: "push",
      },
    };
    expect(reconcileAnchors(dangling, pinned).v1).toEqual({
      anchor: { kind: "relativeTo", slotId: "v0", edge: "end" },
      origin: "llm-seed",
      layout: "push",
    });
  });

  it("drops anchors for slots that are no longer pinned", () => {
    const old: MixerVersion["anchors"] = {
      gone: { anchor: { kind: "absolute", t: 1 }, origin: "user-edit" },
    };
    expect(reconcileAnchors(old, pinned)).not.toHaveProperty("gone");
  });
});

describe("planDraftSync", () => {
  const pins = { voices: "v2", music: "v1", sfx: "v1" };

  it("forks a frozen active, carrying overrides and reconciled anchors", () => {
    const frozen: MixerVersion = {
      ...draft,
      status: "frozen",
      label: "Take 1",
      overrides: { v0: { volume: -3 } },
      anchors: {
        v0: { anchor: { kind: "absolute", t: 1 }, origin: "user-edit" },
      },
    };
    const plan = planDraftSync(frozen, "v4", pins, pinned, 42);
    expect(plan.kind).toBe("fork");
    if (plan.kind !== "fork") return;
    expect(plan.draft).toMatchObject({
      status: "draft",
      createdBy: "fork",
      createdAt: 42,
      parentVersionId: "v4",
      label: "Take 1",
      pins,
      anchors: reconcileAnchors(frozen.anchors, pinned),
      overrides: frozen.overrides,
    });
    expect(plan.draft.anchors.v0).toEqual(frozen.anchors.v0);
  });

  it("updates pins and anchors on a draft when pins differ", () => {
    expect(planDraftSync(draft, "v4", pins, pinned, 0)).toEqual({
      kind: "update-draft",
      pins,
      anchors: buildSeedAnchors(pinned),
    });
  });

  it("heals missing anchors even when pins are unchanged", () => {
    const plan = planDraftSync(draft, "v4", draft.pins, pinned, 0);
    expect(plan.kind).toBe("update-draft");
  });

  it("is a no-op when pins and anchors are already in sync", () => {
    const synced = { ...draft, anchors: buildSeedAnchors(pinned) };
    expect(planDraftSync(synced, "v4", draft.pins, pinned, 0)).toEqual({
      kind: "noop",
    });
  });
});

describe("computePatchedVersion", () => {
  it("translates track-id volumes into slot-id overrides", () => {
    const updates = computePatchedVersion(draft, pinned, {
      volumes: { "voice-v1-1": -2, "sfx-v1-0": 1.5, "voice-v1-9": 4 },
    });
    expect(updates.overrides).toEqual({
      v1: { volume: -2 },
      s0: { volume: 1.5 },
    });
  });

  it("writes and clears trims without touching other overrides", () => {
    const active = {
      ...draft,
      overrides: { v0: { volume: -1, trim: { start: 0, end: 1 } } },
    };
    const cleared = computePatchedVersion(active, pinned, {
      trimUpdates: { v0: null },
    });
    expect(cleared.overrides).toEqual({ v0: { volume: -1 } });

    const set = computePatchedVersion(draft, pinned, {
      trimUpdates: { v1: { start: 0.5, end: 2 }, v0: { start: 2, end: 1 } },
    });
    expect(set.overrides).toEqual({ v1: { trim: { start: 0.5, end: 2 } } });
  });

  it("marks drag anchors as user-edit and keeps layout", () => {
    const active: MixerVersion = {
      ...draft,
      anchors: {
        s1: {
          anchor: { kind: "absolute", t: 0 },
          origin: "llm-seed",
          layout: "push",
        },
      },
    };
    const updates = computePatchedVersion(active, pinned, {
      anchorUpdates: { s1: { kind: "absolute", t: 3 } },
    });
    expect(updates.anchors?.s1).toEqual({
      anchor: { kind: "absolute", t: 3 },
      origin: "user-edit",
      layout: "push",
    });
  });

  it("resets an anchor to its stream seed, or drops it without one", () => {
    const active: MixerVersion = {
      ...draft,
      anchors: {
        s1: { anchor: { kind: "absolute", t: 9 }, origin: "user-edit" },
        gone: { anchor: { kind: "absolute", t: 9 }, origin: "user-edit" },
      },
    };
    const updates = computePatchedVersion(active, pinned, {
      anchorUpdates: { s1: null, gone: null },
    });
    expect(updates.anchors).toEqual({
      s1: {
        anchor: { kind: "relativeTo", slotId: "v0", edge: "end" },
        origin: "llm-seed",
      },
    });
  });

  it("only sets mixedAudioUrl when provided", () => {
    expect(computePatchedVersion(draft, pinned, {})).not.toHaveProperty(
      "mixedAudioUrl",
    );
    expect(
      computePatchedVersion(draft, pinned, { mixedAudioUrl: "https://x" })
        .mixedAudioUrl,
    ).toBe("https://x");
  });
});
