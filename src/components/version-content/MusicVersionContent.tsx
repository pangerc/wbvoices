import React from "react";
import type { MusicVersion } from "@/types/versions";

export interface MusicVersionContentProps {
  version: MusicVersion;
  isActive?: boolean;
}

export function MusicVersionContent({
  version,
}: MusicVersionContentProps) {
  const hasAudio = version.generatedUrl && version.generatedUrl.length > 0;

  return (
    <div className="space-y-3">
      {/* Music prompt */}
      <div className="text-white leading-relaxed">
        {version.musicPrompt || (
          <span className="text-gray-500">No music prompt</span>
        )}
      </div>

      {/* Metadata line (compact, no labels) */}
      <div className="text-xs text-gray-400">
        {[
          version.provider &&
            version.provider.charAt(0).toUpperCase() +
              version.provider.slice(1),
          version.duration > 0 && `${version.duration}s`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>

      {/* Audio player */}
      {hasAudio && (
        <audio
          controls
          src={version.generatedUrl}
          className="w-full h-8"
          style={{
            filter: "invert(1) hue-rotate(180deg)",
          }}
        />
      )}

      {/* Version metadata footer */}
      <div className="pt-3 border-t border-white/10 text-xs text-gray-500 flex justify-between">
        <span>Created: {new Date(version.createdAt).toLocaleString()}</span>
        <span className="capitalize">Source: {version.createdBy}</span>
      </div>
    </div>
  );
}
