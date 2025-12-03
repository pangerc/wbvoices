import React from "react";
import type { VoiceVersion } from "@/types/versions";
import { VersionIterationInput, VersionLineage, TruncatedText } from "@/components/ui";

export interface VoiceVersionContentProps {
  version: VoiceVersion;
  versionId: string;
  adId: string;
  isActive?: boolean;
  onParentClick?: (versionId: string) => void;
  onNewVersion?: (versionId: string) => void;
  onNewBlankVersion?: () => void;
}

export function VoiceVersionContent({
  version,
  versionId,
  adId,
  onParentClick,
  onNewVersion,
  onNewBlankVersion,
}: VoiceVersionContentProps) {
  return (
    <div className="space-y-0">
      {/* Lineage display */}
      <VersionLineage
        requestText={version.requestText}
        parentVersionId={version.parentVersionId}
        onParentClick={onParentClick}
      />
      {version.voiceTracks.map((track, index) => {
        // Use embedded URL first, fall back to legacy parallel array
        const audioUrl = track.generatedUrl || version.generatedUrls?.[index];
        const hasAudio = !!audioUrl;

        return (
          <div
            key={index}
            className="grid grid-cols-3 gap-4 py-3 border-b border-white/5 last:border-b-0"
          >
            {/* Column 1: Voice info (33%) */}
            <div className="space-y-2">
              {track.voice ? (
                <>
                  {/* Voice name */}
                  <div className="text-base text-white font-medium">
                    {track.voice.name}
                  </div>

                  {/* Metadata line (matching ScripterPanel) */}
                  <div className="text-xs text-gray-400">
                    {[
                      track.voice.name,
                      track.voice.accent &&
                        `${track.voice.accent} accent${
                          track.voice.language
                            ? ` (${track.voice.language.toUpperCase()})`
                            : ""
                        }`,
                      track.voice.gender &&
                        track.voice.gender.charAt(0).toUpperCase() +
                          track.voice.gender.slice(1),
                      track.voice.provider &&
                        track.voice.provider.charAt(0).toUpperCase() +
                          track.voice.provider.slice(1),
                      track.voice.style &&
                        track.voice.style !== "Default" &&
                        track.voice.style,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {track.voice.description && (
                      <span className="text-gray-500">
                        {" "}
                        · {track.voice.description}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-gray-500">No voice selected</div>
              )}
            </div>

            {/* Column 2-3: Script + audio player on right (67%) */}
            <div className="col-span-2">
              <div className="flex gap-2">
                {/* Script text - flex-1 */}
                <div className="flex-1 text-white leading-relaxed whitespace-pre-wrap">
                  {track.text || (
                    <span className="text-gray-500">No script</span>
                  )}
                </div>

                {/* Audio player on right (replaces action buttons column) */}
                {hasAudio && audioUrl && (
                  <div className="flex flex-col">
                    <audio
                      controls
                      src={audioUrl}
                      className="h-8"
                      style={{
                        filter: "invert(1) hue-rotate(180deg)",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Voice instructions (OpenAI) or baseline tone (ElevenLabs) */}
              {(track.voiceInstructions || track.description) && (
                <div className="mt-2 text-xs text-gray-400 italic">
                  <TruncatedText
                    text={track.voiceInstructions || track.description || ""}
                    label={track.voiceInstructions ? "Instructions: " : "Tone: "}
                    maxLength={100}
                  />
                </div>
              )}

              {/* Timing info below script */}
              {(track.playAfter !== "start" ||
                track.overlap !== 0 ||
                track.speed) && (
                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  {track.playAfter !== "start" && (
                    <span>
                      After: <span className="text-white">{track.playAfter}</span>
                    </span>
                  )}
                  {track.overlap !== 0 && (
                    <span>
                      Overlap: <span className="text-white">{track.overlap}s</span>
                    </span>
                  )}
                  {track.speed && track.speed !== 1 && (
                    <span>
                      Speed: <span className="text-white">{track.speed}x</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Version metadata footer */}
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-500 flex justify-between">
        <span>Created: {new Date(version.createdAt).toLocaleString()}</span>
        <span className="capitalize">Source: {version.createdBy}</span>
      </div>

      {/* Iteration input for frozen versions */}
      {onNewVersion && (
        <VersionIterationInput
          adId={adId}
          stream="voices"
          parentVersionId={versionId}
          onNewVersion={onNewVersion}
          onNewBlankVersion={onNewBlankVersion}
        />
      )}
    </div>
  );
}
