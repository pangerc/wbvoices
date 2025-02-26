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
    <div className="p-8 h-full text-white">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Voice Script</h2>
        <button
          onClick={handleReset}
          className="rounded-md bg-white px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      <div className="space-y-6">
        {voiceTracks.map((track, index) => (
          <div
            key={index}
            className="space-y-4 md:grid md:grid-cols-3 md:gap-4"
          >
            <div className="w-full">
              <label className="block text-sm font-medium mb-2 text-white">
                Voice
              </label>
              <Listbox
                value={track.voice}
                onChange={(voice) => updateVoiceTrack(index, { voice })}
              >
                <div className="relative">
                  <Listbox.Button className="relative w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm sm:leading-6">
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
                        <span className="text-gray-500">Select a voice</span>
                      )}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon
                        className="h-5 w-5 text-gray-400"
                        aria-hidden="true"
                      />
                    </span>
                  </Listbox.Button>

                  <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {voices.map((voice) => (
                      <Listbox.Option
                        key={voice.id}
                        value={voice}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-3 pr-9 ${
                            active ? "bg-sky-100 text-sky-900" : "text-gray-900"
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
                                  active ? "text-sky-600" : "text-gray-500"
                                }`}
                              >
                                {[
                                  voice.gender &&
                                    voice.gender.charAt(0).toUpperCase() +
                                      voice.gender.slice(1),
                                  voice.accent,
                                  voice.isMultilingual && "Multilingual",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>

                            {selected && (
                              <span
                                className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                  active ? "text-sky-600" : "text-sky-600"
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
                <p className="mt-1 text-xs text-gray-500">
                  {[
                    track.voice.gender &&
                      track.voice.gender.charAt(0).toUpperCase() +
                        track.voice.gender.slice(1),
                    track.voice.accent,
                    track.voice.isMultilingual && "Multilingual",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2 text-white">
                Script
              </label>
              <textarea
                value={track.text}
                onChange={(e) =>
                  updateVoiceTrack(index, { text: e.target.value })
                }
                className="w-full bg-white rounded-md border-0 p-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
                rows={3}
                placeholder="Enter the script for this voice..."
              />
            </div>
          </div>
        ))}

        <div className="md:grid md:grid-cols-3 md:gap-4">
          <button
            onClick={addVoiceTrack}
            className="rounded-md bg-white px-2.5 py-1.5 text-sm  text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Add Voice Track
          </button>
          <button
            onClick={generateAudio}
            disabled={
              isGenerating || !voiceTracks.some((t) => t.voice && t.text)
            }
            className="md:col-span-2 rounded-md bg-sky-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate Audio"}
          </button>
        </div>

        {statusMessage && (
          <p className="text-center text-sm text-gray-300">{statusMessage}</p>
        )}
      </div>
    </div>
  );
}
