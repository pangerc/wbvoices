import React, { useState, Fragment, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Provider } from "@/types";
import { getElevenLabsPresetSpeed, getProviderSpeedRange } from "@/lib/voice-presets";

// Types for Lahajati metadata
type LahajatiDialectOption = {
  id: number;
  name: string;
  nameEn: string;
  country: string;
};

type LahajatiPerformanceOption = {
  id: number;
  name: string;
  nameEn: string;
};

interface VoiceInstructionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  voiceInstructions: string | undefined;
  speed?: number;
  postProcessingSpeedup?: number;
  postProcessingPitch?: number;
  targetDuration?: number;
  provider: Provider; // Current global provider
  trackProvider?: Provider; // Track-specific provider override
  voiceDescription?: string;
  // Lahajati-specific props
  dialectId?: number;
  performanceId?: number;
  onSave: (
    instructions: string,
    speed: number | undefined,
    provider: Provider,
    postProcessingSpeedup?: number,
    postProcessingPitch?: number,
    targetDuration?: number,
    dialectId?: number,
    performanceId?: number
  ) => void;
  // Optional delete callback - shows delete button when provided
  onDelete?: () => void;
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

const LAHAJATI_PLACEHOLDER = `اقرأ بصوت واثق وحماسي كأنك مذيع رياضي

Example personas:
• "اقرأ النص بصوت عالٍ وواضح، كأنك تقدم نشرة إخبارية عاجلة"
  (Read loudly and clearly, as if presenting urgent news)
• "تحدث بهدوء ودفء كأنك تروي قصة لطفل"
  (Speak calmly and warmly, as if telling a story to a child)
• "بصوت ثقة هادئة كمستشار مالي محترف"
  (With calm confidence like a professional financial advisor)`;

export function VoiceInstructionsDialog({
  isOpen,
  onClose,
  voiceInstructions,
  speed,
  postProcessingSpeedup,
  postProcessingPitch,
  targetDuration,
  provider,
  trackProvider,
  voiceDescription,
  dialectId,
  performanceId,
  onSave,
  onDelete,
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

  // Post-processing state (ElevenLabs only)
  const [postSpeedup, setPostSpeedup] = useState(postProcessingSpeedup || 1.0);
  const [postPitch, setPostPitch] = useState(postProcessingPitch || 1.0);
  const [targetDur, setTargetDur] = useState(targetDuration || undefined);

  // Tab state for ElevenLabs (smart-speed, fit-duration, advanced)
  const [elevenLabsTab, setElevenLabsTab] = useState<'smart-speed' | 'fit-duration' | 'advanced'>('smart-speed');

  // Lahajati-specific state
  const [lahajatiDialects, setLahajatiDialects] = useState<LahajatiDialectOption[]>([]);
  const [lahajatiPerformances, setLahajatiPerformances] = useState<LahajatiPerformanceOption[]>([]);
  const [selectedDialectId, setSelectedDialectId] = useState<number | undefined>(dialectId);
  const [selectedPerformanceId, setSelectedPerformanceId] = useState<number | undefined>(performanceId);
  const [lahajatiLoading, setLahajatiLoading] = useState(false);
  const [dialectSearch, setDialectSearch] = useState("");
  const [performanceSearch, setPerformanceSearch] = useState("");

  // Fetch Lahajati metadata when dialog opens and provider is lahajati
  useEffect(() => {
    if (isOpen && providerValue === "lahajati" && lahajatiDialects.length === 0) {
      setLahajatiLoading(true);
      fetch("/api/lahajati/metadata")
        .then((res) => res.json())
        .then((data) => {
          setLahajatiDialects(data.dialects || []);
          setLahajatiPerformances(data.adPerformances || []);
        })
        .catch((err) => {
          console.error("Failed to fetch Lahajati metadata:", err);
        })
        .finally(() => {
          setLahajatiLoading(false);
        });
    }
  }, [isOpen, providerValue, lahajatiDialects.length]);

  // Filter dialects by search term
  const filteredDialects = lahajatiDialects.filter(
    (d) =>
      d.name.includes(dialectSearch) ||
      d.nameEn.toLowerCase().includes(dialectSearch.toLowerCase()) ||
      d.country.toLowerCase().includes(dialectSearch.toLowerCase())
  );

  // Group dialects by country
  const dialectsByCountry = filteredDialects.reduce((acc, d) => {
    if (!acc[d.country]) acc[d.country] = [];
    acc[d.country].push(d);
    return acc;
  }, {} as Record<string, LahajatiDialectOption[]>);

  // Filter performances by search term
  const filteredPerformances = lahajatiPerformances.filter(
    (p) =>
      p.name.includes(performanceSearch) ||
      p.nameEn.toLowerCase().includes(performanceSearch.toLowerCase())
  );

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

    // Post-processing params (ElevenLabs only) - save based on active tab
    let finalPostSpeedup: number | undefined;
    let finalPostPitch: number | undefined;
    let finalTargetDur: number | undefined;

    if (providerValue === "elevenlabs") {
      if (elevenLabsTab === "smart-speed") {
        if (postSpeedup !== 1.0) finalPostSpeedup = postSpeedup;
        if (postPitch !== 1.0) finalPostPitch = postPitch;
      } else if (elevenLabsTab === "fit-duration" && targetDur) {
        finalTargetDur = targetDur;
        if (postPitch !== 1.0) finalPostPitch = postPitch; // Allow pitch adjustment in fit-duration mode too
      }
      // advanced tab only uses native speed (no post-processing)
    }

    // Lahajati-specific params
    const finalDialectId = providerValue === "lahajati" ? selectedDialectId : undefined;
    const finalPerformanceId = providerValue === "lahajati" ? selectedPerformanceId : undefined;

    onSave(
      instructionsValue,
      shouldSaveSpeed ? speedValue : undefined,
      providerValue,
      finalPostSpeedup,
      finalPostPitch,
      finalTargetDur,
      finalDialectId,
      finalPerformanceId
    );
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
                  {providerValue === "lahajati" && "Provide Arabic persona/role instructions describing HOW to speak (e.g., 'read confidently like a news anchor')."}
                  {(providerValue === "qwen" || providerValue === "lovo" || providerValue === "bytedance") && "This provider uses plain text scripts without special formatting or speed controls."}
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
                      <option value="lahajati" className="bg-gray-900">Lahajati</option>
                      <option value="qwen" className="bg-gray-900">Qwen</option>
                      <option value="lovo" className="bg-gray-900">Lovo</option>
                      <option value="bytedance" className="bg-gray-900">ByteDance</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      {providerValue !== (trackProvider || provider) && "⚠️ Changing provider will require selecting a new voice"}
                    </p>
                  </div>
                  {/* Lahajati Dialect and Performance Selection */}
                  {providerValue === "lahajati" && (
                    <div className="space-y-4">
                      {lahajatiLoading ? (
                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-center">
                          <p className="text-sm text-gray-400">Loading dialect and performance options...</p>
                        </div>
                      ) : (
                        <>
                          {/* Dialect Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Arabic Dialect
                            </label>
                            <input
                              type="text"
                              placeholder="Search dialects... (e.g., Egyptian, Cairo, Saudi)"
                              value={dialectSearch}
                              onChange={(e) => setDialectSearch(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-gray-500 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-wb-blue/50"
                            />
                            <select
                              value={selectedDialectId || ""}
                              onChange={(e) => setSelectedDialectId(e.target.value ? parseInt(e.target.value) : undefined)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50"
                            >
                              <option value="" className="bg-gray-900">Select dialect (LLM default)</option>
                              {Object.entries(dialectsByCountry).map(([country, dialects]) => (
                                <optgroup key={country} label={country.charAt(0).toUpperCase() + country.slice(1)} className="bg-gray-900">
                                  {dialects.map((d) => (
                                    <option key={d.id} value={d.id} className="bg-gray-900">
                                      {d.nameEn} - {d.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Select specific dialect for authentic regional delivery. Cairo Slang recommended for youth-oriented Egyptian ads.
                            </p>
                          </div>

                          {/* Performance Style Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Performance Style
                            </label>
                            <input
                              type="text"
                              placeholder="Search styles... (e.g., automotive, news, calm)"
                              value={performanceSearch}
                              onChange={(e) => setPerformanceSearch(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-gray-500 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-wb-blue/50"
                            />
                            <select
                              value={selectedPerformanceId || ""}
                              onChange={(e) => setSelectedPerformanceId(e.target.value ? parseInt(e.target.value) : undefined)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50"
                            >
                              <option value="" className="bg-gray-900">Select style (LLM default)</option>
                              {filteredPerformances.map((p) => (
                                <option key={p.id} value={p.id} className="bg-gray-900">
                                  {p.nameEn} - {p.name}
                                </option>
                              ))}
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                              Match performance style to ad type for optimal delivery (e.g., &quot;Automotive ad&quot; for car commercials).
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Voice Instructions Textarea - OpenAI and Lahajati */}
                  {(providerValue === "openai" || providerValue === "lahajati") && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {providerValue === "lahajati" ? "Persona Instructions (Optional)" : "Voice Instructions"}
                      </label>
                      <textarea
                        value={instructionsValue}
                        onChange={(e) => setInstructionsValue(e.target.value)}
                        placeholder={providerValue === "lahajati" ? LAHAJATI_PLACEHOLDER : PLACEHOLDER}
                        className={`w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50 resize-none ${providerValue === "lahajati" ? "h-32" : "h-48"}`}
                      />
                      {providerValue === "lahajati" && (
                        <p className="text-xs text-gray-400 mt-1">
                          Optional: Add custom persona instructions. Uses Mode 1 (custom prompt) instead of structured dialect/performance.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Speed Control - Always shown for OpenAI, collapsible for ElevenLabs */}
                  {providerValue === "openai" && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">
                          Speed Multiplier
                        </label>
                        <div className="text-sm text-gray-400">
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
                        Adjust playback speed for this voice track (0.25x = very slow, 1.0x = normal, 4.0x = very fast).
                      </p>
                    </div>
                  )}

                  {/* ElevenLabs: Tabbed Speed Controls */}
                  {providerValue === "elevenlabs" && (
                    <div className="space-y-4">
                      {/* Tab Bar */}
                      <div className="flex gap-2 border-b border-white/10 pb-2">
                        <button
                          onClick={() => setElevenLabsTab('smart-speed')}
                          className={`px-4 py-2 text-sm rounded-t-lg transition-all ${
                            elevenLabsTab === 'smart-speed'
                              ? 'bg-green-500/20 text-green-400 border-b-2 border-green-500'
                              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          Smart Speed
                        </button>
                        <button
                          onClick={() => setElevenLabsTab('fit-duration')}
                          className={`px-4 py-2 text-sm rounded-t-lg transition-all ${
                            elevenLabsTab === 'fit-duration'
                              ? 'bg-green-500/20 text-green-400 border-b-2 border-green-500'
                              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          Fit Duration
                        </button>
                        <button
                          onClick={() => setElevenLabsTab('advanced')}
                          className={`px-4 py-2 text-sm rounded-t-lg transition-all ${
                            elevenLabsTab === 'advanced'
                              ? 'bg-wb-blue/20 text-wb-blue border-b-2 border-wb-blue'
                              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          Advanced
                        </button>
                      </div>

                      {/* Tab Content: Smart Speed */}
                      {elevenLabsTab === 'smart-speed' && (
                        <div className="space-y-4">
                          {/* Tempo/Speedup Control */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-medium text-gray-300">
                                Tempo (Speed)
                              </label>
                              <span className="text-sm text-white font-medium">
                                {postSpeedup.toFixed(2)}x
                              </span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-xs text-gray-400 w-12 text-right">1.0x</span>
                              <input
                                type="range"
                                min={1.0}
                                max={1.6}
                                step={0.01}
                                value={postSpeedup}
                                onChange={(e) => setPostSpeedup(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                              />
                              <span className="text-xs text-gray-400 w-12">1.6x</span>
                            </div>

                            <p className="text-xs text-gray-400 mt-2">
                              Controls playback speed. Applied after generation using SoundTouch WSOLA algorithm.
                            </p>
                          </div>

                          {/* Pitch Adjustment Control */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-medium text-gray-300">
                                Pitch Adjustment
                              </label>
                              <span className="text-sm text-white font-medium">
                                {postPitch.toFixed(2)}x
                              </span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-xs text-gray-400 w-12 text-right">0.7x</span>
                              <input
                                type="range"
                                min={0.7}
                                max={1.2}
                                step={0.01}
                                value={postPitch}
                                onChange={(e) => setPostPitch(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                              />
                              <span className="text-xs text-gray-400 w-12">1.2x</span>
                            </div>

                            <p className="text-xs text-gray-400 mt-2">
                              Fine-tune pitch to compensate for elevation. Typical values: 0.95 with 1.1x tempo, 0.85-0.90 with 1.3-1.5x tempo.
                            </p>
                          </div>

                          <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <p className="text-xs text-green-400">
                              <span className="font-medium">✨ Tip:</span> Start with tempo at your desired speed and pitch at 1.0. If voice sounds too high-pitched, gradually lower pitch until it sounds natural.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Tab Content: Fit Duration */}
                      {elevenLabsTab === 'fit-duration' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Target Duration (seconds)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={targetDur || ""}
                            onChange={(e) => setTargetDur(e.target.value ? parseFloat(e.target.value) : undefined)}
                            placeholder="e.g., 20"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                          />
                          <p className="text-xs text-gray-400 mt-2">
                            Automatically calculates speedup to fit this duration (max 1.6x). Audio will be pitch-preserved.
                          </p>
                          <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <p className="text-xs text-amber-400">
                              <span className="font-medium">💡 Use case:</span> Perfect for fitting disclaimers into strict time constraints (e.g., 30-second ads).
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Tab Content: Advanced (Native Speed) */}
                      {elevenLabsTab === 'advanced' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-300">
                              Native Speed
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
                            Provider-native speed control (limited 0.7-1.2x range, may not work reliably).
                          </p>
                          <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-xs text-yellow-400">
                              <span className="font-medium">⚠️ Advanced users only:</span> ElevenLabs native speed has limited range and inconsistent results. Use Smart Speed tab instead.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Simple providers info (Qwen, Lovo, ByteDance) */}
                  {(providerValue === "qwen" || providerValue === "lovo" || providerValue === "bytedance") && (
                    <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-lg">
                      <p className="text-sm text-gray-300">
                        <span className="font-medium">ℹ️ {providerValue.charAt(0).toUpperCase() + providerValue.slice(1)}</span> uses plain text scripts without special voice controls.
                      </p>
                      <ul className="mt-2 text-xs text-gray-400 space-y-1">
                        <li>• No emotional tags or voice instructions</li>
                        <li>• No speed control parameters</li>
                        <li>• Natural prosody handled by the TTS model</li>
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-between mt-4">
                    {/* Delete button (left side) */}
                    {onDelete ? (
                      <button
                        onClick={() => {
                          onDelete();
                          onClose();
                        }}
                        className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center gap-2"
                      >
                        <TrashIcon className="w-4 h-4" strokeWidth={2} />
                        Delete Track
                      </button>
                    ) : (
                      <div />
                    )}

                    {/* Cancel/Save buttons (right side) */}
                    <div className="flex gap-2">
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
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
