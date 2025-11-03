import React from "react";
import { GlassyModal } from "./GlassyModal";
import { GlassyOptionPicker, Option } from "./GlassyOptionPicker";
import { Provider } from "@/types";

interface ProviderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProvider: Provider;
  onSelectProvider: (provider: Provider) => void;
  voiceCounts: Record<Provider, number>;
}

export function ProviderSelectionModal({
  isOpen,
  onClose,
  selectedProvider,
  onSelectProvider,
  voiceCounts,
}: ProviderSelectionModalProps) {
  const providerOptions: Option<Provider>[] = [
    {
      value: "any",
      label: "Any Provider",
      description: "We will pick the best option for you",
      badge: `${voiceCounts.any} voices`,
    },
    {
      value: "elevenlabs",
      label: "ElevenLabs",
      description: "Good quality of real actor voices",
      badge: `${voiceCounts.elevenlabs} voices`,
      disabled: voiceCounts.elevenlabs === 0,
    },
    {
      value: "openai",
      label: "OpenAI",
      description: "Natural sounding voices with good accents",
      badge: `${voiceCounts.openai} voices`,
      disabled: voiceCounts.openai === 0,
    },
    {
      value: "lovo",
      label: "Lovo",
      description: "Broad coverage but robotic quality",
      badge: `${voiceCounts.lovo} voices`,
      disabled: voiceCounts.lovo === 0,
    },
    {
      value: "qwen",
      label: "Qwen",
      description: "Chinese AI voices optimized for Mandarin",
      badge: `${voiceCounts.qwen} voices`,
      disabled: voiceCounts.qwen === 0,
    },
    {
      value: "bytedance",
      label: "ByteDance",
      description: "Chinese TTS with Cantonese support",
      badge: `${voiceCounts.bytedance} voices`,
      disabled: voiceCounts.bytedance === 0,
    },
  ];

  const handleSelect = (provider: Provider) => {
    onSelectProvider(provider);
    onClose();
  };

  return (
    <GlassyModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Voice Provider"
      description="Choose which voice provider to use for your campaign"
      maxWidth="xl"
    >
      <GlassyOptionPicker
        options={providerOptions}
        value={selectedProvider}
        onChange={handleSelect}
      />
    </GlassyModal>
  );
}
