import type { SoundFxPrompt, VoiceTrack } from "@/types";
import type { Anchor, MusicVersion } from "@/types/versions";
import { describe, expect, it } from "vitest";
import {
  anchorFromMusicVersion,
  anchorFromVoiceTrack,
  parseTrackRef,
  resolveTrackRef,
  seedForSoundFxPrompt,
  translateAnchorInput,
  type AnchorInput,
  type OrdinalRefs,
} from "../anchorTranslation";

// ---------- parseTrackRef ----------

describe("parseTrackRef", () => {
  it("parses voice-N", () => {
    expect(parseTrackRef("voice-0")).toEqual({ stream: "voices", index: 0 });
    expect(parseTrackRef("voice-7")).toEqual({ stream: "voices", index: 7 });
  });
  it("parses sfx-N", () => {
    expect(parseTrackRef("sfx-2")).toEqual({ stream: "sfx", index: 2 });
  });
  it("parses 'music' as index 0", () => {
    expect(parseTrackRef("music")).toEqual({ stream: "music", index: 0 });
  });
  it("rejects unknown shapes", () => {
    expect(parseTrackRef("voice-")).toBeNull();
    expect(parseTrackRef("v-0")).toBeNull();
    expect(parseTrackRef("voice-abc")).toBeNull();
    expect(parseTrackRef("voice--1")).toBeNull();
  });
});

// ---------- resolveTrackRef ----------

describe("resolveTrackRef", () => {
  const refs: OrdinalRefs = {
    voices: ["v-0", "v-1", "v-2"],
    sfx: ["s-0"],
    music: "m-0",
  };

  it("resolves voice ordinals", () => {
    expect(resolveTrackRef("voice-0", refs)).toBe("v-0");
    expect(resolveTrackRef("voice-2", refs)).toBe("v-2");
  });
  it("resolves sfx ordinals", () => {
    expect(resolveTrackRef("sfx-0", refs)).toBe("s-0");
  });
  it("resolves music", () => {
    expect(resolveTrackRef("music", refs)).toBe("m-0");
  });
  it("returns null for out-of-range ordinal", () => {
    expect(resolveTrackRef("voice-5", refs)).toBeNull();
  });
  it("returns null when referenced slot is undefined in the table", () => {
    const partial: OrdinalRefs = { voices: ["v-0", undefined, "v-2"] };
    expect(resolveTrackRef("voice-1", partial)).toBeNull();
  });
  it("returns null when ref can't be parsed", () => {
    expect(resolveTrackRef("bogus", refs)).toBeNull();
  });
});

// ---------- translateAnchorInput ----------

describe("translateAnchorInput", () => {
  const refs: OrdinalRefs = {
    voices: ["v-0", "v-1"],
    sfx: ["s-0"],
    music: "m-0",
  };

  it("passes absolute through unchanged", () => {
    const input: AnchorInput = { kind: "absolute", t: 3 };
    expect(translateAnchorInput(input, refs)).toEqual(input);
  });

  it("translates relativeTo trackRef to slotId", () => {
    const input: AnchorInput = {
      kind: "relativeTo",
      trackRef: "voice-1",
      edge: "end",
      offset: -0.2,
    };
    expect(translateAnchorInput(input, refs)).toEqual({
      kind: "relativeTo",
      slotId: "v-1",
      edge: "end",
      offset: -0.2,
    });
  });

  it("omits offset when not supplied", () => {
    const input: AnchorInput = {
      kind: "relativeTo",
      trackRef: "voice-0",
      edge: "start",
    };
    const result = translateAnchorInput(input, refs) as Exclude<
      Anchor,
      { kind: "absolute" }
    >;
    expect(result).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "start",
    });
    expect("offset" in result).toBe(false);
  });

  it("translates simultaneousWith", () => {
    const input: AnchorInput = {
      kind: "simultaneousWith",
      trackRef: "voice-0",
      alignment: "centerAtCenter",
    };
    expect(translateAnchorInput(input, refs)).toEqual({
      kind: "simultaneousWith",
      slotId: "v-0",
      alignment: "centerAtCenter",
    });
  });

  it("translates atFraction", () => {
    const input: AnchorInput = {
      kind: "atFraction",
      trackRef: "voice-1",
      fraction: 0.8,
    };
    expect(translateAnchorInput(input, refs)).toEqual({
      kind: "atFraction",
      slotId: "v-1",
      fraction: 0.8,
    });
  });

  it("returns null when trackRef is unresolvable", () => {
    expect(
      translateAnchorInput(
        { kind: "relativeTo", trackRef: "voice-99", edge: "end" },
        refs,
      ),
    ).toBeNull();
  });
});

// ---------- anchorFromVoiceTrack (legacy field translation) ----------

describe("anchorFromVoiceTrack", () => {
  const slots = ["v-0", "v-1", "v-2"];

  it("a stored absolute anchor wins, counted from the timeline origin", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      anchor: { kind: "absolute", t: 5 },
      playAfter: "track-0", // legacy that would translate differently
    };
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
      offset: 5,
    });
  });

  it("first track with no legacy info starts at the timeline origin", () => {
    const track: VoiceTrack = { voice: null, text: "" };
    expect(anchorFromVoiceTrack(track, slots, 0)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
    });
  });

  it("playAfter: 'start' → the timeline origin", () => {
    const track: VoiceTrack = { voice: null, text: "", playAfter: "start" };
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
    });
  });

  it("playAfter: 'track-N' + overlap → relativeTo end with negative offset", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      playAfter: "track-0",
      overlap: 0.15,
    };
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "end",
      offset: -0.15,
    });
  });

  it("playAfter: 'track-N' + overlap 0 → relativeTo end, no offset field", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      playAfter: "track-0",
      overlap: 0,
    };
    const a = anchorFromVoiceTrack(track, slots, 1) as Exclude<
      Anchor,
      { kind: "absolute" }
    >;
    expect(a).toEqual({ kind: "relativeTo", slotId: "v-0", edge: "end" });
    expect("offset" in a).toBe(false);
  });

  it("isConcurrent: true → simultaneousWith startAtStart", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      playAfter: "track-0",
      isConcurrent: true,
    };
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "simultaneousWith",
      slotId: "v-0",
      alignment: "startAtStart",
    });
  });

  it("no legacy, non-first track → relativeTo previous end", () => {
    const track: VoiceTrack = { voice: null, text: "" };
    expect(anchorFromVoiceTrack(track, slots, 2)).toEqual({
      kind: "relativeTo",
      slotId: "v-1",
      edge: "end",
    });
  });

  it("playAfter: 'track-N' where N is out of range → fallback to default", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      playAfter: "track-9",
    };
    // Falls through to default: relativeTo previous voice
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "end",
    });
  });

  it("playAfter: 'track-N' naming the line itself or a later one → previous line (no cycle)", () => {
    const base: VoiceTrack = { voice: null, text: "" };
    const expected = { kind: "relativeTo", slotId: "v-0", edge: "end" };
    expect(
      anchorFromVoiceTrack({ ...base, playAfter: "track-1" }, slots, 1),
    ).toEqual(expected);
    expect(
      anchorFromVoiceTrack({ ...base, playAfter: "track-2" }, slots, 1),
    ).toEqual(expected);
  });

  it("returns undefined when neither anchor nor derivable default exists", () => {
    const track: VoiceTrack = { voice: null, text: "" };
    // No previous slot (ordinal 1 but voiceSlotIds has only index 0 and it's undefined)
    expect(anchorFromVoiceTrack(track, [undefined], 1)).toBeUndefined();
  });
});

// ---------- seedForSoundFxPrompt ----------

describe("seedForSoundFxPrompt", () => {
  const voiceSlots = ["v-0", "v-1", "v-2"];
  const sfxSlots = ["s-0", "s-1"];

  it("a stored anchor whose voice is no longer pinned falls back to the placement", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      anchor: { kind: "relativeTo", slotId: "gone", edge: "end" },
      placement: { type: "afterVoice", index: 1 },
    };
    expect(seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "v-1", edge: "end" },
      layout: "push",
    });
  });

  it("returns prompt.anchor while its reference is pinned", () => {
    const prompt: SoundFxPrompt = {
      description: "ding",
      anchor: { kind: "absolute", t: 2 },
      placement: { type: "end" },
    };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "absolute",
      t: 2,
    });
  });

  it("placement beforeVoices → stacked on the timeline origin (push)", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "beforeVoices" },
    };
    expect(seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "@origin", edge: "end" },
      layout: "push",
    });
  });

  it("placement withFirstVoice, a second cue → follows the first one (overlay)", () => {
    const prompts: SoundFxPrompt[] = [
      {
        slotId: "s-a",
        description: "a",
        placement: { type: "withFirstVoice" },
      },
      {
        slotId: "s-b",
        description: "b",
        placement: { type: "withFirstVoice" },
      },
    ];
    expect(
      seedForSoundFxPrompt(prompts[1], voiceSlots, ["s-a", "s-b"], 1, prompts),
    ).toEqual({
      anchor: { kind: "relativeTo", slotId: "s-a", edge: "end" },
    });
  });

  it("placement withFirstVoice → simultaneousWith voice-0 startAtStart", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "withFirstVoice" },
    };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "simultaneousWith",
      slotId: "v-0",
      alignment: "startAtStart",
    });
  });

  it("placement afterVoice{N} → stacked on voices[N]'s end (push)", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "afterVoice", index: 1 },
    };
    expect(seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "v-1", edge: "end" },
      layout: "push",
    });
  });

  it("placement afterVoice with out-of-range index → plays at end", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "afterVoice", index: 99 },
    };
    expect(seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "@voices", edge: "end" },
      layout: "push",
    });
  });

  it("placement end → stacked on the end of every voice (push)", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "end" },
    };
    expect(seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "@voices", edge: "end" },
      layout: "push",
    });
  });

  it("placement legacy with track-N playAfter translates via voices table", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "legacy", playAfter: "track-1" },
    };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "relativeTo",
      slotId: "v-1",
      edge: "end",
    });
  });

  it("placement legacy with 'start' playAfter → absolute(0)", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "legacy", playAfter: "start" },
    };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "absolute",
      t: 0,
    });
  });

  it("no placement → undefined", () => {
    const prompt: SoundFxPrompt = { description: "x" };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0),
    ).toBeUndefined();
  });
});

// ---------- mixed legacy + new anchor fixtures ----------

describe("anchorFromVoiceTrack — mixed legacy + new anchor fixtures", () => {
  // Stage 6 bootstrap will read existing voice versions where some tracks
  // were re-authored under stage 4 (carry new .anchor) while others still
  // only have legacy playAfter/overlap. Resolution must pick the right
  // source per track without cross-contamination.
  const slots = ["v-0", "v-1", "v-2"];

  it("mixed version: track 0 has new anchor; track 1 has legacy; each resolves from its own source", () => {
    const track0: VoiceTrack = {
      voice: null,
      text: "",
      anchor: { kind: "absolute", t: 1 },
      // legacy field also present — should be ignored in favor of anchor
      playAfter: "start",
    };
    const track1: VoiceTrack = {
      voice: null,
      text: "",
      // no .anchor — legacy path
      playAfter: "track-0",
      overlap: 0.15,
    };
    expect(anchorFromVoiceTrack(track0, slots, 0)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
      offset: 1,
    });
    expect(anchorFromVoiceTrack(track1, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "end",
      offset: -0.15,
    });
  });

  it("mixed version: the new-anchor track references a legacy-only track by slot id — resolution still works for both", () => {
    // Track 0 uses legacy playAfter (implicitly at timeline start).
    // Track 1 has a new anchor that references track 0 by its slotId.
    // The authoring surface for stage-4 uses ordinals, but by the time
    // anchorFromVoiceTrack runs, the .anchor is already slot-id form.
    const track0: VoiceTrack = {
      voice: null,
      text: "",
      playAfter: "start",
    };
    const track1: VoiceTrack = {
      voice: null,
      text: "",
      anchor: {
        kind: "relativeTo",
        slotId: "v-0",
        edge: "end",
        offset: -0.2,
      },
    };
    expect(anchorFromVoiceTrack(track0, slots, 0)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
    });
    expect(anchorFromVoiceTrack(track1, slots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "end",
      offset: -0.2,
    });
  });

  it("mixed version: track with anchor + orphaned legacy overlap — new anchor wins, legacy noise ignored", () => {
    // Legacy overlap present but should be ignored because .anchor is authoritative.
    const track: VoiceTrack = {
      voice: null,
      text: "",
      anchor: {
        kind: "simultaneousWith",
        slotId: "v-0",
        alignment: "startAtStart",
      },
      playAfter: "track-0",
      overlap: 999, // nonsensical — must not influence result
    };
    expect(anchorFromVoiceTrack(track, slots, 1)).toEqual({
      kind: "simultaneousWith",
      slotId: "v-0",
      alignment: "startAtStart",
    });
  });
});

describe("seedForSoundFxPrompt — stored anchor + placement fixtures", () => {
  const voiceSlots = ["v-0", "v-1"];
  const sfxSlots = ["s-0"];

  it("sfx with both a pinned .anchor and a .placement — .anchor wins", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      anchor: { kind: "absolute", t: 2 },
      placement: { type: "end" }, // would queue after every voice (@voices end); ignored
    };
    expect(
      seedForSoundFxPrompt(prompt, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "absolute",
      t: 2,
    });
  });

  it("version with two prompts — one with a stored .anchor, one with a .placement — both resolve independently", () => {
    const authored: SoundFxPrompt = {
      description: "stinger",
      anchor: {
        kind: "relativeTo",
        slotId: "v-1",
        edge: "end",
        offset: 0.3,
      },
    };
    const placed: SoundFxPrompt = {
      description: "opener",
      placement: { type: "beforeVoices" },
    };
    expect(
      seedForSoundFxPrompt(authored, voiceSlots, sfxSlots, 0)?.anchor,
    ).toEqual({
      kind: "relativeTo",
      slotId: "v-1",
      edge: "end",
      offset: 0.3,
    });
    expect(
      seedForSoundFxPrompt(placed, voiceSlots, sfxSlots, 1)?.anchor,
    ).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
    });
  });
});

// ---------- anchorFromMusicVersion ----------

describe("anchorFromMusicVersion", () => {
  it("returns the version's anchor when present", () => {
    const version: MusicVersion = {
      slotId: "m-0",
      anchor: {
        kind: "simultaneousWith",
        slotId: "v-0",
        alignment: "startAtStart",
      },
      musicPrompt: "",
      musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
      generatedUrl: "",
      duration: 30,
      provider: "loudly",
      createdAt: 0,
      createdBy: "llm",
      status: "draft",
    };
    expect(anchorFromMusicVersion(version)).toEqual(version.anchor);
  });

  it("defaults to absolute(0) when no anchor set", () => {
    const version: MusicVersion = {
      slotId: "m-0",
      musicPrompt: "",
      musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
      generatedUrl: "",
      duration: 30,
      provider: "loudly",
      createdAt: 0,
      createdBy: "llm",
      status: "draft",
    };
    expect(anchorFromMusicVersion(version)).toEqual({ kind: "absolute", t: 0 });
  });
});

// ---------- stale references fall back instead of landing at 0 s ----------

describe("stale references", () => {
  const voiceSlots = ["v-0", "v-1"];

  it("a voice anchor that names an SFX is ignored: the line follows the previous one", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      anchor: { kind: "relativeTo", slotId: "sfx-slot", edge: "end" },
    };

    expect(anchorFromVoiceTrack(track, voiceSlots, 1)).toEqual({
      kind: "relativeTo",
      slotId: "v-0",
      edge: "end",
    });
  });

  it("a voice anchor that names a line that is gone is ignored: line 1 starts at the origin", () => {
    const track: VoiceTrack = {
      voice: null,
      text: "",
      anchor: { kind: "relativeTo", slotId: "deleted", edge: "end" },
    };

    expect(anchorFromVoiceTrack(track, voiceSlots, 0)).toEqual({
      kind: "relativeTo",
      slotId: "@origin",
      edge: "end",
    });
  });

  it("a voice anchor that names another line is kept", () => {
    const anchor: Anchor = { kind: "relativeTo", slotId: "v-0", edge: "start" };
    const track: VoiceTrack = { voice: null, text: "", anchor };

    expect(anchorFromVoiceTrack(track, voiceSlots, 1)).toEqual(anchor);
  });

  it("after a voice with no slot id yet → plays at end", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "afterVoice", index: 1 },
    };

    expect(seedForSoundFxPrompt(prompt, ["v-0", undefined], [], 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "@voices", edge: "end" },
      layout: "push",
    });
  });

  it("a legacy playAfter that no longer resolves → plays at end", () => {
    const prompt: SoundFxPrompt = {
      description: "x",
      placement: { type: "legacy", playAfter: "track-9" },
    };

    expect(seedForSoundFxPrompt(prompt, voiceSlots, [], 0)).toEqual({
      anchor: { kind: "relativeTo", slotId: "@voices", edge: "end" },
      layout: "push",
    });
  });
});
