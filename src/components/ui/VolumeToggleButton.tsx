import React from "react";

interface VolumeToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function VolumeToggleButton({
  isOpen,
  onClick,
}: VolumeToggleButtonProps) {
  return (
    <button
      className={`px-3 py-1 rounded-t-full rounded-bl-full text-xs border-b border-gray-700 ${
        isOpen
          ? "bg-gray-600 text-white"
          : "bg-gray-800 hover:bg-gray-700 text-gray-300"
      }`}
      onClick={onClick}
    >
      {isOpen ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      )}
    </button>
  );
}
