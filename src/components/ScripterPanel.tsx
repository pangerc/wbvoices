import React, { useState, useEffect } from "react";
import { Voice, VoiceTrack, Provider } from "@/types";
import {
  GlassyTextarea,
  ResetButton,
  GenerateButton,
  GlassTabBar,
  GlassTab,
  VoiceCombobox,
  TestVoiceButton,
  VoiceInstructionsDialog,
} from "./ui";
import { PronunciationEditor } from "./PronunciationEditor";

type ScripterMode = 'script' | 'pronunciation';

type ScripterPanelProps = {
  voiceTracks: VoiceTrack[];
  updateVoiceTrack: (index: number, updates: Partial<VoiceTrack>) => void;
  addVoiceTrack: () => void;
  removeVoiceTrack: (index: number) => void;
  generateAudio: (provider?: Provider, voiceTracks?: VoiceTrack[]) => void;
  isGenerating: boolean;
  statusMessage?: string;
  selectedLanguage: string;
  selectedProvider: string;
  selectedRegion: string | null;
  selectedAccent: string;
  campaignFormat: string;
  hasRegions: boolean;
  resetForm: () => void;
  overrideVoices?: Voice[] | null;
};

export function ScripterPanel({
  voiceTracks,
  updateVoiceTrack,
  addVoiceTrack,
  removeVoiceTrack,
  generateAudio,
  isGenerating,
  statusMessage,
  selectedLanguage,
  selectedProvider,
  selectedRegion,
  selectedAccent,
  campaignFormat,
  hasRegions,
  resetForm,
  overrideVoices,
}: ScripterPanelProps) {
  const [mode, setMode] = useState<ScripterMode>('script');
  const [editingInstructionsIndex, setEditingInstructionsIndex] = useState<number | null>(null);

  // 🔥 Clean server-side voice loading (matching BriefPanel architecture)
  const [serverVoices, setServerVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // 🎯 Use overrideVoices if provided (project restoration), otherwise use server voices
  const voices = overrideVoices || serverVoices;

  // 🔥 Load voices from server when language/provider changes
  useEffect(() => {
    // If we have overrideVoices (project restoration), skip server loading
    if (overrideVoices) {
      console.log('🎯 ScripterPanel using overrideVoices, skipping server load');
      return;
    }

    const loadVoices = async () => {
      setIsLoadingVoices(true);
      try {
        console.log(`🔄 ScripterPanel loading voices: ${selectedLanguage}/${selectedProvider}/${campaignFormat}`);
        
        const url = new URL("/api/voice-catalogue", window.location.origin);
        url.searchParams.set("operation", "filtered-voices");
        url.searchParams.set("language", selectedLanguage);

        // Only set region if it's not "all" and has regions
        if (selectedRegion && selectedRegion !== "all" && hasRegions) {
          url.searchParams.set("region", selectedRegion);
        }

        // Set accent if not neutral
        if (selectedAccent && selectedAccent !== "neutral") {
          url.searchParams.set("accent", selectedAccent);
        }

        url.searchParams.set("provider", selectedProvider);
        url.searchParams.set("campaignFormat", campaignFormat);
        url.searchParams.set("exclude", "lovo"); // Exclude Lovo (poor quality)
        url.searchParams.set("requireApproval", "true"); // Filter out blacklisted voices

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          console.error("❌ ScripterPanel failed to load voices:", data.error);
          setServerVoices([]);
        } else {
          console.log(`✅ ScripterPanel loaded ${data.count} voices for ${selectedLanguage}/${selectedProvider}`);
          setServerVoices(data.voices || []);
        }
      } catch (error) {
        console.error("ScripterPanel voice loading error:", error);
        setServerVoices([]);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    loadVoices();
  }, [selectedLanguage, selectedProvider, selectedRegion, selectedAccent, campaignFormat, hasRegions, overrideVoices]);

  // Handle local reset
  const handleReset = () => {
    setMode('script');
    resetForm();
  };

  return (
    <div className="py-8  text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">
            {mode === 'script'
              ? 'Your Message, in the Right Voice'
              : 'Brand Pronunciations'
            }
          </h1>
          <h2 className=" font-medium mb-12  ">
            {mode === 'script'
              ? 'Pick a voice and review or edit your script. Make it sound exactly how you want.'
              : 'Customize how brand names and words are pronounced in ElevenLabs voices.'
            }
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          {mode === 'script' && (
            <GenerateButton
              onClick={() => generateAudio(selectedProvider as Provider, voiceTracks)}
              disabled={!voiceTracks.some((t) => t.voice && t.text) || isLoadingVoices}
              isGenerating={isGenerating}
              text="Generate Voices"
              generatingText="Generating Voices..."
            />
          )}
        </div>
      </div>

      {/* Mode Toggle - show for ElevenLabs and OpenAI */}
      {(selectedProvider === 'elevenlabs' || selectedProvider === 'openai') && (
        <div className="flex justify-center mb-8">
          <GlassTabBar>
            <GlassTab
              isActive={mode === 'script'}
              onClick={() => setMode('script')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 10" height="16" width="16">
                <path stroke={mode === 'script' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M2.92356 2.83667h4.15287" strokeWidth="1"></path>
                <path stroke={mode === 'script' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M2.92356 5.16333h2.76858" strokeWidth="1"></path>
                <path stroke={mode === 'script' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M9.5 6.5c0 0.26522 -0.10536 0.51957 -0.29289 0.70711C9.01957 7.39464 8.76522 7.5 8.5 7.5H5l-2.5 2v-2h-1c-0.26522 0 -0.51957 -0.10536 -0.707107 -0.29289C0.605357 7.01957 0.5 6.76522 0.5 6.5v-5c0 -0.26522 0.105357 -0.51957 0.292893 -0.707107C0.98043 0.605357 1.23478 0.5 1.5 0.5h7c0.26522 0 0.51957 0.105357 0.70711 0.292893C9.39464 0.98043 9.5 1.23478 9.5 1.5z" strokeWidth="1"></path>
              </svg>
            </GlassTab>
            <GlassTab
              isActive={mode === 'pronunciation'}
              onClick={() => setMode('pronunciation')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 10" height="16" width="16">
                <path stroke={mode === 'pronunciation' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M0.5 9.5h2a1 1 0 0 0 1 -1V6.49l0.66 0.004c0.463 0.003 0.84 -0.37 0.84 -0.833v0a0.833 0.833 0 0 0 -0.06 -0.31C3.96 2.9 2.95 0.5 0.5 0.5" strokeWidth="1"></path>
                <path stroke={mode === 'pronunciation' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M7.161 5.736a1.97 1.97 0 0 1 0 1.996" strokeWidth="1"></path>
                <path stroke={mode === 'pronunciation' ? "#2F7DFA" : "#FFFFFF"} strokeLinecap="round" strokeLinejoin="round" d="M8.354 3.968a3.91 3.91 0 0 1 0 5.532" strokeWidth="1"></path>
              </svg>
            </GlassTab>
          </GlassTabBar>
        </div>
      )}

      {mode === 'script' ? (
        <div className="space-y-4 ">
          {voiceTracks.map((track, index) => {
          return (
            <div
              key={`track-${index}`}
              className="space-y-4 md:grid md:grid-cols-3 md:gap-4 "
            >
              <div className="w-full">
                {/* Voice Combobox */}
                <VoiceCombobox
                  label="Voice"
                  value={track.voice}
                  onChange={(voice) => updateVoiceTrack(index, { voice })}
                  voices={voices}
                  disabled={isLoadingVoices}
                  loading={isLoadingVoices}
                />

                {/* Three neutral gray lines: speaker metadata + description + creative direction */}
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
                    {track.voice.description && selectedProvider === 'elevenlabs' && (
                      <p>
                        <span className="font-medium text-gray-300">
                          Description:
                        </span>{" "}
                        <span className="text-gray-300">{track.voice.description}</span>
                      </p>
                    )}
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
                            <span
                              key="instructions"
                              onClick={() => setEditingInstructionsIndex(index)}
                              className="cursor-pointer hover:text-wb-blue transition-colors inline-flex items-center gap-1"
                              title="Click to edit voice instructions"
                            >
                              Instructions={track.voiceInstructions}
                              <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </span>,
                        ]
                          .filter(Boolean)
                          .reduce((acc: React.ReactNode[], curr, i) =>
                            i === 0 ? [curr] : [...acc, " · ", curr],
                            []
                          )}
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
                {/* Script + Preview + Remove Buttons */}
                <div className="flex gap-2">
                  <div className="flex-1">
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
                  </div>
                  {/* Action buttons aligned with label */}
                  <div className="flex flex-col gap-2">
                    <label className="block mb-2 text-white opacity-0 pointer-events-none">
                      &nbsp;
                    </label>
                    <TestVoiceButton
                      voice={track.voice}
                      text={track.text}
                      style={track.style}
                      useCase={track.useCase}
                      voiceInstructions={track.voiceInstructions}
                      provider={selectedProvider as Provider}
                      disabled={!track.voice || !track.text.trim()}
                    />
                    {/* Remove button - only show if more than 1 track */}
                    {voiceTracks.length > 1 && (
                      <button
                        onClick={() => removeVoiceTrack(index)}
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                        title="Remove this voice track"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

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

          {statusMessage && (
            <p className="text-center  text-gray-500 pt-8">{statusMessage}</p>
          )}
        </div>
      ) : (
        /* Pronunciation Mode */
        <PronunciationEditor />
      )}

      {/* Voice Instructions Dialog */}
      {editingInstructionsIndex !== null && (
        <VoiceInstructionsDialog
          isOpen={true}
          onClose={() => setEditingInstructionsIndex(null)}
          voiceInstructions={voiceTracks[editingInstructionsIndex]?.voiceInstructions}
          onSave={(instructions) => {
            updateVoiceTrack(editingInstructionsIndex, {
              voiceInstructions: instructions,
            });
          }}
        />
      )}
    </div>
  );
}
