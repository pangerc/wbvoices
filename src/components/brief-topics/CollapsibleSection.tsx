/**
 * CollapsibleSection — shared expand/collapse affordance used inside
 * the three v4 brief topics. Each topic exposes a couple of fields and
 * collapses the rest behind these.
 */

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-200">{title}</span>
          {badge && (
            <span className="text-xs text-wb-blue truncate">{badge}</span>
          )}
          {description && (
            <span className="text-xs text-gray-500 truncate">
              — {description}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={twMerge(
            "w-4 h-4 text-gray-400 flex-shrink-0 transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
