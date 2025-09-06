import React, { useState, useRef, useEffect } from "react";

interface SplitGenerateButtonProps {
  onClick: () => void;
  disabled: boolean;
  isGenerating: boolean;
  autoMode: boolean;
  onAutoModeChange: (enabled: boolean) => void;
}

export function SplitGenerateButton({
  onClick,
  disabled,
  isGenerating,
  autoMode,
  onAutoModeChange,
}: SplitGenerateButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  const handleModeSelect = (mode: boolean) => {
    onAutoModeChange(mode);
    setIsDropdownOpen(false);
  };

  const buttonText = autoMode ? "Auto Generate" : "Manual Generate";
  const generatingText = autoMode ? "Auto Generating..." : "Generating...";

  return (
    <div className="relative flex items-center gap-1">
      {/* Main generate button - organic curve on right */}
      <button
        onClick={onClick}
        disabled={disabled || isGenerating}
        className="group relative font-medium pl-5 pr-3 py-3 text-white border border-white/40 hover:border-white/70 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all duration-500 ease-out"
        style={{
          borderRadius: "1.5rem 0.8rem 0.8rem 1.5rem",
          backdropFilter: "blur(8px) saturate(1.2)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.08) 100%)",
          boxShadow:
            "0 0 20px rgba(255,255,255,0.1), inset 0 1px 3px rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.1)",
          height: "3rem",
        }}
      >
        {/* Crystalline highlights */}
        <div
          className="absolute inset-x-2 top-0 h-px rounded-full pointer-events-none opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 20%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.8) 80%, transparent 100%)",
            filter: "blur(0.3px)",
          }}
        />

        {/* Hover glow effect */}
        <div
          className="absolute inset-0 rounded-[1.5rem_0.8rem_0.8rem_1.5rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)",
          }}
        />

        <div className="relative z-10 flex items-center gap-2">
          {isGenerating ? generatingText : buttonText}
          <svg
            width="17"
            height="21"
            viewBox="0 0 17 21"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipPath="url(#clip0_1_8990)">
              <path
                d="M7.49558 4.14887C7.60619 4.14887 7.66581 4.08072 7.68281 3.97849C7.93815 2.59836 7.91259 2.53021 9.39347 2.26611C9.49558 2.24055 9.56363 2.18092 9.56363 2.07017C9.56363 1.96794 9.49558 1.89978 9.39347 1.88274C7.91259 1.61865 7.93815 1.55049 7.68281 0.17037C7.66581 0.0681389 7.60619 -1.52588e-05 7.49558 -1.52588e-05C7.3849 -1.52588e-05 7.32537 0.0681389 7.30834 0.17037C7.05303 1.55049 7.07856 1.61865 5.5977 1.88274C5.48706 1.89978 5.42749 1.96794 5.42749 2.07017C5.42749 2.18092 5.48706 2.24055 5.5977 2.26611C7.07856 2.53021 7.05303 2.59836 7.30834 3.97849C7.32537 4.08072 7.3849 4.14887 7.49558 4.14887Z"
                fill="white"
              />
              <path
                d="M3.37646 10.0101C3.53816 10.0101 3.6488 9.8994 3.66582 9.74601C3.9722 7.47136 4.0488 7.47136 6.39774 7.01988C6.54242 6.99431 6.65306 6.89209 6.65306 6.73022C6.65306 6.57688 6.54242 6.46612 6.39774 6.44908C4.0488 6.11683 3.96369 6.04016 3.66582 3.73143C3.6488 3.56957 3.53816 3.45882 3.37646 3.45882C3.22326 3.45882 3.11263 3.56957 3.08709 3.73995C2.81475 6.0146 2.68709 6.00608 0.355173 6.44908C0.210492 6.47464 0.0998535 6.57688 0.0998535 6.73022C0.0998535 6.90061 0.210492 6.99431 0.389216 7.01988C2.70412 7.39474 2.81475 7.45435 3.08709 9.729C3.11263 9.8994 3.22326 10.0101 3.37646 10.0101Z"
                fill="white"
              />
              <path
                d="M9.14659 19.4325C9.36788 19.4325 9.52961 19.2706 9.57217 19.0406C10.1764 14.3805 10.8317 13.6649 15.4445 13.1538C15.6828 13.1282 15.8445 12.9578 15.8445 12.7278C15.8445 12.5063 15.6828 12.3359 15.4445 12.3103C10.8317 11.7992 10.1764 11.0836 9.57217 6.415C9.52961 6.18497 9.36788 6.03163 9.14659 6.03163C8.92531 6.03163 8.76364 6.18497 8.72958 6.415C8.12535 11.0836 7.46149 11.7992 2.85724 12.3103C2.61043 12.3359 2.44873 12.5063 2.44873 12.7278C2.44873 12.9578 2.61043 13.1282 2.85724 13.1538C7.45299 13.7586 8.09129 14.3805 8.72958 19.0406C8.76364 19.2706 8.92531 19.4325 9.14659 19.4325Z"
                fill="white"
              />
            </g>
            <defs>
              <clipPath id="clip0_1_8990">
                <rect
                  width="16"
                  height="21"
                  fill="white"
                  transform="translate(0.0998535)"
                />
              </clipPath>
            </defs>
          </svg>
        </div>
      </button>

      {/* Dropdown toggle button - organic curve on left, larger size */}
      <button
        ref={buttonRef}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        disabled={disabled || isGenerating}
        className="group relative px-2 py-3 text-white border border-white/40 hover:border-white/70 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-500 ease-out"
        style={{
          borderRadius: "0.8rem 1.5rem 1.5rem 0.8rem",
          backdropFilter: "blur(8px) saturate(1.2)",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.08) 100%)",
          boxShadow:
            "0 0 20px rgba(255,255,255,0.1), inset 0 1px 3px rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.1)",
          width: "2.8rem",
          height: "2.8rem",
        }}
      >
        {/* Crystalline highlights */}
        <div
          className="absolute inset-x-1 top-0 h-px rounded-full pointer-events-none opacity-60"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 30%, rgba(255,255,255,0.9) 70%, transparent 100%)",
            filter: "blur(0.3px)",
          }}
        />

        {/* Hover glow effect */}
        <div
          className="absolute inset-0 rounded-[0.8rem_1.5rem_1.5rem_0.8rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)",
          }}
        />

        <div className="relative z-10">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              isDropdownOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-48 bg-black/95 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl z-50"
        >
          <div className="py-2">
            <button
              onClick={() => handleModeSelect(true)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                autoMode
                  ? "bg-wb-blue/20 text-wb-blue"
                  : "text-white hover:bg-white/10"
              }`}
            >
              Auto Generate
              {autoMode && (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => handleModeSelect(false)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                !autoMode
                  ? "bg-wb-blue/20 text-wb-blue"
                  : "text-white hover:bg-white/10"
              }`}
            >
              Manual Generate
              {!autoMode && (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
