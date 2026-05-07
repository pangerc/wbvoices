/**
 * VersionIterationInput
 *
 * Inline iteration input that appears in draft accordions.
 * When submitted, atomically freezes the parent draft AND creates a new draft.
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import type { StreamType } from "@/types/versions";
import { GlassyModal } from "./GlassyModal";

// AI Redo Spark icon for "Request a change"
function RequestChangeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6.25195 11.9986c2.86519 -0.576 5.17205 -2.91087 5.74885 -5.85016 0.5769 2.93929 2.8832 5.27416 5.7484 5.85016m0 0.0033c-2.8652 0.576 -5.172 2.9109 -5.7489 5.8502 -0.5769 -2.9393 -2.88316 -5.2742 -5.74835 -5.8502"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M22.5659 10.0961c0.5991 3.3416 -0.3926 6.9125 -2.9751 9.495 -4.1925 4.1925 -10.98981 4.1925 -15.18228 0 -4.192469 -4.1924 -4.192469 -10.98977 0 -15.18224 4.19247 -4.192468 10.98978 -4.192468 15.18228 0l0.8782 0.87817"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M16.6836 5.41016h3.8395V1.57061"
      />
    </svg>
  );
}

interface VersionIterationInputProps {
  adId: string;
  stream: StreamType;
  parentVersionId: string;
  onNewVersion: (versionId: string) => void;
  onNewBlankVersion?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Ref to expose expand function for external triggering (e.g., from accordion menu) */
  expandRef?: React.MutableRefObject<(() => void) | null>;
}

/**
 * localStorage key for the in-flight iteration request per (ad, stream,
 * parent). Radix Accordion unmounts our content on collapse, so component
 * state doesn't survive accordion toggles / re-expands — persisting here
 * lets the user type something, collapse the accordion, re-open it, and
 * find their draft still there. Cleared on successful submit.
 */
function draftStorageKey(
  adId: string,
  stream: string,
  parentVersionId: string,
) {
  return `vii-draft:${adId}:${stream}:${parentVersionId}`;
}

interface StoredDraft {
  expanded: boolean;
  text: string;
}

function readStoredDraft(key: string): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (typeof parsed.text !== "string" || typeof parsed.expanded !== "boolean")
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredDraft(key: string, draft: StoredDraft) {
  if (typeof window === "undefined") return;
  try {
    if (!draft.expanded && !draft.text) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(draft));
    }
  } catch {
    // quota exceeded / privacy mode — non-fatal
  }
}

export function VersionIterationInput({
  adId,
  stream,
  parentVersionId,
  onNewVersion,
  onNewBlankVersion,
  disabled = false,
  disabledReason,
  expandRef,
}: VersionIterationInputProps) {
  const storageKey = draftStorageKey(adId, stream, parentVersionId);

  // Lazily seed from localStorage on first render so a component that remounts
  // after an accordion collapse picks up the user's previous draft.
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const stored = readStoredDraft(storageKey);
    return stored?.expanded ?? false;
  });
  const [request, setRequest] = useState<string>(() => {
    const stored = readStoredDraft(storageKey);
    return stored?.text ?? "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisabledAlert, setShowDisabledAlert] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist draft to localStorage whenever it changes. Survives unmount.
  useEffect(() => {
    writeStoredDraft(storageKey, { expanded: isExpanded, text: request });
  }, [storageKey, isExpanded, request]);

  // Reset form when the parent version changes (e.g. a new draft was just
  // created). The new parent's stored draft — if any — will be seeded on
  // the next mount.
  useEffect(() => {
    setIsExpanded(false);
    setRequest("");
    setError(null);
  }, [parentVersionId]);

  // Expose expand function via ref for external triggering
  useEffect(() => {
    if (expandRef) {
      expandRef.current = () => {
        if (disabled) {
          setShowDisabledAlert(true);
        } else {
          setIsExpanded(true);
          // Scroll into view and focus after expansion
          setTimeout(() => {
            containerRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
            inputRef.current?.focus();
          }, 100);
        }
      };
    }
  }, [expandRef, disabled]);

  const handleSubmit = async () => {
    if (!request.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Atomic: freezes parent + creates new draft in one call
      const response = await fetch(`/api/ads/${adId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: request,
          stream,
          parentVersionId,
          freezeParent: true,
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
        // Successful submit — drop the saved draft so a future mount doesn't
        // resurrect the now-consumed request text.
        writeStoredDraft(storageKey, { expanded: false, text: "" });
        onNewVersion(newVersionId);
      } else {
        // Chat endpoint returned 200 but the LLM didn't produce a draft —
        // usually because it replied conversationally ("I need more detail
        // about what you want to change"). Surface that reply instead of
        // the generic fallback, so the user can act on it. The draft text
        // stays in storage so retrying (or sharpening the request) is cheap.
        const llmMessage =
          typeof result.message === "string" ? result.message.trim() : "";
        setError(
          llmMessage ||
            "No new version was created. Try rephrasing — be specific about what should change.",
        );
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

  // Handle click on disabled button
  const handleDisabledClick = () => {
    if (disabled && disabledReason) {
      setShowDisabledAlert(true);
    }
  };

  // Collapsed state: show "Request a change" and "New version (blank)" links
  if (!isExpanded) {
    return (
      <div ref={containerRef} className="mt-4 pt-4 border-t border-white/10">
        <div className="flex justify-between items-center">
          <button
            onClick={disabled ? handleDisabledClick : () => setIsExpanded(true)}
            className={`text-sm transition-colors flex items-center gap-1.5 ${
              disabled
                ? "text-gray-500 cursor-not-allowed"
                : "text-wb-blue hover:text-blue-400"
            }`}
          >
            <RequestChangeIcon className="w-4 h-4" />
            <span>Request a change</span>
            <span>→</span>
          </button>

          {onNewBlankVersion && (
            <button
              onClick={onNewBlankVersion}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>New version (blank)</span>
              <span>→</span>
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        {/* Alert dialog for disabled state */}
        <GlassyModal
          isOpen={showDisabledAlert}
          onClose={() => setShowDisabledAlert(false)}
          title="Cannot Request Changes Yet"
          maxWidth="sm"
        >
          <p className="text-gray-300">{disabledReason}</p>
          <button
            onClick={() => setShowDisabledAlert(false)}
            className="mt-4 w-full px-4 py-2 text-sm font-medium rounded-lg bg-wb-blue/20 text-wb-blue border border-wb-blue/30 hover:bg-wb-blue/30 transition-colors"
          >
            OK
          </button>
        </GlassyModal>
      </div>
    );
  }

  // Expanded state: show input + button
  return (
    <div ref={containerRef} className="mt-4 pt-4 border-t border-white/10">
      <div className="flex gap-2">
        <input
          ref={inputRef}
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
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
