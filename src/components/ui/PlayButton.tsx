import React from "react";

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
      className={`px-4 py-1 rounded-full flex items-center gap-2 text-white hover:cursor-pointer text-sm ${
        isPlaying
          ? "bg-wb-red hover:bg-gray-700"
          : "bg-wb-blue hover:bg-wb-blue-dark"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isPlaying ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          <span>Stop</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Play</span>
        </>
      )}
    </button>
  );
}
