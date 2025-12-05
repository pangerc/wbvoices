import React, { useState } from "react";
import Editor from "react-simple-code-editor";

export interface HighlightedScriptTextareaProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}

/**
 * Highlight ElevenLabs tags by wrapping them in gray spans.
 * Returns HTML string for react-simple-code-editor.
 */
function highlightTags(code: string): string {
  // Escape HTML first to prevent XSS, then add our highlighting
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /(\[[^\]]+\])/g,
    '<span class="text-gray-500">$1</span>'
  );
}

export function HighlightedScriptTextarea({
  label,
  value,
  onChange,
  placeholder,
  minRows = 3,
  className = "",
}: HighlightedScriptTextareaProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Simple height calc: count lines, multiply by line height (24px)
  // Add padding (32px = 16px top + 16px bottom)
  const lineCount = (value.match(/\n/g) || []).length + 1;
  const contentHeight = lineCount * 24;
  const minHeight = minRows * 24 + 32;
  const height = Math.max(contentHeight + 32, minHeight);

  return (
    <div className="relative">
      {label && <label className="block mb-2 text-white">{label}</label>}
      <div
        className="relative bg-white/5 backdrop-blur-sm rounded-xl border transition-all duration-200"
        style={{
          borderColor: isFocused ? "rgba(47, 125, 250, 0.7)" : "rgba(255, 255, 255, 0.1)",
          boxShadow: isFocused ? "0 0 0 1px rgba(47, 125, 250, 0.5)" : "none",
        }}
      >
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlightTags}
          placeholder={placeholder}
          padding={16}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={className}
          style={{
            minHeight: height,
            fontFamily: "inherit",
            fontSize: "0.875rem",
            lineHeight: "1.5rem",
          }}
          textareaClassName="focus:outline-none"
        />
      </div>
    </div>
  );
}
