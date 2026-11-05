import { sfxDraftState } from "@/hooks/sfx-draft/sfx-draft-state";
import type { SoundFxPrompt } from "@/types";
import { describe, expect, it } from "vitest";

const cue = (description: string): SoundFxPrompt => ({ description });

describe("sfxDraftState", () => {
  it("is generating while generation runs, whatever the cues", () => {
    expect(sfxDraftState([cue("door")], ["a.mp3"], true)).toBe("generating");
  });

  it("is editing while no cue has a description", () => {
    expect(sfxDraftState([], [], false)).toBe("editing");
    expect(sfxDraftState([cue(""), cue("  ")], [], false)).toBe("editing");
  });

  it("is ready once every written cue has audio", () => {
    expect(sfxDraftState([cue("door"), cue("bell")], ["a", "b"], false)).toBe(
      "ready",
    );
  });

  it("is changed while a written cue has no audio", () => {
    expect(sfxDraftState([cue("door"), cue("bell")], ["a", null], false)).toBe(
      "changed",
    );
  });

  it("checks each written cue against its own URL, not its rank among written cues", () => {
    // Cue 0 is blank, cue 1 is written with no audio. Checking by rank would
    // look at urls[0] for cue 1 and wrongly call the draft ready.
    expect(sfxDraftState([cue(""), cue("bell")], ["stale", null], false)).toBe(
      "changed",
    );
    expect(sfxDraftState([cue(""), cue("bell")], [null, "b"], false)).toBe(
      "ready",
    );
  });
});
