import React from "react";
import { SparklesIcon } from "@heroicons/react/24/solid";

interface GenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  isGenerating: boolean;
  text: string;
  generatingText: string;
}

export function GenerateButton({
  onClick,
  disabled,
  isGenerating,
  text,
  generatingText,
}: GenerateButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isGenerating}
      className="bg-white/10 backdrop-blur-sm font-medium rounded-full px-5 py-3 text-white border border-white/20 hover:bg-wb-blue/30 hover:border-wb-blue/50 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:bg-gray-700/50 disabled:border-gray-600/30 disabled:text-gray-400 flex items-center gap-2 transition-all duration-200"
    >
      {isGenerating ? generatingText : text}
      <SparklesIcon className="w-5 h-5" />
    </button>
  );
}
