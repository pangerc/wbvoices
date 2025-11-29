"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PlayIcon, StopIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { useDraftAccordionState } from "@/hooks/useAudioPlayback";

interface DraftAccordionProps {
  children: React.ReactNode;
  title?: string;
  /** Stream type for reactive playback/generation state */
  type: "voice" | "music" | "sfx";
  /** Version ID for scoping playback state */
  versionId?: string;
  /** @deprecated Use onPlayAll instead */
  onGenerateAll?: () => void;
  /** @deprecated Use onPlayAll instead */
  onPreview?: () => void;
  /** @deprecated Use type prop with useDraftAccordionState instead */
  hasAudio?: boolean;
  // New smart button handlers
  onPlayAll?: () => void;
  onSendToMixer?: () => void;
  /** @deprecated State now comes from useDraftAccordionState hook */
  playAllState?: { isPlaying: boolean; isGenerating: boolean };
  hasTracksWithAudio?: boolean;
}

/**
 * Accordion wrapper for draft editing UI
 * Shows a collapsible container with "EDITING" badge to indicate draft state
 *
 * Header buttons:
 * - PLAY: Smart button - plays all if audio exists, generates missing first if needed
 * - SEND: Pushes voice tracks to mixer
 */
export function DraftAccordion({
  children,
  title = "DRAFT",
  type,
  versionId,
  onGenerateAll,
  onPreview,
  hasAudio = false,
  onPlayAll,
  onSendToMixer,
  playAllState,
  hasTracksWithAudio = false,
}: DraftAccordionProps) {
  // Use reactive hook for playback/generation state - THIS FIXES the ref re-render issue!
  const reactiveState = useDraftAccordionState(type, versionId);

  // Use new props if available, fall back to deprecated ones
  const handlePlay = onPlayAll || onPreview;
  // Prefer reactive state from hook, fall back to prop for backwards compat
  const isPlaying = reactiveState.isPlaying || playAllState?.isPlaying || false;
  const isGenerating = reactiveState.isGenerating || playAllState?.isGenerating || false;
  const canSend = hasTracksWithAudio || hasAudio;

  return (
    <Accordion.Root type="single" collapsible defaultValue="draft" className="mb-6">
      <Accordion.Item
        value="draft"
        className="bg-white/5 backdrop-blur-sm"
      >
        <Accordion.Header className="flex items-center gap-2 px-4 py-3">
          {/* Trigger - only contains non-interactive elements */}
          <Accordion.Trigger className="flex-1 flex items-center justify-between text-left group">
            <div className="flex items-center gap-3">
              <span className="text-white font-mono text-sm font-medium">
                {title}
              </span>
              <span className="px-2 py-0.5 text-xs font-medium text-wb-blue bg-wb-blue/20 border border-wb-blue/30 rounded-full">
                EDITING
              </span>
            </div>
            <ChevronDownIcon className="w-5 h-5 text-white/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>

          {/* Action buttons - OUTSIDE trigger to avoid nested buttons */}
          <div className="flex items-center gap-2">
            {/* Smart PLAY button - generates missing tracks + plays all */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (handlePlay) {
                  handlePlay();
                }
              }}
              disabled={!handlePlay || isGenerating}
              className={`w-10 h-10 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isPlaying
                  ? "bg-red-500/20 border-red-500/30 hover:bg-red-500/30"
                  : isGenerating
                    ? "bg-yellow-500/20 border-yellow-500/30"
                    : "bg-white/10 border-white/20 hover:bg-white/20"
              }`}
              title={isPlaying ? "Stop playback" : isGenerating ? "Generating..." : "Play all (generates if needed)"}
            >
              {isGenerating ? (
                <svg className="w-4 h-4 text-yellow-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : isPlaying ? (
                <StopIcon className="w-4 h-4 text-red-400" />
              ) : (
                <PlayIcon className="w-4 h-4 text-white" />
              )}
            </button>

            {/* SEND to Mixer button */}
            {onSendToMixer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSendToMixer();
                }}
                disabled={!canSend}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-wb-blue/20 backdrop-blur-sm border border-wb-blue/30 hover:bg-wb-blue/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={canSend ? "Send to mixer" : "Generate audio first"}
              >
                <PaperAirplaneIcon className="w-4 h-4 text-wb-blue" />
              </button>
            )}
          </div>
        </Accordion.Header>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="px-4 pb-4 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-gray-400">
                Changes auto-save as you type
              </div>
              {/* Legacy generate all link - hidden when using new smart play button */}
              {onGenerateAll && !onPlayAll && (
                <button
                  onClick={onGenerateAll}
                  className="text-sm text-wb-blue hover:text-blue-400 transition-colors font-medium"
                >
                  GENERATE ALL
                </button>
              )}
            </div>
            {children}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
