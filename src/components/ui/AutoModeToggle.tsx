import React from "react";

interface AutoModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function AutoModeToggle({ enabled, onChange, disabled = false }: AutoModeToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="block text-xs font-medium text-gray-300 uppercase tracking-wide">AUTO</label>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={`
          relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-wb-blue/50 focus:ring-offset-2 focus:ring-offset-black backdrop-blur-sm shadow-inner
          ${enabled 
            ? 'bg-wb-blue border border-wb-blue/30' 
            : 'bg-white/10 border border-white/20'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span
          className={`
            inline-block h-5 w-5 transform rounded-full bg-white backdrop-blur-sm transition-all duration-300 ease-in-out shadow-lg border border-white/20
            ${enabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
}