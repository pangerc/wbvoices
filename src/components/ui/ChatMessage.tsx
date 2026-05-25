"use client";

import { DocumentIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage as ChatMessageModel } from "@/hooks/useChatSession";

type ChatMessageProps = {
  message: ChatMessageModel;
  onRetry?: () => void;
};

const APPLIED_TO_LABEL: Record<NonNullable<ChatMessageModel["appliedTo"]>, string> = {
  voice: "Applied to voice.",
  music: "Applied to music.",
  sfx: "Applied to sfx.",
  timeline: "Applied to timeline.",
};

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isError = message.status === "error";

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-wb-blue/20 border border-wb-blue/30 text-white"
            : isError
              ? "bg-red-500/10 border border-red-500/30 text-red-200"
              : "bg-white/5 border border-white/10 backdrop-blur-sm text-gray-100"
        }`}
      >
        {isPending ? (
          <PendingDots />
        ) : (
          <>
            <CollapsibleContent content={message.content} />
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentChips attachments={message.attachments} />
            )}
            {!isUser && message.appliedTo && (
              <p className="mt-2 text-xs italic text-gray-400">
                {APPLIED_TO_LABEL[message.appliedTo]}
              </p>
            )}
            {isError && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-xs text-red-300 underline hover:text-red-200"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Bubble bodies clamp to ~6 lines by default; a Show more / Show less toggle
// appears only when the content actually overflows that cap. The overflow
// check runs once per content change via scrollHeight vs clientHeight on the
// rendered paragraph.
function CollapsibleContent({ content }: { content: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure the clamped paragraph. If scrollHeight exceeds clientHeight,
    // the line-clamp truncated something — surface the toggle.
    setCanExpand(el.scrollHeight - el.clientHeight > 1);
  }, [content]);

  return (
    <>
      <p
        ref={ref}
        className={expanded ? "" : "line-clamp-6"}
      >
        {content}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-gray-400 hover:text-white underline-offset-2 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function AttachmentChips({
  attachments,
}: {
  attachments: NonNullable<ChatMessageModel["attachments"]>;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a, i) => (
        <li
          key={`${a.name}-${i}`}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/15 bg-white/5 text-xs text-gray-200"
        >
          <DocumentIcon className="w-3 h-3 text-gray-400" />
          <span className="max-w-[10rem] truncate" title={a.name}>
            {a.name}
          </span>
          <span className="text-gray-400">
            {(a.sizeBytes / 1024).toFixed(0)} KB
          </span>
        </li>
      ))}
    </ul>
  );
}

// Three dots with staggered animation. Matches the existing project loading
// dot aesthetic (see existing animate-pulse usages).
function PendingDots() {
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label="Assistant is thinking"
    >
      <Dot delay="0ms" />
      <Dot delay="150ms" />
      <Dot delay="300ms" />
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}
