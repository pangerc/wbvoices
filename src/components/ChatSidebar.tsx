"use client";

import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/ui/ChatMessage";
import { useChatSession } from "@/hooks/useChatSession";
import { useUIStore } from "@/store/uiStore";

export type ChatContextStats = {
  // E.g. "Take v7" — derived from the active version's position in the
  // chronological versions list. Falls back to undefined when no version
  // exists yet (the strip is hidden in that case).
  versionLabel?: string;
  durationSeconds?: number | null;
  voiceTrackCount?: number;
  musicTrackCount?: number;
};

type ChatSidebarProps = {
  adId: string;
  // True once any voice / music / sfx version exists. Until then the chat
  // endpoint returns 400 because no Redis conversation has been initialised.
  hasGenerated: boolean;
  // Stats line under the header — `Take v7 · 42s · 1 voice · 1 soundtrack`.
  // Strip is hidden when none of these are set.
  contextStats?: ChatContextStats;
};

const STORAGE_KEY_OPEN = "aac29.chatSidebar.isOpen";

// Same accept list as the AAC-27 admin attachment picker. Audio + image are
// listed as accepted but the in-memory extractor currently rejects them
// (UnsupportedFormatError) — limit is enforced server-side; the picker
// keeps them so the browser file dialog filters consistently.
const ATTACH_ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,.csv,.xlsx,.xls,.xlsm";
const MAX_ATTACH_BYTES = 20 * 1024 * 1024;
const MAX_ATTACH_FILES = 10;

export function ChatSidebar({
  adId,
  hasGenerated,
  contextStats,
}: ChatSidebarProps) {
  const isOpen = useUIStore((s) => s.isChatSidebarOpen);
  const setIsOpen = useUIStore((s) => s.setChatSidebarOpen);
  const [hydrated, setHydrated] = useState(false);

  // Restore persisted open state once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_OPEN);
      if (stored === "1") setIsOpen(true);
    } catch {
      // localStorage may be unavailable (private mode); fall through.
    }
    setHydrated(true);
    // setIsOpen is stable from the store; mount-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY_OPEN, isOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [hydrated, isOpen]);

  if (!hydrated) {
    // Avoid SSR/CSR mismatch: render nothing until the persisted state has
    // been read on the client.
    return null;
  }

  if (!isOpen) {
    return <Launcher onClick={() => setIsOpen(true)} />;
  }

  return (
    <Panel
      adId={adId}
      hasGenerated={hasGenerated}
      contextStats={contextStats}
      onClose={() => setIsOpen(false)}
    />
  );
}

function Launcher({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI Copilot"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full bg-wb-blue/90 hover:bg-wb-blue text-white shadow-lg backdrop-blur-md transition-colors"
    >
      <ChatBubbleLeftRightIcon className="w-5 h-5" strokeWidth={1.75} />
    </button>
  );
}

type PanelProps = {
  adId: string;
  hasGenerated: boolean;
  contextStats?: ChatContextStats;
  onClose: () => void;
};

function Panel({ adId, hasGenerated, contextStats, onClose }: PanelProps) {
  const isExpanded = useUIStore((s) => s.isChatSidebarExpanded);
  const setExpanded = useUIStore((s) => s.setChatSidebarExpanded);
  const { messages, isSending, sendMessage, retryLast } = useChatSession(adId);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to the bottom whenever a new message lands.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.status]);

  // Focus the textarea when the panel opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape collapses expanded → docked; if already docked, closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isExpanded) setExpanded(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExpanded, setExpanded, onClose]);

  const canSend =
    hasGenerated && input.trim().length > 0 && !isSending;

  const handleSend = () => {
    if (!canSend) return;
    const text = input;
    const files = pendingFiles;
    setInput("");
    setPendingFiles([]);
    setFileError(null);
    void sendMessage(text, files.length > 0 ? { files } : undefined);
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const next = [...pendingFiles];
    let firstError: string | null = null;
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_ATTACH_FILES) {
        firstError ??= `Up to ${MAX_ATTACH_FILES} attachments per message.`;
        break;
      }
      if (file.size > MAX_ATTACH_BYTES) {
        firstError ??= `"${file.name}" is over the ${MAX_ATTACH_BYTES / 1024 / 1024} MB per-file limit.`;
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size))
        continue;
      next.push(file);
    }
    setPendingFiles(next);
    setFileError(firstError);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Docked = flex sibling of the workspace content below the header (so the
  // panel sits beneath the tab strip per design.png, not over it). Expanded
  // = fixed inset-0 overlay so it covers the whole viewport. Mobile defaults
  // to a fullscreen overlay since there's no room for a sibling column.
  const asideClass = isExpanded
    ? "fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md"
    : "fixed inset-0 z-40 flex flex-col bg-black/95 backdrop-blur-md sm:relative sm:inset-auto sm:z-auto sm:w-[400px] sm:flex-shrink-0 sm:bg-black/90 sm:border-l sm:border-white/10";

  return (
    <aside className={asideClass} aria-label="AI Copilot">
      <PanelHeader
        isExpanded={isExpanded}
        onToggleExpand={() => setExpanded(!isExpanded)}
        onClose={onClose}
      />

      {contextStats && hasGenerated && <ContextStrip stats={contextStats} />}

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState hasGenerated={hasGenerated} />
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              onRetry={m.status === "error" ? retryLast : undefined}
            />
          ))
        )}
      </div>

      {hasGenerated ? (
        <InputBar
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          value={input}
          onChange={setInput}
          onSend={handleSend}
          canSend={canSend}
          isSending={isSending}
          pendingFiles={pendingFiles}
          onAddFiles={handleAddFiles}
          onRemoveFile={removePendingFile}
          fileError={fileError}
        />
      ) : (
        <NoGenerationGuard />
      )}
    </aside>
  );
}

function PanelHeader({
  isExpanded,
  onToggleExpand,
  onClose,
}: {
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
      <h2 className="text-white text-base font-semibold tracking-tight">
        AI Copilot
      </h2>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={
            isExpanded ? "Collapse AI Copilot" : "Expand AI Copilot fullscreen"
          }
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          {isExpanded ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowsPointingOutIcon className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI Copilot"
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

function ContextStrip({ stats }: { stats: ChatContextStats }) {
  const parts: string[] = ["Currently editing"];
  if (stats.versionLabel) parts.push(stats.versionLabel);
  if (typeof stats.durationSeconds === "number" && stats.durationSeconds > 0) {
    parts.push(`${stats.durationSeconds}s`);
  }
  if (typeof stats.voiceTrackCount === "number") {
    parts.push(`${stats.voiceTrackCount} voice`);
  }
  if (typeof stats.musicTrackCount === "number") {
    parts.push(
      `${stats.musicTrackCount} soundtrack${stats.musicTrackCount === 1 ? "" : "s"}`,
    );
  }
  // Hide the strip if we have nothing beyond the leading label.
  if (parts.length <= 1) return null;
  return (
    <div className="px-5 py-2 border-b border-white/10 bg-white/[0.02] text-xs text-gray-400">
      {parts.join(" · ")}
    </div>
  );
}

function EmptyState({ hasGenerated }: { hasGenerated: boolean }) {
  if (!hasGenerated) return null;
  return (
    <div className="text-center text-gray-400 text-sm px-2 py-8">
      <p>Ask me to refine your ad — any time.</p>
      <p className="mt-2 text-xs text-gray-500">
        Try: <em>&ldquo;Shorten this to 15 seconds&rdquo;</em>,{" "}
        <em>&ldquo;Try a warmer voice&rdquo;</em>,{" "}
        <em>&ldquo;Add a soft chime at the end&rdquo;</em>
      </p>
    </div>
  );
}

function NoGenerationGuard() {
  return (
    <div className="px-5 py-4 border-t border-white/10 text-sm text-gray-400">
      Generate your first draft to start chatting with AI.
    </div>
  );
}

type InputBarProps = {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  canSend: boolean;
  isSending: boolean;
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (idx: number) => void;
  fileError: string | null;
};

function InputBar({
  inputRef,
  fileInputRef,
  value,
  onChange,
  onSend,
  canSend,
  isSending,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  fileError,
}: InputBarProps) {
  return (
    <div className="px-4 py-3 border-t border-white/10 space-y-2">
      {pendingFiles.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pendingFiles.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md border border-white/10 bg-white/5 text-xs text-white"
            >
              <DocumentIcon className="w-3 h-3 text-gray-400" />
              <span className="max-w-[10rem] truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-gray-500">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                disabled={isSending}
                className="p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 disabled:opacity-50"
                aria-label={`Remove ${f.name}`}
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {fileError && (
        <p className="text-xs text-red-300">{fileError}</p>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending}
          aria-label="Attach files"
          title="Attach files — extracted in-memory, never stored"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
        >
          <PaperClipIcon className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACH_ACCEPT}
          className="hidden"
          onChange={(e) => onAddFiles(e.target.files)}
        />

        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Describe what you want to adjust…"
          rows={2}
          disabled={isSending}
          className="flex-1 resize-none rounded-lg bg-black/60 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-wb-blue/50 focus:ring-1 focus:ring-wb-blue/40 disabled:opacity-50"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
            canSend
              ? "bg-wb-blue hover:bg-wb-blue/80 text-white"
              : "bg-white/5 text-gray-500 cursor-not-allowed"
          }`}
        >
          <PaperAirplaneIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
