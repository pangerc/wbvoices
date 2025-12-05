import React from "react";

/**
 * Highlights ElevenLabs voice tags in script text.
 * Tags like [happy], [excited], [Austrian accent] are wrapped in colored spans.
 */
export function highlightElevenLabsTags(text: string): React.ReactNode {
  // Split on tags while keeping them in the result
  const parts = text.split(/(\[[^\]]+\])/);

  return parts.map((part, i) => {
    // Check if this part is a tag (starts and ends with brackets)
    if (part.match(/^\[.*\]$/)) {
      return (
        <span key={i} className="text-gray-500">
          {part}
        </span>
      );
    }
    return part;
  });
}
