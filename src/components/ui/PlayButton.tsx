import React from "react";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";

interface PlayButtonProps {
  isPlaying: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function PlayButton({
  isPlaying,
  onClick,
  disabled = false,
}: PlayButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-1 rounded-full flex items-center gap-2 text-white hover:cursor-pointer text-sm border transition-all duration-200 ${
        isPlaying
          ? "bg-red-500/10 backdrop-blur-sm border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30"
          : "bg-wb-blue/10 backdrop-blur-sm border-wb-blue/20 hover:bg-wb-blue/20 hover:border-wb-blue/30"
      } disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-wb-blue/50`}
    >
      {isPlaying ? (
        <>
          <PauseIcon className="w-3 h-3" />
          <span>Stop</span>
        </>
      ) : (
        <>
          <PlayIcon className="w-3 h-3" />
          <span>Play</span>
        </>
      )}
    </button>
  );
}
