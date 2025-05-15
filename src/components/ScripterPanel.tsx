import React from "react";
import { Voice, VoiceTrack } from "@/types";
import { getFlagCode } from "@/utils/language";
import { GlassyListbox, GlassyTextarea } from "./ui";

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
        {/* Generate button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className=" text-sm text-white  hover:underline hover:cursor-pointer"
          >
            <svg
              viewBox="-0.5 -0.5 16 16"
              xmlns="http://www.w3.org/2000/svg"
              height="16"
              width="16"
              className="ml-2 h-4 w-auto"
            >
              <path
                d="m11.465 5.75 -2.375 -4.1762500000000005a1.875 1.875 0 0 0 -3.25 0l-0.66125 1.14375"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="M7.46375 12.5625H12.1875a1.875 1.875 0 0 0 1.625 -2.8125l-0.8125 -1.40625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m3.4962500000000003 5.53 -2.375 4.21875a1.875 1.875 0 0 0 1.625 2.8125h1.9075"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m9.338750000000001 10.68625 -1.875 1.875 1.875 1.875"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m12.151250000000001 3.18625 -0.68625 2.56125 -2.56125 -0.68625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m0.935 6.21625 2.56125 -0.68625 0.68625 2.56125"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
            </svg>
          </button>
          <button
            onClick={generateAudio}
            disabled={
              isGenerating || !voiceTracks.some((t) => t.voice && t.text)
            }
            className=" bg-wb-blue font-medium rounded-full px-5 py-3 text  text-white  hover:bg-sky-500 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-gray-700 flex items-center gap-2"
          >
            {isGenerating ? "Generating Voices..." : "Generate Voices"}
            <svg
              width="17"
              height="21"
              viewBox="0 0 17 21"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g clipPath="url(#clip0_1_8990)">
                <path
                  d="M7.49558 4.14887C7.60619 4.14887 7.66581 4.08072 7.68281 3.97849C7.93815 2.59836 7.91259 2.53021 9.39347 2.26611C9.49558 2.24055 9.56363 2.18092 9.56363 2.07017C9.56363 1.96794 9.49558 1.89978 9.39347 1.88274C7.91259 1.61865 7.93815 1.55049 7.68281 0.17037C7.66581 0.0681389 7.60619 -1.52588e-05 7.49558 -1.52588e-05C7.3849 -1.52588e-05 7.32537 0.0681389 7.30834 0.17037C7.05303 1.55049 7.07856 1.61865 5.5977 1.88274C5.48706 1.89978 5.42749 1.96794 5.42749 2.07017C5.42749 2.18092 5.48706 2.24055 5.5977 2.26611C7.07856 2.53021 7.05303 2.59836 7.30834 3.97849C7.32537 4.08072 7.3849 4.14887 7.49558 4.14887Z"
                  fill="white"
                />
                <path
                  d="M3.37646 10.0101C3.53816 10.0101 3.6488 9.8994 3.66582 9.74601C3.9722 7.47136 4.0488 7.47136 6.39774 7.01988C6.54242 6.99431 6.65306 6.89209 6.65306 6.73022C6.65306 6.57688 6.54242 6.46612 6.39774 6.44908C4.0488 6.11683 3.96369 6.04016 3.66582 3.73143C3.6488 3.56957 3.53816 3.45882 3.37646 3.45882C3.22326 3.45882 3.11263 3.56957 3.08709 3.73995C2.81475 6.0146 2.68709 6.00608 0.355173 6.44908C0.210492 6.47464 0.0998535 6.57688 0.0998535 6.73022C0.0998535 6.90061 0.210492 6.99431 0.389216 7.01988C2.70412 7.39474 2.81475 7.45435 3.08709 9.729C3.11263 9.8994 3.22326 10.0101 3.37646 10.0101Z"
                  fill="white"
                />
                <path
                  d="M9.14659 19.4325C9.36788 19.4325 9.52961 19.2706 9.57217 19.0406C10.1764 14.3805 10.8317 13.6649 15.4445 13.1538C15.6828 13.1282 15.8445 12.9578 15.8445 12.7278C15.8445 12.5063 15.6828 12.3359 15.4445 12.3103C10.8317 11.7992 10.1764 11.0836 9.57217 6.415C9.52961 6.18497 9.36788 6.03163 9.14659 6.03163C8.92531 6.03163 8.76364 6.18497 8.72958 6.415C8.12535 11.0836 7.46149 11.7992 2.85724 12.3103C2.61043 12.3359 2.44873 12.5063 2.44873 12.7278C2.44873 12.9578 2.61043 13.1282 2.85724 13.1538C7.45299 13.7586 8.09129 14.3805 8.72958 19.0406C8.76364 19.2706 8.92531 19.4325 9.14659 19.4325Z"
                  fill="white"
                />
              </g>
              <defs>
                <clipPath id="clip0_1_8990">
                  <rect
                    width="16"
                    height="21"
                    fill="white"
                    transform="translate(0.0998535)"
                  />
                </clipPath>
              </defs>
            </svg>
          </button>
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
          className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent  w-full text-sky-700 hover:bg-gradient-to-t hover:from-red-700/70 hover:to-sky-transparent hover:text-white hover:border-red-700"
        >
          + Add Voice Track
        </button>
      </div>

      {statusMessage && (
        <p className="text-center text-sm text-gray-300">{statusMessage}</p>
      )}
    </div>
  );
}
