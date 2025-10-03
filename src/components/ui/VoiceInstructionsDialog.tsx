import React, { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";

interface VoiceInstructionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  voiceInstructions: string | undefined;
  onSave: (instructions: string) => void;
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
  onSave,
}: VoiceInstructionsDialogProps) {
  const [value, setValue] = useState(voiceInstructions || "");

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  const handleCancel = () => {
    setValue(voiceInstructions || "");
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
                  Edit Voice Instructions (OpenAI)
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-300 mb-4">
                  Customize how this voice should deliver the script. These
                  instructions control tone, pacing, emotion, and emphasis.
                </Dialog.Description>

                <div className="space-y-4">
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={PLACEHOLDER}
                    className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:border-wb-blue/50 resize-none"
                  />

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
