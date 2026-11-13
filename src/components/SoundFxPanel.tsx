import { SoundFxPlacementIntent, SoundFxPrompt, UploadedSfx } from "@/types";
import {
  ArrowUpTrayIcon,
  PlayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { SfxCueLibrary } from "./SfxCueLibrary";
import { SfxCueUpload } from "./SfxCueUpload";
import {
  GenerateIcon,
  GlassTab,
  GlassTabBar,
  GlassyListbox,
  GlassySlider,
  GlassyTextarea,
  LibraryIcon,
  Tooltip,
  UploadIcon,
} from "./ui";

/**
 * Where a cue's audio comes from: a prompt to generate, a new file, or a file
 * from the user's library.
 */
type CueSource = "prompt" | "upload" | "library";

/** A file option whose picker is open on a cue. */
type PendingFileSource = Exclude<CueSource, "prompt">;

type VoiceTrackPreview = {
  name: string;
  text: string;
};

type SoundFxPanelProps = {
  onGenerate: () => Promise<string[] | null | void>; // Can return generated URLs for autoplay
  isGenerating: boolean;
  statusMessage?: string;
  soundFxPrompts: SoundFxPrompt[]; // Array of soundfx prompts
  onUpdatePrompt: (index: number, updates: Partial<SoundFxPrompt>) => void; // Update specific soundfx
  onRemovePrompt: (index: number) => void; // Remove specific soundfx
  onAddPrompt: () => void; // Add new empty soundfx
  /**
   * Makes a cue play a validated upload. Resolves false when the draft could
   * not be saved.
   */
  onUploadCue: (index: number, upload: UploadedSfx) => Promise<boolean>;
  /** Turns an uploaded cue back into an empty prompt. */
  onClearUpload: (index: number) => void;
  /** The ad being edited — uploads are tagged with it. */
  adId: string;
  adDuration: number; // Ad duration for slider max
  resetForm: () => void;
  voiceTrackCount?: number; // Number of voice tracks for placement options
  voiceTrackPreviews?: VoiceTrackPreview[]; // Preview info for each voice track
  onPlayPrompt?: (index: number) => void; // Play individual prompt (generate if needed)
  generatingPromptIndex?: number | null; // Which prompt is currently generating
  generatedUrls?: (string | null)[]; // Per-prompt generated URLs for play button state
  /**
   * Slot ids for which the mixer has a `user-edit` anchor — i.e. the user
   * has manually repositioned the clip in the mixer, making the placement
   * dropdown's value stale. The panel shows a badge on those entries.
   */
  mixerOverriddenSlotIds?: ReadonlySet<string>;
  /**
   * Reset a prompt's mixer anchor override back to its stream-level seed
   * (the placement dropdown value). Called from the divergence badge.
   */
  onResetPlacement?: (index: number) => void;
};

// Default duration for sound effects
const DEFAULT_SOUND_FX_DURATION = 2; // 2 seconds is a good default for stingers/transitions

/**
 * The Placement listbox value of a cue still positioned by an AI anchor. No
 * option carries it, so the listbox shows it as its label.
 */
const CUSTOM_AI_PLACEMENT = "Custom (AI)";

// Convert placement option string to placement intent
function placementOptionToIntent(option: string): SoundFxPlacementIntent {
  if (option === "start") {
    return { type: "start" };
  }
  if (option === "withFirstVoice") {
    return { type: "withFirstVoice" };
  }
  if (option === "end") {
    return { type: "end" };
  }
  // Format is "afterVoice-0", "afterVoice-1", etc.
  if (option.startsWith("afterVoice-")) {
    const index = parseInt(option.split("-")[1], 10);
    return { type: "afterVoice", index };
  }
  // Default to end
  return { type: "end" };
}

// REMOVED: placementIntentToLegacyPlayAfter
// V3 architecture: Redis stores placementIntent, timeline calculator resolves at runtime
// No more dual-field sync mess - placementIntent is the single source of truth

export function SoundFxPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  soundFxPrompts,
  onUpdatePrompt,
  onRemovePrompt,
  onAddPrompt,
  onUploadCue,
  onClearUpload,
  adId,
  adDuration, // We keep this for API compatibility, but use a fixed default duration for sound effects
  resetForm,

  voiceTrackCount: _voiceTrackCount = 0, // Kept for API compatibility, not currently used
  voiceTrackPreviews = [],
  onPlayPrompt,
  generatingPromptIndex,
  generatedUrls = [],
  mixerOverriddenSlotIds,
  onResetPlacement,
}: SoundFxPanelProps) {
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");
  // Cues whose Upload or Library picker is open. Local only, and kept until
  // the chosen file is saved, so a picker outlives the optimistic cue update
  // and can show why a save failed.
  const [pendingSources, setPendingSources] = useState<
    ReadonlyMap<string, PendingFileSource>
  >(() => new Map());

  // Update local status message when parent status message changes
  // but only if we're actually generating sound fx
  useEffect(() => {
    if (isGenerating) {
      setLocalStatusMessage(parentStatusMessage || "");
    }
  }, [isGenerating, parentStatusMessage]);

  // Reset status message when component mounts
  useEffect(() => {
    setLocalStatusMessage("");
  }, []);

  // Handle reset - clears all soundfx and resets form
  const handleReset = () => {
    setLocalStatusMessage("");
    resetForm();
  };

  // Generate all soundfx in the array
  const handleGenerate = () => {
    console.log(`Generating ${soundFxPrompts.length} sound effects`);
    // Check if at least one prompt has valid description
    const hasValidPrompt = soundFxPrompts.some((p) => p.description?.trim());
    if (hasValidPrompt && !isGenerating) {
      onGenerate();
    } else {
      console.log(`Generation skipped: no valid prompts or already generating`);
    }
  };

  // Helper to convert placement intent to string option for listbox
  const placementIntentToOption = (
    placement?: SoundFxPlacementIntent,
  ): string => {
    if (!placement) return "end";
    // Both "start" and "beforeVoices" map to the "start" UI option: the cue
    // starts at 0 and plays over voice 1 (several such cues play one after
    // another).
    if (placement.type === "start" || placement.type === "beforeVoices")
      return "start";
    if (placement.type === "withFirstVoice") return "withFirstVoice";
    if (placement.type === "afterVoice" && placement.index !== undefined) {
      return `afterVoice-${placement.index}`;
    }
    return "end";
  };

  /**
   * The listbox value for a cue. No option carries the two special values,
   * so the listbox shows them as their own label until the user picks a
   * placement:
   * - a cue saved with an AI anchor (before create_sfx_draft turned anchors
   *   into placements) plays where the anchor says while the clip it
   *   references is still in the ad, and at its placement otherwise;
   * - "after voice k" on a script that no longer has voice k plays at end.
   */
  const placementValue = (prompt: SoundFxPrompt): string => {
    if (prompt.anchor) return CUSTOM_AI_PLACEMENT;

    const placement = prompt.placement;
    if (
      placement?.type === "afterVoice" &&
      voiceTrackPreviews &&
      placement.index >= voiceTrackPreviews.length
    ) {
      return `After voice ${placement.index + 1} (missing, plays at end)`;
    }

    return placementIntentToOption(placement);
  };

  // Clamp slider max to ad duration (but at least 5s so the control is usable)
  const sliderMax = Math.max(5, adDuration);

  // Legacy cues may predate slot ids; their index is stable enough here.
  const cueKey = (prompt: SoundFxPrompt, index: number) =>
    prompt.slotId ?? String(index);

  // Closes a cue's file picker, back to its file or its prompt.
  const closePicker = (key: string) =>
    setPendingSources((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });

  const selectSource = (index: number, source: CueSource) => {
    const prompt = soundFxPrompts[index];
    const key = cueKey(prompt, index);

    // A cue with a file already shows it under Upload; Library opens the list
    // to swap it for another.
    if (
      source === "prompt" ||
      (source === "upload" && prompt.source === "upload")
    ) {
      closePicker(key);
    } else {
      setPendingSources((current) => new Map(current).set(key, source));
    }

    if (source === "prompt" && prompt.source === "upload") {
      onClearUpload(index);
    }
  };

  /**
   * Saves an uploaded or picked file as the cue's audio. The picker stays
   * open until the save lands, so it can show why one failed; then it gives
   * way to the file.
   */
  const chooseFile = async (index: number, upload: UploadedSfx) => {
    const key = cueKey(soundFxPrompts[index], index);

    const saved = await onUploadCue(index, upload);
    if (saved) closePicker(key);

    return saved;
  };

  return (
    <div className="py-8 text-white">
      {/* Render each soundfx form */}
      <div className="space-y-8">
        {soundFxPrompts.map((prompt, index) => {
          // The tab of an open file picker; otherwise Upload over the cue's
          // file, or Prompt.
          const openPicker = pendingSources.get(cueKey(prompt, index));
          const source: CueSource =
            openPicker ?? (prompt.source === "upload" ? "upload" : "prompt");

          return (
            <div
              key={index}
              className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-6"
            >
              {/* Form header with number, play button and remove button */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Sound Effect {index + 1}
                </h3>
                <div className="flex items-center gap-1">
                  {onPlayPrompt && (
                    <Tooltip
                      content={
                        generatedUrls[index] ? "Play" : "Generate & play"
                      }
                    >
                      <button
                        onClick={() => onPlayPrompt(index)}
                        disabled={isGenerating || !prompt.description?.trim()}
                        className={`p-2 rounded-lg border transition-all ${
                          generatingPromptIndex === index
                            ? "text-wb-blue border-wb-blue/30 bg-wb-blue/10 animate-pulse"
                            : generatedUrls[index]
                              ? "text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20"
                              : "text-gray-400 border-transparent hover:text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                        }`}
                      >
                        <PlayIcon className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </Tooltip>
                  )}
                  {soundFxPrompts.length > 1 && (
                    <Tooltip content="Remove this sound effect">
                      <button
                        onClick={() => onRemovePrompt(index)}
                        disabled={isGenerating}
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                      >
                        <TrashIcon className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>

              <div className="space-y-6 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
                {/* Left column: Prompt or Upload, then the description,
                  the dropzone, or the uploaded file */}
                <div className="space-y-4">
                  <GlassTabBar>
                    <Tooltip content="Write a prompt" side="bottom">
                      <GlassTab
                        isActive={source === "prompt"}
                        onClick={() => selectSource(index, "prompt")}
                      >
                        <GenerateIcon isActive={source === "prompt"} />
                      </GlassTab>
                    </Tooltip>
                    <Tooltip content="Upload a file" side="bottom">
                      <GlassTab
                        isActive={source === "upload"}
                        onClick={() => selectSource(index, "upload")}
                      >
                        <UploadIcon isActive={source === "upload"} />
                      </GlassTab>
                    </Tooltip>
                    <Tooltip content="Choose from your library" side="bottom">
                      <GlassTab
                        isActive={source === "library"}
                        onClick={() => selectSource(index, "library")}
                      >
                        <LibraryIcon isActive={source === "library"} />
                      </GlassTab>
                    </Tooltip>
                  </GlassTabBar>

                  {openPicker === "upload" ? (
                    <SfxCueUpload
                      adId={adId}
                      onUploaded={(upload) => chooseFile(index, upload)}
                    />
                  ) : openPicker === "library" ? (
                    <SfxCueLibrary
                      onPicked={(upload) => chooseFile(index, upload)}
                    />
                  ) : prompt.source === "upload" ? (
                    <div>
                      <p className="mb-2 text-base">Uploaded file</p>
                      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4">
                        <ArrowUpTrayIcon
                          className="size-5 shrink-0 text-gray-400"
                          strokeWidth={2}
                        />
                        <p className="min-w-0 flex-1 truncate">
                          {prompt.description}
                        </p>
                        <span className="rounded-full bg-wb-blue/10 px-2 py-0.5 text-xs text-wb-blue">
                          Uploaded
                        </span>
                      </div>
                    </div>
                  ) : (
                    <GlassyTextarea
                      label="Sound FX Description"
                      value={prompt.description || ""}
                      onChange={(e) =>
                        onUpdatePrompt(index, { description: e.target.value })
                      }
                      placeholder="Describe the sound effect... (e.g. 'A door creaking open slowly')"
                      className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                      minRows={6}
                    />
                  )}
                </div>

                {/* Right column: Placement and Duration controls */}
                <div className="space-y-6">
                  {/* Placement selector */}
                  <GlassyListbox
                    label="Placement"
                    value={placementValue(prompt)}
                    onChange={(value) => {
                      const intent = placementOptionToIntent(value);
                      // V3: Only set placement intent - timeline calculator resolves at runtime
                      onUpdatePrompt(index, {
                        placement: intent,
                      });
                    }}
                    options={[
                      {
                        value: "start",
                        label: "At beginning (plays over first voice)",
                      },
                      {
                        value: "withFirstVoice",
                        label: "With first voice (overlapping)",
                      },
                      ...(voiceTrackPreviews && voiceTrackPreviews.length > 0
                        ? voiceTrackPreviews.map((preview, voiceIndex) => ({
                            value: `afterVoice-${voiceIndex}`,
                            label: `After voice ${voiceIndex + 1} (${
                              preview.name
                            }: "${preview.text.slice(0, 20)}${
                              preview.text.length > 20 ? "..." : ""
                            }")`,
                          }))
                        : []),
                      { value: "end", label: "At end (after all voices)" },
                    ]}
                  />

                  {/* Divergence hint: the user has moved this clip in the mixer
                    timeline, so the dropdown above no longer reflects where it
                    actually plays. Offer a reset back to the dropdown's value. */}
                  {prompt.slotId &&
                    mixerOverriddenSlotIds?.has(prompt.slotId) && (
                      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                        <span className="text-amber-200/90">
                          Moved in mixer — placement above is ignored
                        </span>
                        {onResetPlacement && (
                          <button
                            onClick={() => onResetPlacement(index)}
                            className="text-amber-200 hover:text-white underline underline-offset-2 whitespace-nowrap"
                          >
                            Reset to this placement
                          </button>
                        )}
                      </div>
                    )}

                  {prompt.source === "upload" ? (
                    <div>
                      <p className="mb-1 text-base">
                        Duration{" "}
                        <span className="text-sm text-gray-400">
                          {(prompt.duration ?? 0).toFixed(1)}s
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Set by the uploaded file. Trim it in the mixer.
                      </p>
                    </div>
                  ) : (
                    source === "prompt" && (
                      <>
                        <label className="block text-base mb-1">
                          Duration{" "}
                          <span className="text-sm text-gray-400">
                            {prompt.duration || DEFAULT_SOUND_FX_DURATION}s
                          </span>
                        </label>
                        <GlassySlider
                          label={null}
                          value={prompt.duration || DEFAULT_SOUND_FX_DURATION}
                          onChange={(value) =>
                            onUpdatePrompt(index, { duration: value })
                          }
                          min={0.5}
                          max={sliderMax}
                          step={0.5}
                          formatLabel={(val) => `${val} seconds`}
                          tickMarks={[
                            { value: 0.5, label: "0.5s" },
                            { value: 3, label: "3s" },
                            ...(sliderMax >= 5
                              ? [{ value: 5, label: "5s" }]
                              : []),
                            ...(sliderMax >= 10
                              ? [{ value: 10, label: "10s" }]
                              : []),
                            { value: sliderMax, label: `${sliderMax}s` },
                          ]}
                        />
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Sound Effect button - matching ScripterPanel style */}
      <Tooltip content="Add another sound effect" side="bottom">
        <button
          onClick={onAddPrompt}
          disabled={isGenerating}
          className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent w-full text-sky-700 hover:bg-gradient-to-t hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Sound Effect
        </button>
      </Tooltip>

      {/* Status message */}
      {localStatusMessage && (
        <p className="mt-6 text-center text-sm text-gray-300">
          {localStatusMessage}
        </p>
      )}
    </div>
  );
}
