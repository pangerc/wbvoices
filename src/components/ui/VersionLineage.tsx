/**
 * VersionLineage
 *
 * Displays iteration lineage: the request text and link to parent version.
 * Shown at the top of version content when the version was created via iteration.
 */

"use client";

import React from "react";

interface VersionLineageProps {
  requestText?: string;
  parentVersionId?: string;
  onParentClick?: (versionId: string) => void;
}

export function VersionLineage({
  requestText,
  parentVersionId,
  onParentClick,
}: VersionLineageProps) {
  if (!requestText && !parentVersionId) return null;

  return (
    <div className="mb-4 pb-3 border-b border-white/10">
      {requestText && (
        <p className="text-sm text-gray-400 italic">
          &ldquo;{requestText}&rdquo;
        </p>
      )}
      {parentVersionId && (
        <button
          onClick={() => onParentClick?.(parentVersionId)}
          className="mt-1 text-xs text-wb-blue/70 hover:text-wb-blue hover:underline focus:outline-none inline-flex items-center gap-1"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 11l5-5m0 0l5 5m-5-5v12"
            />
          </svg>
          Based on {parentVersionId}
        </button>
      )}
    </div>
  );
}
