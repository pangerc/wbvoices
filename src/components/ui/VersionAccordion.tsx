import React, { ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PlayIcon, EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DocumentDuplicateIcon } from "@heroicons/react/24/solid";
import type { VersionId, VersionStatus, CreatedBy } from "@/types/versions";

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

export interface BaseVersionItem {
  id: VersionId;
  createdAt: number;
  createdBy: CreatedBy;
  status: VersionStatus;
  requestText?: string;
}

export interface VersionAccordionProps<T extends BaseVersionItem> {
  versions: T[];
  activeVersionId: VersionId | null;
  onPreview: (versionId: VersionId) => void;
  onClone: (versionId: VersionId) => void;
  onDelete: (versionId: VersionId) => void;
  onSendToMixer?: (versionId: VersionId) => void;
  onRequestChange?: (versionId: VersionId) => void;
  renderContent: (version: T, isActive: boolean) => ReactNode;
  hasAudio?: (version: T) => boolean;
  // Controlled state props for accordion coordination
  openVersionId?: VersionId | null;
  onOpenChange?: (versionId: VersionId | null) => void;
}

export function VersionAccordion<T extends BaseVersionItem>({
  versions,
  activeVersionId,
  onPreview,
  onClone,
  onDelete,
  onSendToMixer,
  onRequestChange,
  renderContent,
  hasAudio,
  openVersionId,
  onOpenChange,
}: VersionAccordionProps<T>) {
  // Sort versions in descending order (newest first)
  const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);

  // Get the newest version ID for default expanded state
  const newestVersionId = sortedVersions[0]?.id;

  // Controlled vs uncontrolled mode
  const accordionProps = openVersionId !== undefined
    ? { value: openVersionId || "", onValueChange: (val: string) => onOpenChange?.(val || null) }
    : { defaultValue: newestVersionId };

  return (
    <Accordion.Root
      type="single"
      collapsible
      {...accordionProps}
      className="space-y-3"
    >
      {sortedVersions.map((version) => {
        const isActive = version.id === activeVersionId;
        const versionHasAudio = hasAudio ? hasAudio(version) : false;

        return (
          <Accordion.Item
            key={version.id}
            value={version.id}
            className={`rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 transition-all duration-200 ${
              isActive
                ? "ring-1 ring-white/20"
                : ""
            }`}
          >
            <Accordion.Header className="flex items-center gap-2 px-4 py-3">
              {/* Trigger - title area only */}
              <Accordion.Trigger className="flex-1 text-left group flex items-center gap-2 min-w-0">
                <span className="text-white font-mono text-sm flex-shrink-0">{version.id}</span>
                {version.requestText && (
                  <span className="text-gray-400 text-xs italic truncate">
                    &ldquo;{version.requestText}&rdquo;
                  </span>
                )}
              </Accordion.Trigger>

              {/* Action buttons - OUTSIDE trigger to avoid nested buttons */}
              {/* Order: Play → Send → 3-dots */}
              <div className="flex items-center gap-2">
                {/* Play Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (versionHasAudio) {
                      onPreview(version.id);
                    }
                  }}
                  disabled={!versionHasAudio}
                  className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                  title="Preview"
                >
                  <PlayIcon className="w-4 h-4 text-white" />
                </button>

                {/* Send to Mixer Button - inverted when in mixer */}
                {onSendToMixer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (versionHasAudio && !isActive) {
                        onSendToMixer(version.id);
                      }
                    }}
                    disabled={!versionHasAudio || isActive}
                    className={`p-2 rounded-lg backdrop-blur-sm border transition-all ${
                      isActive
                        ? "bg-wb-blue/20 border-wb-blue cursor-default"
                        : "bg-white/10 border-white/20 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                    }`}
                    title={isActive ? "In mixer" : "Send to mixer"}
                  >
                    <SendToMixerIcon className={`w-4 h-4 ${isActive ? "text-wb-blue" : "text-wb-blue"}`} />
                  </button>
                )}

                {/* Dropdown Menu - Clone, Delete, Request Change */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all"
                      title="More actions"
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
                          onSelect={() => onRequestChange(version.id)}
                        >
                          <RequestChangeIcon className="w-4 h-4" />
                          Request change
                        </DropdownMenu.Item>
                      )}

                      <DropdownMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded cursor-pointer outline-none"
                        onSelect={() => onClone(version.id)}
                      >
                        <DocumentDuplicateIcon className="w-4 h-4" />
                        Clone
                      </DropdownMenu.Item>

                      <DropdownMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded cursor-pointer outline-none"
                        onSelect={() => onDelete(version.id)}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete
                      </DropdownMenu.Item>
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
                {renderContent(version, isActive)}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
