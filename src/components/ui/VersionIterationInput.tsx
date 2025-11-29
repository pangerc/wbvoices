/**
 * VersionIterationInput
 *
 * Inline iteration input that appears at the bottom of each version accordion.
 * Allows users to request changes to spawn a new version.
 */

"use client";

import React, { useState } from "react";
import type { StreamType } from "@/types/versions";

interface VersionIterationInputProps {
  adId: string;
  stream: StreamType;
  parentVersionId: string;
  onNewVersion: (versionId: string) => void;
  disabled?: boolean;
  /** For drafts: called before expanding to freeze the draft first */
  onActivateDraft?: () => Promise<void>;
}

export function VersionIterationInput({
  adId,
  stream,
  parentVersionId,
  onNewVersion,
  disabled = false,
  onActivateDraft,
}: VersionIterationInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [request, setRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTriggerClick = async () => {
    if (onActivateDraft) {
      setIsActivating(true);
      try {
        await onActivateDraft();
      } catch (err) {
        setError("Failed to freeze draft");
        setIsActivating(false);
        return;
      }
      setIsActivating(false);
    }
    setIsExpanded(true);
  };

  const handleSubmit = async () => {
    if (!request.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ads/${adId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: request,
          stream,
          parentVersionId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process request");
      }

      const result = await response.json();
      const newVersionId = result.drafts?.[stream];

      if (newVersionId) {
        setRequest("");
        onNewVersion(newVersionId);
      } else {
        setError("No new version was created. Try a different request.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      handleSubmit();
    }
  };

  // Collapsed state: show "Request a change" trigger
  if (!isExpanded) {
    return (
      <div className="mt-4 pt-4 border-t border-white/10">
        <button
          onClick={handleTriggerClick}
          disabled={disabled || isActivating}
          className="text-sm text-gray-400 hover:text-wb-blue transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          {isActivating ? (
            <>
              <svg
                className="animate-spin h-3 w-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Preparing...</span>
            </>
          ) : (
            <>
              <span>Request a change</span>
              <span>→</span>
            </>
          )}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  // Expanded state: show input + button
  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="flex gap-2">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to change?"
          disabled={disabled || isLoading}
          className="flex-1 bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 border border-white/10 focus:outline-none focus:border-wb-blue/50 focus:ring-1 focus:ring-wb-blue/30 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || isLoading || !request.trim()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-wb-blue/20 text-wb-blue border border-wb-blue/30 hover:bg-wb-blue/30 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Working...</span>
            </>
          ) : (
            "Request"
          )}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
