import React from "react";
import { GlassyModal } from "./GlassyModal";
import { GlassyOptionPicker, Option } from "./GlassyOptionPicker";
import { AIModel } from "@/types";

interface AIModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAiModel: AIModel;
  onSelectAiModel: (model: AIModel) => void;
}

export function AIModelSelectionModal({
  isOpen,
  onClose,
  selectedAiModel,
  onSelectAiModel,
}: AIModelSelectionModalProps) {
  const aiModelOptions: Option<AIModel>[] = [
    {
      value: "gpt4",
      label: "GPT 4.1",
      description: "Largest Open AI model for creative tasks",
    },
    {
      value: "gpt5",
      label: "GPT 5",
      description: "Latest model for advanced creative reasoning",
    },
    {
      value: "moonshot",
      label: "Moonshot KIMI",
      description: "Chinese LLM optimized for multilingual content",
    },
    {
      value: "qwen",
      label: "Qwen-Max",
      description: "Alibaba's multilingual AI model",
    },
  ];

  const handleSelect = (model: AIModel) => {
    onSelectAiModel(model);
    onClose();
  };

  return (
    <GlassyModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select AI Model"
      description="Choose which AI model to use for creative generation"
      maxWidth="xl"
    >
      <GlassyOptionPicker
        options={aiModelOptions}
        value={selectedAiModel}
        onChange={handleSelect}
      />
    </GlassyModal>
  );
}
