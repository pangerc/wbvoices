import React from "react";
import { GlassyModal } from "./GlassyModal";
import { GlassyOptionPicker, Option } from "./GlassyOptionPicker";
import { AIModel, AI_MODEL_REGISTRY } from "@/utils/aiModelSelection";

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
  // Use single source of truth from registry
  const aiModelOptions: Option<AIModel>[] = AI_MODEL_REGISTRY.map(model => ({
    value: model.value,
    label: model.label,
    description: model.description,
  }));

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
