import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Provider } from "@/types";
import { getElevenLabsPresetSpeed, getProviderSpeedRange } from "@/lib/voice-presets";

interface VoiceInstructionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  voiceInstructions: string | undefined;
  speed?: number;
  provider: Provider; // Current global provider
  trackProvider?: Provider; // Track-specific provider override
  voiceDescription?: string;
  onSave: (instructions: string, speed: number | undefined, provider: Provider) => void;
}

const PLACEHOLDER = `Voice Affect: <brief description of overall voice character>
Tone: <brief description of emotional tone>
Pacing: <specify speed - slow/moderate/fast/rapid, with any tempo changes>
Emotion: <emotional delivery style>
Emphasis: <what words/phrases to highlight and how>
Pronunciation: <articulation style and clarity>
Pauses: <where to pause and for how long>

Example:
"Voice Affect: Energetic spokesperson with confident authority; Tone: Enthusiastic and persuasive; Pacing: Fast-paced with quick delivery, slowing slightly for key product benefits; Emotion: Excited and compelling; Emphasis: Strong emphasis on brand name and call-to-action; Pronunciation: Clear, crisp articulation; Pauses: Brief pause before call-to-action for impact."`;

export function VoiceInstructionsDialog({
  isOpen,
  onClose,
  voiceInstructions,
  speed,
  provider,
  trackProvider,
  voiceDescription,
  onSave,
}: VoiceInstructionsDialogProps) {
  const [instructionsValue, setInstructionsValue] = useState(voiceInstructions || "");

  // Use trackProvider if set, otherwise use global provider
  const initialProvider = trackProvider || provider;
  const [providerValue, setProviderValue] = useState<Provider>(initialProvider);

  // Calculate default speed based on current provider
  const getDefaultSpeed = (prov: Provider): number => {
    if (prov === "elevenlabs") {
      return getElevenLabsPresetSpeed(voiceDescription);
    }
    return 1.0; // OpenAI default
  };

  const [speedValue, setSpeedValue] = useState(speed ?? getDefaultSpeed(providerValue));
  const speedRange = getProviderSpeedRange(providerValue);
  const presetSpeed = providerValue === "elevenlabs" ? getElevenLabsPresetSpeed(voiceDescription) : null;

  // Handle provider change - reset speed to default for new provider
  const handleProviderChange = (newProvider: Provider) => {
    setProviderValue(newProvider);
    setSpeedValue(getDefaultSpeed(newProvider));
  };

  const handleSave = () => {
    // Only save speed if it differs from default/preset
    const shouldSaveSpeed = providerValue === "elevenlabs"
      ? speedValue !== presetSpeed
      : speedValue !== 1.0;

    onSave(instructionsValue, shouldSaveSpeed ? speedValue : undefined, providerValue);
    onClose();
  };

  const handleCancel = () => {
    setInstructionsValue(voiceInstructions || "");
    setProviderValue(initialProvider);
    setSpeedValue(speed ?? getDefaultSpeed(initialProvider));
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-xl font-bold text-white mb-2"
                >
                  Edit Voice Settings
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-300 mb-4">
                  {providerValue === "openai" && "Customize how this voice should deliver the script. These instructions control tone, pacing, emotion, and emphasis."}
                  {providerValue === "elevenlabs" && "Adjust playback speed for this voice track. Speed override applies to this voice track only."}
                </Dialog.Description>

                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Voice Provider
                    </label>
                    <select
                      value={providerValue}
                      onChange={(e) => handleProviderChange(e.target.value as Provider)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50"
                    >
                      <option value="elevenlabs" className="bg-gray-900">ElevenLabs</option>
                      <option value="openai" className="bg-gray-900">OpenAI</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {providerValue !== (trackProvider || provider) && "⚠️ Changing provider will require selecting a new voice"}
                    </p>
                  </div>
                  {/* Voice Instructions Textarea - OpenAI only */}
                  {providerValue === "openai" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Voice Instructions
                      </label>
                      <textarea
                        value={instructionsValue}
                        onChange={(e) => setInstructionsValue(e.target.value)}
                        placeholder={PLACEHOLDER}
                        className="w-full h-48 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50 resize-none"
                      />
                    </div>
                  )}

                  {/* Speed Control */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Speed Multiplier
                      </label>
                      <div className="text-sm text-gray-400">
                        {presetSpeed !== null && (
                          <span className="mr-3">
                            Preset: <span className="text-gray-300">{presetSpeed}x</span>
                          </span>
                        )}
                        <span>
                          Current: <span className="text-white font-medium">{speedValue.toFixed(2)}x</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-400 w-12 text-right">{speedRange.min}x</span>
                      <input
                        type="range"
                        min={speedRange.min}
                        max={speedRange.max}
                        step={0.05}
                        value={speedValue}
                        onChange={(e) => setSpeedValue(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-wb-blue [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-wb-blue [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                      />
                      <span className="text-xs text-gray-400 w-12">{speedRange.max}x</span>
                    </div>

                    <p className="text-xs text-gray-400 mt-2">
                      {providerValue === "elevenlabs" && "Custom speed overrides the preset speed from the voice tone."}
                      {providerValue === "openai" && "Adjust playback speed for this voice track (0.25x = very slow, 1.0x = normal, 4.0x = very fast)."}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 rounded-lg bg-wb-blue border border-wb-blue/30 text-white hover:bg-wb-blue/80 transition-all"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
