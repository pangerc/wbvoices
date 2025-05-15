import React from "react";
import TextareaAutosize, {
  TextareaAutosizeProps,
} from "react-textarea-autosize";

export interface GlassyTextareaProps extends TextareaAutosizeProps {
  label?: string;
}

export function GlassyTextarea({
  label,
  className = "",
  ...props
}: GlassyTextareaProps) {
  return (
    <div className="relative">
      {label && <label className="block  mb-2">{label}</label>}
      <div className="group relative">
        {/* Border div with gradient background */}
        <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
        {/* Subtle top reflection / highlight */}
        <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
        {/* Subtle outer glow */}
        <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>
        <TextareaAutosize
          className={`relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ${className}`}
          style={{ resize: "none", ...props.style }}
          minRows={5}
          {...props}
        />
      </div>
    </div>
  );
}
