import React, { useState, useEffect } from "react";
import { PlayIcon, StopIcon } from "@heroicons/react/24/solid";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Voice, VoiceTrack, Provider } from "@/types";
import type { VoiceTrackGenerationStatus } from "@/types/versions";
import { getEffectiveProvider } from "@/lib/voice-utils";
import {
  HighlightedScriptTextarea,
  VoiceCombobox,
  VoiceInstructionsDialog,
  Tooltip,
  LoadingSpinner,
} from "./ui";
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
  // Per-track play (smart: plays existing or generates + plays)
  onPlay?: (index: number) => void;
  trackGenerationStatus?: VoiceTrackGenerationStatus[];
  generateButtonText?: string;
  // Allow showing only first track in minimal mode
  minimalMode?: boolean;
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
  onPlay,
  trackGenerationStatus,
  generateButtonText,
  minimalMode,
}: ScripterPanelProps) {
  const [editingInstructionsIndex, setEditingInstructionsIndex] = useState<
    number | null
  >(null);

  // Voice loading - only load for the VERSION's provider (not all providers)
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Helper to get voices for a track (handles overrideVoices and deduplication)
  const getVoicesForTrack = (): Voice[] => {
    if (overrideVoices) return overrideVoices;

    // Deduplicate voices
    const seen = new Set<string>();
    return voices.filter((voice) => {
      if (seen.has(voice.id)) {
        return false;
      }
      seen.add(voice.id);
      return true;
    });
  };

  // Load voices for the VERSION's provider only (not both providers)
  useEffect(() => {
    if (overrideVoices) {
      console.log("🎯 ScripterPanel using overrideVoices, skipping server load");
      return;
    }

    const loadVoices = async () => {
      setIsLoadingVoices(true);

      // Use the version's provider - "any" shouldn't reach here but handle gracefully
      const effectiveProvider = selectedProvider === "any" ? "elevenlabs" : selectedProvider;

      try {
        const url = new URL("/api/voice-catalogue", window.location.origin);
        url.searchParams.set("operation", "filtered-voices");
        url.searchParams.set("language", selectedLanguage);
        url.searchParams.set("provider", effectiveProvider);
        url.searchParams.set("campaignFormat", campaignFormat);
        url.searchParams.set("requireApproval", "true");

        if (selectedRegion && selectedRegion !== "all" && hasRegions) {
          url.searchParams.set("region", selectedRegion);
        }
        if (selectedAccent && selectedAccent !== "neutral") {
          url.searchParams.set("accent", selectedAccent);
        }

        const response = await fetch(url);
        const data = await response.json();

        if (!data.error) {
          // Ensure provider field is set on each voice
          const loadedVoices = (data.voices || []).map((v: Voice) => ({
            ...v,
            provider: effectiveProvider,
          }));
          setVoices(loadedVoices);
          console.log(`✅ ScripterPanel loaded ${loadedVoices.length} ${effectiveProvider} voices`);
        } else {
          console.error(`❌ ScripterPanel voice load error:`, data.error);
          setVoices([]);
        }
      } catch (error) {
        console.error("ScripterPanel voice loading error:", error);
        setVoices([]);
      }

      setIsLoadingVoices(false);
    };

    loadVoices();
  }, [
    selectedLanguage,
    selectedRegion,
    selectedAccent,
    campaignFormat,
    hasRegions,
    selectedProvider,
    overrideVoices,
  ]);

  // Handle local reset
  const handleReset = () => {
    resetForm();
  };

  return (
    <div className="py-4 text-white">
      <div className="space-y-4">
        {voiceTracks.map((track, index) => {
          return (
            <div
              key={`track-${index}`}
              className="space-y-4 md:grid md:grid-cols-3 md:gap-4 "
            >
              <div className="w-full">
                {/* Voice Combobox */}
                <VoiceCombobox
                  label={
                    track.trackProvider
                      ? `Voice (${
                          track.trackProvider === "openai"
                            ? "OpenAI"
                            : "ElevenLabs"
                        })`
                      : "Voice"
                  }
                  value={track.voice}
                  onChange={(voice) => updateVoiceTrack(index, { voice })}
                  voices={getVoicesForTrack()}
                  disabled={isLoadingVoices}
                  loading={isLoadingVoices}
                />

                {/* Voice metadata in single line */}
                {track.voice && (
                  <div className="mt-2 text-xs text-gray-400">
                    <p>
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
                      {track.voice.description &&
                        selectedProvider === "elevenlabs" && (
                          <span className="text-gray-500">
                            {" "}
                            · {track.voice.description}
                          </span>
                        )}
                    </p>
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
                    <HighlightedScriptTextarea
                      label="Script"
                      value={track.text}
                      onChange={(text) => updateVoiceTrack(index, { text })}
                      placeholder="Enter the script for this voice..."
                      minRows={3}
                    />
                  </div>
                  {/* Action buttons - Play + Config */}
                  <div className="flex flex-col gap-2 w-10">
                    <label className="block mb-2 text-white opacity-0 pointer-events-none">
                      &nbsp;
                    </label>

                    {/* Play button (smart: plays existing or generates + plays) */}
                    {onPlay && trackGenerationStatus && (
                      <Tooltip
                        content={
                          trackGenerationStatus[index]?.isPlaying
                            ? "Stop playback"
                            : trackGenerationStatus[index]?.hasAudio
                              ? "Play this track"
                              : "Generate and play this track"
                        }
                      >
                        <button
                          onClick={() => onPlay(index)}
                          disabled={
                            !track.voice ||
                            !track.text.trim() ||
                            trackGenerationStatus[index]?.isGenerating
                          }
                          className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            trackGenerationStatus[index]?.isPlaying
                              ? "text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20 hover:border-red-500/30"
                              : trackGenerationStatus[index]?.hasAudio
                                ? "text-green-400 hover:text-green-300 hover:bg-green-500/10 border-green-500/20 hover:border-green-500/30"
                                : "text-wb-blue hover:text-blue-400 hover:bg-wb-blue/10 border-wb-blue/20 hover:border-wb-blue/30"
                          }`}
                        >
                        {trackGenerationStatus[index]?.isGenerating ? (
                          <LoadingSpinner size="sm" />
                        ) : trackGenerationStatus[index]?.isPlaying ? (
                          <StopIcon className="w-4 h-4" />
                        ) : (
                          <PlayIcon className="w-4 h-4" />
                        )}
                        </button>
                      </Tooltip>
                    )}

                    {/* Configure button */}
                    {(selectedProvider === "openai" ||
                      selectedProvider === "elevenlabs" ||
                      selectedProvider === "lahajati") && (
                      <Tooltip content="Configure voice settings">
                        <button
                          onClick={() => setEditingInstructionsIndex(index)}
                          className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all ${
                            track.speed !== undefined || track.voiceInstructions
                              ? "text-wb-blue bg-wb-blue/10 border-wb-blue/20"
                              : "text-gray-500 hover:text-wb-blue hover:bg-wb-blue/10 border-transparent hover:border-wb-blue/20"
                          }`}
                        >
                          <Cog6ToothIcon className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <Tooltip content="Add another voice track" side="bottom">
          <button
            onClick={addVoiceTrack}
            className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent  w-full text-sky-700 hover:bg-gradient-to-t  hover:text-white "
          >
            + Add Voice Track
          </button>
        </Tooltip>

        {statusMessage && (
          <p className="text-center  text-gray-500 pt-8">{statusMessage}</p>
        )}
      </div>

      {/* Voice Instructions Dialog */}
      {editingInstructionsIndex !== null && (
        <VoiceInstructionsDialog
          isOpen={true}
          onClose={() => setEditingInstructionsIndex(null)}
          voiceInstructions={
            voiceTracks[editingInstructionsIndex]?.voiceInstructions
          }
          speed={voiceTracks[editingInstructionsIndex]?.speed}
          postProcessingSpeedup={
            voiceTracks[editingInstructionsIndex]?.postProcessingSpeedup
          }
          postProcessingPitch={
            voiceTracks[editingInstructionsIndex]?.postProcessingPitch
          }
          targetDuration={voiceTracks[editingInstructionsIndex]?.targetDuration}
          provider={selectedProvider as Provider}
          trackProvider={getEffectiveProvider(voiceTracks[editingInstructionsIndex], selectedProvider as Provider)}
          voiceDescription={
            voiceTracks[editingInstructionsIndex]?.voice?.description
          }
          dialectId={voiceTracks[editingInstructionsIndex]?.dialectId}
          performanceId={voiceTracks[editingInstructionsIndex]?.performanceId}
          onSave={(
            instructions,
            speed,
            provider,
            postProcessingSpeedup,
            postProcessingPitch,
            targetDuration,
            dialectId,
            performanceId
          ) => {
            const currentTrack = voiceTracks[editingInstructionsIndex];
            const providerChanged =
              provider !== (currentTrack.trackProvider || selectedProvider);

            updateVoiceTrack(editingInstructionsIndex, {
              voiceInstructions: instructions,
              speed: speed,
              trackProvider: provider,
              postProcessingSpeedup: postProcessingSpeedup,
              postProcessingPitch: postProcessingPitch,
              targetDuration: targetDuration,
              dialectId: dialectId,
              performanceId: performanceId,
              // Clear voice if provider changed (user needs to select new voice)
              voice: providerChanged ? null : currentTrack.voice,
            });
          }}
          onDelete={
            voiceTracks.length > 1
              ? () => removeVoiceTrack(editingInstructionsIndex)
              : undefined
          }
        />
      )}
    </div>
  );
}
