"use client";

import { useState } from "react";

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  label?: string;
}

export function TruncatedText({
  text,
  maxLength = 100,
  className = "",
  label,
}: TruncatedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLength;

  const displayText =
    expanded || !needsTruncation ? text : text.slice(0, maxLength) + "...";

  return (
    <span className={className}>
      {label && <span>{label}</span>}
      {displayText}
      {needsTruncation && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-wb-blue hover:text-blue-400"
        >
          more
        </button>
      )}
    </span>
  );
}
