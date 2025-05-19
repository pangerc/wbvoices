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
            disabled={!voiceTracks.some((t) => t.voice && t.text)}
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
                />

                {track.voice && (
                  <p className="mt-2 pl-4 text-xs text-gray-400">
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
                  <div className="mt-1 text-xs text-gray-400 italic">
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
