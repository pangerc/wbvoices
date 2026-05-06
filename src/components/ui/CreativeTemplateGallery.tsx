"use client";

import { useMemo, useState } from "react";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  EllipsisHorizontalCircleIcon,
} from "@heroicons/react/24/outline";
import type { CreativeTemplate } from "@/hooks/useCreativeTemplates";

interface CreativeTemplateGalleryProps {
  value: string | null;
  onChange: (id: string | null) => void;
  templates: CreativeTemplate[];
  loading?: boolean;
  disabled?: boolean;
}

// Compact-mode grid: 5 template cards + a "Show more" tile in the 6th slot
// when there are extra templates to surface. Expanding the grid renders the
// full list. The active card is always rendered even when collapsed so
// picking a template that sits past the limit never visually drops it.
const COMPACT_TEMPLATES = 5;

/**
 * Card grid of admin-managed creative templates surfaced in the brief panel.
 * Each card represents a strategy preset (e.g. "Optimized for 15s", "Gen Z
 * Oriented") that injects a system-prompt addendum at generation time.
 *
 * Selection is single-pick; clicking the active card deselects (resets to
 * freehand mode). A small "Use freehand" reset link sits in the header
 * area when a template is selected — it's the explicit default state and
 * doesn't take a grid slot, so the compact layout fits cleanly on two rows
 * (5 cards + "Show more" tile = 6 cells on a 3-col grid).
 *
 * Past COMPACT_TEMPLATES templates the gallery shows the first 5 plus a
 * "Show more" tile in the 6th grid slot, and surfaces a search input
 * (matches title + description + category, case-insensitive). Click the
 * tile to expand to the full list. Search filters across the full list
 * regardless of expanded state.
 *
 * The gallery hides itself when there are zero templates — the brief flow
 * continues to work without any selection.
 */
export function CreativeTemplateGallery({
  value,
  onChange,
  templates,
  loading,
  disabled,
}: CreativeTemplateGalleryProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Filter templates by query against title + description + category. The
  // query is trimmed and lower-cased once; per-template comparisons stay
  // cheap.
  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)),
    );
  }, [templates, query]);

  // In compact mode (not expanded, no search) cap at COMPACT_TEMPLATES — the
  // 6th grid slot becomes the "Show more" tile. The active card is always
  // included so picking a template past the cap doesn't visually drop it.
  // Expanding or searching renders the full filtered list.
  const isFiltering = query.trim().length > 0;
  const visibleTemplates = useMemo(() => {
    if (expanded || isFiltering) return filteredTemplates;
    const head = filteredTemplates.slice(0, COMPACT_TEMPLATES);
    if (value && !head.some((t) => t.id === value)) {
      const selected = filteredTemplates.find((t) => t.id === value);
      if (selected) return [...head, selected];
    }
    return head;
  }, [filteredTemplates, expanded, isFiltering, value]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-white/5 border border-white/10 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!templates.length) return null;

  const handleSelect = (id: string | null) => {
    if (disabled) return;
    onChange(id === value ? null : id);
  };

  const showSearchBar = templates.length > COMPACT_TEMPLATES;
  const hiddenCount = filteredTemplates.length - visibleTemplates.length;
  // Show the "Show more" tile only when collapsed, not searching, and there
  // really are more templates to reveal beyond the visible slice.
  const showMoreTile = !expanded && !isFiltering && hiddenCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <h3 className="text-white text-base font-medium">Creative template</h3>
          {value !== null && (
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={disabled}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-50 underline-offset-2 hover:underline"
            >
              Use freehand
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400 text-right shrink-0">
          Optional — shapes script structure, pacing, music, and SFX direction.
        </span>
      </div>

      {showSearchBar && (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates by name, description, or category"
            disabled={disabled}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-wb-blue/50 focus:ring-1 focus:ring-wb-blue/40 disabled:opacity-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTemplates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            title={tpl.title}
            description={tpl.description}
            category={tpl.category}
            isSelected={value === tpl.id}
            onClick={() => handleSelect(tpl.id)}
            disabled={disabled}
          />
        ))}
        {showMoreTile && (
          <ShowMoreTile
            hiddenCount={hiddenCount}
            onClick={() => setExpanded(true)}
            disabled={disabled}
          />
        )}
      </div>

      {isFiltering && filteredTemplates.length === 0 && (
        <p className="text-xs text-gray-400">
          No templates match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {expanded && !isFiltering && filteredTemplates.length > COMPACT_TEMPLATES && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={disabled}
          className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

function ShowMoreTile({
  hiddenCount,
  onClick,
  disabled,
}: {
  hiddenCount: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-left p-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/30 text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center text-center"
    >
      <EllipsisHorizontalCircleIcon className="w-6 h-6 text-gray-300 mb-2" />
      <span className="font-medium text-sm">Show more</span>
      <span className="text-xs text-gray-400 mt-0.5">
        {hiddenCount} more {hiddenCount === 1 ? "template" : "templates"}
      </span>
    </button>
  );
}

function TemplateCard({
  title,
  description,
  category,
  isSelected,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  category?: string;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
        isSelected
          ? "border-wb-blue/60 bg-wb-blue/10 ring-2 ring-wb-blue/40"
          : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-medium text-white text-sm">{title}</span>
        {category && (
          <span className="shrink-0 inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-white/5 border border-white/10 text-gray-400">
            {category}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
    </button>
  );
}
