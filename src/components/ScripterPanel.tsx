import React from "react";
import { Voice, VoiceTrack } from "@/types";
import { getFlagCode } from "@/utils/language";
import {
  GlassyListbox,
  GlassyTextarea,
  ResetButton,
  GenerateButton,
} from "./ui";

type ScripterPanelProps = {
  voiceTracks: VoiceTrack[];
  updateVoiceTrack: (index: number, updates: Partial<VoiceTrack>) => void;
  addVoiceTrack: () => void;
  generateAudio: () => void;
  isGenerating: boolean;
  statusMessage?: string;
  selectedLanguage: string;
  getFilteredVoices: () => Voice[];
  isVoicesLoading: boolean;
  resetForm: () => void;
};

export function ScripterPanel({
  voiceTracks,
  updateVoiceTrack,
  addVoiceTrack,
  generateAudio,
  isGenerating,
  statusMessage,
  selectedLanguage,
  getFilteredVoices,
  isVoicesLoading,
  resetForm,
}: ScripterPanelProps) {
  const voices = getFilteredVoices();

  // Create unique options with a counter to ensure uniqueness
  const createUniqueOptions = (index: number) => {
    const uniqueOptions: Array<{
      value: string;
      label: string;
      flag?: string;
      originalVoiceId: string;
    }> = [];

    let counter = 0;
    for (const voice of voices) {
      uniqueOptions.push({
        value: `track${index}-voice${counter}-${voice.id}`,
        label: voice.name,
        flag: getFlagCode(voice.language || selectedLanguage),
        originalVoiceId: voice.id,
      });
      counter++;
    }

    return uniqueOptions;
  };

  // Handle local reset
  const handleReset = () => {
    resetForm();
  };

  return (
    <div className="py-8  text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">
            Your Message, in the Right Voice
          </h1>
          <h2 className=" font-medium mb-12  ">
            Pick a voice and review or edit your script. Make it sound exactly
            how you want.
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          <GenerateButton
            onClick={generateAudio}
            disabled={!voiceTracks.some((t) => t.voice && t.text) || isVoicesLoading}
            isGenerating={isGenerating}
            text="Generate Voices"
            generatingText="Generating Voices..."
          />
        </div>
      </div>

      <div className="space-y-4 ">
        {voiceTracks.map((track, index) => {
          // Generate unique options for this track
          const uniqueOptions = createUniqueOptions(index);

          // Find the current selected option
          const selectedOption = track.voice
            ? uniqueOptions.find(
                (opt) => opt.originalVoiceId === track.voice?.id
              )?.value
            : "";

          return (
            <div
              key={`track-${index}`}
              className="space-y-4 md:grid md:grid-cols-3 md:gap-4 "
            >
              <div className="w-full">
                <GlassyListbox
                  label="Voice"
                  value={selectedOption || ""}
                  onChange={(uniqueValue) => {
                    // Find the selected option by its unique value
                    const option = uniqueOptions.find(
                      (opt) => opt.value === uniqueValue
                    );
                    if (option) {
                      // Find the original voice from the original voice ID
                      const selectedVoice = voices.find(
                        (v) => v.id === option.originalVoiceId
                      );
                      updateVoiceTrack(index, { voice: selectedVoice || null });
                    }
                  }}
                  options={uniqueOptions.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                    flag: opt.flag,
                  }))}
                  disabled={isVoicesLoading}
                />
                {isVoicesLoading && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Loading voices...</span>
                  </div>
                )}

                {/* Two neutral gray lines: speaker metadata + creative direction */}
                {track.voice && (
                  <div className="mt-2 text-xs text-gray-400 space-y-1">
                    <p>
                      <span className="font-medium text-gray-300">
                        Speaker:
                      </span>{" "}
                      {[
                        track.voice.name,
                        track.voice.accent && `${track.voice.accent} accent`,
                        track.voice.gender &&
                          track.voice.gender.charAt(0).toUpperCase() +
                            track.voice.gender.slice(1),
                        track.voice.style &&
                          track.voice.style !== "Default" &&
                          track.voice.style,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(track.style ||
                      track.useCase ||
                      track.voiceInstructions) && (
                      <p>
                        <span className="font-medium text-gray-300">
                          Creative:
                        </span>{" "}
                        {[
                          track.style && `Tone=${track.style}`,
                          track.useCase && `Use=${track.useCase}`,
                          track.voiceInstructions &&
                            `Instructions=${track.voiceInstructions}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                )}

                {track.voice && (
                  <div className="mt-2 pl-4 text-xs text-gray-400 space-y-1 hidden">
                    {/* Voice characteristics */}
                    <p>
                      {track.voice.accent ? (
                        <span
                          className={`font-medium ${
                            track.voice.language?.startsWith("ar-")
                              ? "text-green-800"
                              : "text-sky-300"
                          }`}
                        >
                          {track.voice.accent} accent
                        </span>
                      ) : null}
                      {[
                        track.voice.gender &&
                          track.voice.gender.charAt(0).toUpperCase() +
                            track.voice.gender.slice(1),
                        track.voice.age && `${track.voice.age}`,
                        track.voice.isMultilingual && "Multilingual",
                      ]
                        .filter(Boolean)
                        .map((attr, i) => (
                          <React.Fragment
                            key={`${track.voice?.id || index}-attr-${i}`}
                          >
                            {track.voice && (track.voice.accent || i > 0)
                              ? " · "
                              : ""}
                            {attr}
                          </React.Fragment>
                        ))}
                    </p>

                    {/* Provider speaker style metadata (e.g., Lovo) */}
                    {track.voice.style && track.voice.style !== "Default" && (
                      <div className="mt-1 text-xs">
                        <span className="text-amber-400 font-medium">
                          Speaker style:
                        </span>{" "}
                        <span className="text-amber-300">
                          {track.voice.style}
                        </span>
                      </div>
                    )}
                    {track.voice.description && (
                      <div className="mt-1 text-xs">
                        <span className="text-amber-400 font-medium">
                          Tone:
                        </span>{" "}
                        <span className="text-amber-300">
                          {track.voice.description}
                        </span>
                      </div>
                    )}
                    {track.voice.use_case &&
                      track.voice.use_case !== "general" && (
                        <div className="mt-1 text-xs">
                          <span className="text-amber-400 font-medium">
                            Best for:
                          </span>{" "}
                          <span className="text-amber-300">
                            {track.voice.use_case}
                          </span>
                        </div>
                      )}

                    {/* Emotional dimensions from LLM */}
                    {(track.style ||
                      track.useCase ||
                      track.voiceInstructions) && (
                      <div className="bg-purple-900/20 border border-purple-500/30 rounded p-2 mt-2">
                        <p className="text-purple-300 font-medium mb-1">
                          🎭 LLM Creative Instructions:
                        </p>
                        {track.style && (
                          <p className="text-purple-200">
                            <span className="font-medium">Style:</span>{" "}
                            {track.style}
                          </p>
                        )}
                        {track.useCase && (
                          <p className="text-purple-200">
                            <span className="font-medium">Use Case:</span>{" "}
                            {track.useCase}
                          </p>
                        )}
                        {track.voiceInstructions && (
                          <p className="text-purple-200">
                            <span className="font-medium">
                              Voice Instructions:
                            </span>{" "}
                            {track.voiceInstructions}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="col-span-2 ">
                <GlassyTextarea
                  label="Script"
                  value={track.text}
                  onChange={(e) =>
                    updateVoiceTrack(index, { text: e.target.value })
                  }
                  placeholder="Enter the script for this voice..."
                  className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  minRows={3}
                />

                {/* Timing instructions for this voice track */}
                {track.playAfter && (
                  <div className="mt-4 pl-4 text-xs text-gray-300 bg-gray-800 p-2 rounded-sm border border-gray-700">
                    <span className="font-medium text-gray-200">Timing: </span>
                    {track.playAfter === "previous" ? (
                      <span>Plays after previous element</span>
                    ) : (
                      <span>Plays after {track.playAfter}</span>
                    )}
                    {track.overlap && track.overlap > 0 && (
                      <span className="ml-1 text-sky-300">
                        (overlaps by {track.overlap}s)
                      </span>
                    )}
                  </div>
                )}

                {!track.playAfter && index > 0 && (
                  <div className="mt-4 text-xs text-gray-600">
                    This voice will play sequentially after the previous
                    element.
                  </div>
                )}

                {index === 0 && !track.playAfter && (
                  <div className="mt-3 pl-4 text-xs text-gray-600 ">
                    This voice will play at the beginning of the sequence.
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <button
          onClick={addVoiceTrack}
          className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent  w-full text-sky-700 hover:bg-gradient-to-t  hover:text-white "
        >
          + Add Voice Track
        </button>
      </div>

      {statusMessage && (
        <p className="text-center  text-gray-500 pt-8">{statusMessage}</p>
      )}
    </div>
  );
}
