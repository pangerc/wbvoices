"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { PlayIcon } from "@heroicons/react/24/outline";

interface DraftAccordionProps {
  children: React.ReactNode;
  title?: string;
  onGenerateAll?: () => void;
  onPreview?: () => void;
  hasAudio?: boolean;
}

/**
 * Accordion wrapper for draft editing UI
 * Shows a collapsible container with "EDITING" badge to indicate draft state
 */
export function DraftAccordion({ children, title = "DRAFT", onGenerateAll, onPreview, hasAudio = false }: DraftAccordionProps) {
  return (
    <Accordion.Root type="single" collapsible defaultValue="draft" className="mb-6">
      <Accordion.Item
        value="draft"
        className="bg-white/5 backdrop-blur-sm"
      >
        <Accordion.Header className="flex items-center px-4 py-3">
          <Accordion.Trigger className="flex-1 flex items-center justify-between text-left group">
            <div className="flex items-center gap-3">
              <span className="text-white font-mono text-sm font-medium">
                {title}
              </span>
              <span className="px-2 py-0.5 text-xs font-medium text-wb-blue bg-wb-blue/20 border border-wb-blue/30 rounded-full">
                EDITING
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPreview) {
                    onPreview();
                  }
                }}
                disabled={!hasAudio || !onPreview}
                className="p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                title={hasAudio ? "Preview draft audio" : "No audio generated yet"}
              >
                <PlayIcon className="w-4 h-4 text-white" />
              </button>
              <ChevronDownIcon className="w-5 h-5 text-white/50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </div>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="px-4 pb-4 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-gray-400">
                Changes auto-save as you type
              </div>
              {onGenerateAll && (
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
