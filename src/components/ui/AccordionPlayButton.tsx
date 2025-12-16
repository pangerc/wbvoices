"use client";

import { PlayIcon, StopIcon } from "@heroicons/react/24/outline";
import { useDraftAccordionState } from "@/hooks/useAudioPlayback";
import { Tooltip } from "./Tooltip";

interface AccordionPlayButtonProps {
  type: "voice" | "music" | "sfx";
  versionId: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Smart play/stop button with reactive playback state for accordions.
 * Used by both DraftAccordion and VersionAccordion.
 */
export function AccordionPlayButton({ type, versionId, onClick, disabled }: AccordionPlayButtonProps) {
  const { isPlaying, isGenerating } = useDraftAccordionState(type, versionId);

  return (
    <Tooltip content={isPlaying ? "Stop" : isGenerating ? "Generating..." : "Preview"}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        disabled={disabled || isGenerating}
        className={`p-2 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          isPlaying
            ? "bg-red-500/20 border-red-500/30 hover:bg-red-500/30"
            : isGenerating
              ? "bg-yellow-500/20 border-yellow-500/30"
              : "bg-white/10 border-white/20 hover:bg-white/20"
        }`}
      >
        {isGenerating ? (
          <svg className="w-4 h-4 text-yellow-400 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : isPlaying ? (
          <StopIcon className="w-4 h-4 text-red-400" />
        ) : (
          <PlayIcon className="w-4 h-4 text-white" />
        )}
      </button>
    </Tooltip>
  );
}
