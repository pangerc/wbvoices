import React from "react";

export interface GlassyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function GlassyInput({
  label,
  className = "",
  value,
  ...props
}: GlassyInputProps) {
  return (
    <div className="relative">
      {label && <label className="block mb-2 text-white">{label}</label>}
      <div className="relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 transition-all duration-200">
        <input
          className={`block text-sm w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-400 focus:outline-none bg-transparent ${className}`}
          value={value || ""} // Ensure value is always a string
          onFocus={(e) => {
            e.target.parentElement!.style.boxShadow =
              "0 0 0 1px rgba(47, 125, 250, 0.5)";
            e.target.parentElement!.style.borderColor =
              "rgba(47, 125, 250, 0.7)";
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.parentElement!.style.boxShadow = "none";
            e.target.parentElement!.style.borderColor =
              "rgba(255, 255, 255, 0.1)";
            props.onBlur?.(e);
          }}
          {...props}
        />
      </div>
    </div>
  );
}