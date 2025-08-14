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
      {label && <label className="block mb-2 text-white">{label}</label>}
      <div className="relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 transition-all duration-200">
        <TextareaAutosize
          className={`block text-sm w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-400 focus:outline-none bg-transparent resize-none ${className}`}
          style={{
            resize: "none",
            ...props.style,
          }}
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
          minRows={5}
          {...props}
        />
      </div>
    </div>
  );
}
