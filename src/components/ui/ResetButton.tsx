import React from "react";

interface ResetButtonProps {
  onClick: () => void;
}

export function ResetButton({ onClick }: ResetButtonProps) {
  return (
    <button
      onClick={onClick}
      className=" text-wb-red hover:bg-red-950 hover:cursor-pointer flex items-center gap-2 rounded-full border border-wb-red px-4 py-3 mr-2 hidden"
    >
      Reset
      <svg
        viewBox="-0.5 -0.5 16 16"
        xmlns="http://www.w3.org/2000/svg"
        height="16"
        width="16"
        className="ml-2 h-4 w-auto"
      >
        <path
          d="m11.465 5.75 -2.375 -4.1762500000000005a1.875 1.875 0 0 0 -3.25 0l-0.66125 1.14375"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
        <path
          d="M7.46375 12.5625H12.1875a1.875 1.875 0 0 0 1.625 -2.8125l-0.8125 -1.40625"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
        <path
          d="m3.4962500000000003 5.53 -2.375 4.21875a1.875 1.875 0 0 0 1.625 2.8125h1.9075"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
        <path
          d="m9.338750000000001 10.68625 -1.875 1.875 1.875 1.875"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
        <path
          d="m12.151250000000001 3.18625 -0.68625 2.56125 -2.56125 -0.68625"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
        <path
          d="m0.935 6.21625 2.56125 -0.68625 0.68625 2.56125"
          fill="none"
          stroke="#ff6467"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1"
        ></path>
      </svg>
    </button>
  );
}
