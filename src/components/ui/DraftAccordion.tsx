"use client";

import * as Accordion from "@radix-ui/react-accordion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { EllipsisVerticalIcon, DocumentPlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon } from "@heroicons/react/24/solid";
import { AccordionPlayButton } from "./AccordionPlayButton";
import { Tooltip } from "./Tooltip";
import { SendToMixerIcon, RequestChangeIcon } from "./AccordionIcons";

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
  // Use new props if available, fall back to deprecated ones
  const handlePlay = onPlayAll || onPreview;
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
            <AccordionPlayButton
              type={type}
              versionId={versionId || ""}
              onClick={() => handlePlay?.()}
              disabled={!handlePlay}
            />

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
