import React from "react";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/20/solid";
import { Voice, VoiceTrack } from "@/types";
import { getFlagCode } from "@/utils/language";

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

  // Handle local reset
  const handleReset = () => {
    resetForm();
  };

  return (
    <div className="p-8 h-full bg-black text-white flex flex-col">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">STUDIO</h1>

      <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase mr-24">
        Voice Script
      </h2>
      <button
        onClick={handleReset}
        className="bg-gray-800 px-2.5 py-1.5 text-sm text-white ring-1 ring-inset ring-gray-700 hover:bg-gray-700 ml-auto"
      >
        Reset
      </button>

      <div className="space-y-6">
        {voiceTracks.map((track, index) => (
          <div
            key={index}
            className="space-y-4 md:grid md:grid-cols-3 md:gap-4"
          >
            <div className="w-full">
              <label className="block text-sm font-medium mb-2">Voice</label>
              <Listbox
                value={track.voice}
                onChange={(voice) => updateVoiceTrack(index, { voice })}
              >
                <div className="relative">
                  <Listbox.Button className="relative w-full cursor-default bg-gray-800 py-1.5 pl-3 pr-10 text-left text-white ring-1 ring-inset ring-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm sm:leading-6">
                    <span className="flex items-center gap-2">
                      {track.voice ? (
                        <>
                          <span
                            className={`fi fi-${getFlagCode(
                              track.voice.language || selectedLanguage
                            )} fis`}
                          />
                          <span className="truncate">{track.voice.name}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Select a voice</span>
                      )}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon
                        className="h-5 w-5 text-gray-400"
                        aria-hidden="true"
                      />
                    </span>
                  </Listbox.Button>

                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto bg-gray-800 py-1 text-base shadow-lg ring-1 ring-gray-700 ring-opacity-5 focus:outline-none sm:text-sm">
                    {voices.map((voice) => (
                      <Listbox.Option
                        key={`${voice.id}`}
                        value={voice}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-3 pr-9 ${
                            active ? "bg-sky-700 text-white" : "text-white"
                          }`
                        }
                      >
                        {({ selected, active }) => (
                          <>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`fi fi-${getFlagCode(
                                    voice.language || selectedLanguage
                                  )} fis`}
                                />
                                <span
                                  className={`truncate ${
                                    selected ? "font-semibold" : "font-normal"
                                  }`}
                                >
                                  {voice.name}
                                </span>
                              </div>
                              <span
                                className={`text-xs ${
                                  active ? "text-sky-200" : "text-gray-400"
                                }`}
                              >
                                {voice.accent ? (
                                  <span
                                    className={`font-medium ${
                                      voice.language?.startsWith("ar-")
                                        ? "text-green-400"
                                        : "text-sky-300"
                                    }`}
                                  >
                                    {voice.accent} accent
                                  </span>
                                ) : null}
                                {[
                                  voice.gender &&
                                    voice.gender.charAt(0).toUpperCase() +
                                      voice.gender.slice(1),
                                  voice.isMultilingual && "Multilingual",
                                ]
                                  .filter(Boolean)
                                  .map((attr, i) => (
                                    <React.Fragment
                                      key={`${voice.id}-attr-${i}`}
                                    >
                                      {voice.accent || i > 0 ? " · " : ""}
                                      {attr}
                                    </React.Fragment>
                                  ))}
                              </span>
                            </div>

                            {selected && (
                              <span
                                className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                  active ? "text-white" : "text-sky-500"
                                }`}
                              >
                                <CheckIcon
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </span>
                            )}
                          </>
                        )}
                      </Listbox.Option>
                    ))}
                  </Listbox.Options>
                </div>
              </Listbox>
              {track.voice && (
                <p className="mt-1 text-xs text-gray-400">
                  {track.voice.accent ? (
                    <span
                      className={`font-medium ${
                        track.voice.language?.startsWith("ar-")
                          ? "text-green-400"
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

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Script</label>
              <textarea
                value={track.text}
                onChange={(e) =>
                  updateVoiceTrack(index, { text: e.target.value })
                }
                className="w-full bg-gray-800 border-0 p-1.5 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
                rows={3}
                placeholder="Enter the script for this voice..."
              />

              {/* Timing instructions for this voice track */}
              {track.playAfter && (
                <div className="mt-1 text-xs text-gray-300 bg-gray-800 p-2 rounded-sm border border-gray-700">
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
                  This voice will play sequentially after the previous element.
                </div>
              )}

              {index === 0 && !track.playAfter && (
                <div className="mt-1 text-xs text-gray-400 italic">
                  This voice will play at the beginning of the sequence.
                </div>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={addVoiceTrack}
          className="bg-gray-800 px-2.5 py-1.5 text-sm text-white border-dashed border border-gray-600 hover:bg-gray-700 w-full"
        >
          Add Voice Track
        </button>
        <button
          onClick={generateAudio}
          disabled={isGenerating || !voiceTracks.some((t) => t.voice && t.text)}
          className="md:col-span-2 bg-white px-2.5 py-1.5 text-lg uppercase font-medium text-black hover:bg-sky-500 hover:text-white focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 w-full"
        >
          {isGenerating ? "Generating..." : "Generate Audio"}
        </button>
      </div>

      {statusMessage && (
        <p className="text-center text-sm text-gray-300">{statusMessage}</p>
      )}
    </div>
  );
}
