"use client";

import * as Accordion from "@radix-ui/react-accordion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PlayIcon, StopIcon, EllipsisVerticalIcon, DocumentPlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon } from "@heroicons/react/24/solid";
import { useDraftAccordionState } from "@/hooks/useAudioPlayback";
import { Tooltip } from "./Tooltip";

// Custom send-to-mixer icon
function SendToMixerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="1.5"
        d="m11.124 19.495 7.885-7.593-7.885-7.593v4.283H8.982C4.602 8.593 1 12.195 1 16.575v2.628c0 .292.195.487.487.487h.097c.195 0 .39-.195.39-.39.194-2.238 2.044-4.088 4.38-4.088h4.673v4.283h.097Z" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="1.5"
        d="M15.018 19.495 23 11.903l-7.982-7.593" />
    </svg>
  );
}

// AI Redo Spark icon for "Request a change"
function RequestChangeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
        d="M6.25195 11.9986c2.86519 -0.576 5.17205 -2.91087 5.74885 -5.85016 0.5769 2.93929 2.8832 5.27416 5.7484 5.85016m0 0.0033c-2.8652 0.576 -5.172 2.9109 -5.7489 5.8502 -0.5769 -2.9393 -2.88316 -5.2742 -5.74835 -5.8502" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"
        d="M22.5659 10.0961c0.5991 3.3416 -0.3926 6.9125 -2.9751 9.495 -4.1925 4.1925 -10.98981 4.1925 -15.18228 0 -4.192469 -4.1924 -4.192469 -10.98977 0 -15.18224 4.19247 -4.192468 10.98978 -4.192468 15.18228 0l0.8782 0.87817" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
        d="M16.6836 5.41016h3.8395V1.57061" />
    </svg>
  );
}

interface DraftAccordionProps {
  children: React.ReactNode;
  title?: string;
  /** User's iteration request that created this draft */
  requestText?: string;
  /** Stream type for reactive playback/generation state */
  type: "voice" | "music" | "sfx";
  /** Version ID for scoping playback state */
  versionId?: string;
  /** Active version ID in mixer - when matches versionId, show "In mixer" state */
  activeVersionId?: string | null;
  /** @deprecated Use onPlayAll instead */
  onGenerateAll?: () => void;
  /** @deprecated Use onPlayAll instead */
  onPreview?: () => void;
  /** @deprecated Use type prop with useDraftAccordionState instead */
  hasAudio?: boolean;
  // New smart button handlers
  onPlayAll?: () => void;
  onSendToMixer?: () => void;
  onFreeze?: () => void;
  onRequestChange?: () => void;
  onNewBlankVersion?: () => void;
  onDelete?: () => void;
  /** @deprecated State now comes from useDraftAccordionState hook */
  playAllState?: { isPlaying: boolean; isGenerating: boolean };
  hasTracksWithAudio?: boolean;
  // Controlled state props for accordion coordination
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  requestText,
  type,
  versionId,
  activeVersionId,
  onGenerateAll,
  onPreview,
  hasAudio = false,
  onPlayAll,
  onSendToMixer,
  onFreeze,
  onRequestChange,
  onNewBlankVersion,
  onDelete,
  playAllState,
  hasTracksWithAudio = false,
  isOpen,
  onOpenChange,
}: DraftAccordionProps) {
  // Use reactive hook for playback/generation state - THIS FIXES the ref re-render issue!
  const reactiveState = useDraftAccordionState(type, versionId);

  // Use new props if available, fall back to deprecated ones
  const handlePlay = onPlayAll || onPreview;
  // Prefer reactive state from hook, fall back to prop for backwards compat
  const isPlaying = reactiveState.isPlaying || playAllState?.isPlaying || false;
  const isGenerating = reactiveState.isGenerating || playAllState?.isGenerating || false;
  const canSend = hasTracksWithAudio || hasAudio;
  // Check if this draft is currently active in the mixer
  const isActive = versionId != null && versionId === activeVersionId;

  // Controlled vs uncontrolled mode
  const accordionProps = isOpen !== undefined
    ? { value: isOpen ? "draft" : "", onValueChange: (val: string) => onOpenChange?.(val === "draft") }
    : { defaultValue: "draft" };

  return (
    <Accordion.Root type="single" collapsible {...accordionProps} className="mb-6">
      <Accordion.Item
        value="draft"
        className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/10"
      >
        <Accordion.Header className="flex items-center gap-2 px-4 py-3">
          {/* Trigger - title area only */}
          <Accordion.Trigger className="flex-1 flex items-center gap-3 text-left group min-w-0">
            <span className="text-white font-mono text-sm font-medium flex-shrink-0">
              {title}
            </span>
            <span className="px-2 py-0.5 text-xs font-medium text-wb-blue bg-wb-blue/20 border border-wb-blue/30 rounded-full flex-shrink-0">
              EDITING
            </span>
            {requestText && (
              <span className="text-gray-400 text-xs italic truncate">
                &ldquo;{requestText}&rdquo;
              </span>
            )}
          </Accordion.Trigger>

          {/* Action buttons - OUTSIDE trigger to avoid nested buttons */}
          {/* Order: Play → Send → 3-dots */}
          <div className="flex items-center gap-2">
            {/* Smart PLAY button */}
            <Tooltip content={isPlaying ? "Stop" : isGenerating ? "Generating..." : "Preview"}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (handlePlay) {
                    handlePlay();
                  }
                }}
                disabled={!handlePlay || isGenerating}
                className={`p-2 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  isPlaying
                    ? "bg-red-500/20 border-red-500/30 hover:bg-red-500/30"
                    : isGenerating
                      ? "bg-yellow-500/20 border-yellow-500/30"
                      : "bg-white/10 border-white/20 hover:bg-white/20"
                }`}
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
            </Tooltip>

            {/* SEND to Mixer button */}
            {onSendToMixer && (
              <Tooltip content={isActive ? "In mixer" : "Send to mixer"}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToMixer();
                  }}
                  disabled={!canSend}
                  className={`p-2 flex items-center justify-center rounded-lg backdrop-blur-sm border transition-colors ${
                    isActive
                      ? "bg-wb-blue/20 border-wb-blue cursor-default"
                      : "bg-white/10 border-white/20 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  }`}
                >
                  <SendToMixerIcon className="w-4 h-4 text-wb-blue" />
                </button>
              </Tooltip>
            )}

            {/* Dropdown Menu - Freeze & Request Change */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  title="More actions"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all"
                >
                  <EllipsisVerticalIcon className="w-4 h-4 text-white" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[160px] bg-gray-900 border border-white/20 rounded-lg shadow-lg p-1 z-50"
                  sideOffset={5}
                >
                  {onRequestChange && (
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded cursor-pointer outline-none"
                      onSelect={onRequestChange}
                    >
                      <RequestChangeIcon className="w-4 h-4" />
                      Request change
                    </DropdownMenu.Item>
                  )}

                  {onNewBlankVersion && (
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded cursor-pointer outline-none"
                      onSelect={onNewBlankVersion}
                    >
                      <DocumentPlusIcon className="w-4 h-4" />
                      New version (blank)
                    </DropdownMenu.Item>
                  )}

                  {onFreeze && (
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded cursor-pointer outline-none"
                      disabled={!canSend}
                      onSelect={onFreeze}
                    >
                      <LockClosedIcon className="w-4 h-4" />
                      Freeze version
                    </DropdownMenu.Item>
                  )}

                  {onDelete && (
                    <>
                      <DropdownMenu.Separator className="h-px bg-white/10 my-1" />
                      <DropdownMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded cursor-pointer outline-none"
                        onSelect={onDelete}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete draft
                      </DropdownMenu.Item>
                    </>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* Chevron trigger - separate trigger at far right */}
          <Accordion.Trigger className="p-1 group">
            <ChevronDownIcon className="w-5 h-5 text-white/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
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
