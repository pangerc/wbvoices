import React, { ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PlayIcon, EllipsisVerticalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { CheckIcon, DocumentDuplicateIcon } from "@heroicons/react/24/solid";
import type { VersionId, VersionStatus, CreatedBy } from "@/types/versions";

export interface BaseVersionItem {
  id: VersionId;
  createdAt: number;
  createdBy: CreatedBy;
  status: VersionStatus;
}

export interface VersionAccordionProps<T extends BaseVersionItem> {
  versions: T[];
  activeVersionId: VersionId | null;
  onActivate: (versionId: VersionId) => void;
  onPreview: (versionId: VersionId) => void;
  onClone: (versionId: VersionId) => void;
  onDelete: (versionId: VersionId) => void;
  renderContent: (version: T, isActive: boolean) => ReactNode;
  hasAudio?: (version: T) => boolean;
}

export function VersionAccordion<T extends BaseVersionItem>({
  versions,
  activeVersionId,
  onActivate,
  onPreview,
  onClone,
  onDelete,
  renderContent,
  hasAudio,
}: VersionAccordionProps<T>) {
  // Sort versions in descending order (newest first)
  const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);

  // Get the newest version ID for default expanded state
  const newestVersionId = sortedVersions[0]?.id;

  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue={newestVersionId}
      className="space-y-3"
    >
      {sortedVersions.map((version) => {
        const isActive = version.id === activeVersionId;
        const versionHasAudio = hasAudio ? hasAudio(version) : false;

        return (
          <Accordion.Item
            key={version.id}
            value={version.id}
            className={`transition-all duration-200 ${
              isActive
                ? "bg-white/10"
                : "bg-white/5"
            }`}
          >
            <Accordion.Header className="flex items-center gap-2 px-4 py-3">
              {/* LEFT: Activate Checkbox */}
              <Checkbox.Root
                checked={isActive}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onActivate(version.id);
                  }
                }}
                className="w-5 h-5 rounded border-2 border-white/40 bg-white/10 backdrop-blur-sm hover:border-wb-blue hover:bg-wb-blue/20 data-[state=checked]:bg-wb-blue data-[state=checked]:border-wb-blue transition-all flex items-center justify-center"
                aria-label="Activate this version"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox.Indicator>
                  <CheckIcon className="w-4 h-4 text-white" />
                </Checkbox.Indicator>
              </Checkbox.Root>

              {/* MIDDLE: Trigger with title + chevron column */}
              <Accordion.Trigger className="flex-1 flex items-center justify-between text-left group">
                {/* Title + Badge */}
                <div className="flex items-center gap-3">
                  <span className="text-white font-mono text-sm">{version.id}</span>
                  {isActive && (
                    <span className="px-2 py-0.5 text-xs font-medium text-wb-blue bg-wb-blue/20 border border-wb-blue/30 rounded-full">
                      ACTIVE
                    </span>
                  )}
                </div>

                {/* Chevron - fixed width column for vertical alignment */}
                <div className="w-12 flex justify-center">
                  <ChevronDownIcon className="w-5 h-5 text-white/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </div>
              </Accordion.Trigger>

              {/* RIGHT: Action buttons (OUTSIDE trigger to avoid nesting) */}
              <div className="flex items-center gap-2">
                {/* Play Button - always shown, disabled when no audio */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (versionHasAudio) {
                      onPreview(version.id);
                    }
                  }}
                  disabled={!versionHasAudio}
                  className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                  aria-label={versionHasAudio ? "Preview audio" : "No audio available"}
                >
                  <PlayIcon className="w-4 h-4 text-white" />
                </button>

                {/* Dropdown Menu - Clone & Delete actions */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all"
                      aria-label="More actions"
                    >
                      <EllipsisVerticalIcon className="w-4 h-4 text-white" />
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="min-w-[160px] bg-gray-900 border border-white/20 rounded-lg shadow-lg p-1 z-50"
                      sideOffset={5}
                    >
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
