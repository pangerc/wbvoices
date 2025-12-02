import React from "react";
import type { SfxVersion } from "@/types/versions";
import type { SoundFxPlacementIntent } from "@/types";
import { VersionIterationInput, VersionLineage } from "@/components/ui";

export interface SfxVersionContentProps {
  version: SfxVersion;
  versionId: string;
  adId: string;
  isActive?: boolean;
  onParentClick?: (versionId: string) => void;
  onNewVersion?: (versionId: string) => void;
  onNewBlankVersion?: () => void;
}

function formatPlacement(placement?: SoundFxPlacementIntent | string): string {
  if (!placement) return "Not specified";
  if (typeof placement === "string") return placement;

  switch (placement.type) {
    case "start":
      return "At start";
    case "end":
      return "At end";
    case "afterVoice":
      return `After voice ${placement.index + 1}`;
    case "legacy":
      return placement.playAfter;
    default:
      return "Not specified";
  }
}

export function SfxVersionContent({
  version,
  versionId,
  adId,
  onParentClick,
  onNewVersion,
  onNewBlankVersion,
}: SfxVersionContentProps) {
  return (
    <div className="space-y-4">
      {/* Lineage display */}
      <VersionLineage
        requestText={version.requestText}
        parentVersionId={version.parentVersionId}
        onParentClick={onParentClick}
      />

      {version.soundFxPrompts.map((prompt, index) => {
        const hasAudio = version.generatedUrls[index];

        return (
          <div key={index} className="space-y-2">
            {/* Sound effect description */}
            <div className="text-white">
              {prompt.description || (
                <span className="text-gray-500">No description</span>
              )}
            </div>

            {/* Metadata line (compact, no labels) */}
            <div className="text-xs text-gray-400">
              {[
                `SFX #${index + 1}`,
                formatPlacement(prompt.placement),
                prompt.duration && `${prompt.duration}s`,
                prompt.playAfter !== "start" && `after ${prompt.playAfter}`,
                prompt.overlap !== 0 && `overlap ${prompt.overlap}s`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>

            {/* Audio player */}
            {hasAudio && (
              <audio
                controls
                src={version.generatedUrls[index]}
                className="w-full h-8"
                style={{
                  filter: "invert(1) hue-rotate(180deg)",
                }}
              />
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {version.soundFxPrompts.length === 0 && (
        <div className="py-4 text-sm text-gray-500 text-center">
          No sound effects
        </div>
      )}

      {/* Version metadata footer */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-500 flex justify-between">
        <span>Created: {new Date(version.createdAt).toLocaleString()}</span>
        <span className="capitalize">Source: {version.createdBy}</span>
      </div>

      {/* Iteration input for frozen versions */}
      {onNewVersion && (
        <VersionIterationInput
          adId={adId}
          stream="sfx"
          parentVersionId={versionId}
          onNewVersion={onNewVersion}
          onNewBlankVersion={onNewBlankVersion}
        />
      )}
    </div>
  );
}
