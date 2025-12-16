"use client";

import React, { ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DocumentDuplicateIcon } from "@heroicons/react/24/solid";
import { AccordionPlayButton } from "./AccordionPlayButton";
import { SendToMixerIcon, RequestChangeIcon } from "./AccordionIcons";
import type { VersionId, VersionStatus, CreatedBy } from "@/types/versions";

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
  streamType: "voices" | "music" | "sfx";
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
  streamType,
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
  // Map stream type to the format expected by AccordionPlayButton
  const playButtonType = streamType === "voices" ? "voice" : streamType === "music" ? "music" : "sfx";
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
                <AccordionPlayButton
                  type={playButtonType}
                  versionId={version.id}
                  onClick={() => onPreview(version.id)}
                  disabled={!versionHasAudio}
                />

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
