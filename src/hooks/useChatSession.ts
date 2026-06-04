"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ChatAttachment = {
  // No url — files are extracted in-memory server-side and discarded; the
  // chip only renders name + size as a record of what the user attached on
  // that turn. After page reload the chips are gone.
  name: string;
  sizeBytes: number;
  type: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status?: "pending" | "error";
  // Set client-side from the chat response. Drives the muted "Applied to X."
  // confirmation line under the assistant prose.
  appliedTo?: "voice" | "music" | "sfx" | "timeline";
  // Files the user attached on this turn. Rendered as chips inside the user
  // bubble. Empty/undefined for assistant turns.
  attachments?: ChatAttachment[];
};

type ChatResponseBody = {
  conversationId?: string;
  message?: string;
  drafts?: { voices?: string; music?: string; sfx?: string };
  error?: string;
};

// The chat endpoint returns 400 with a recognisable error when the ad has no
// prior conversation. The panel uses this to show a friendlier no-generation
// hint instead of a raw network error.
const NO_CONVERSATION_MARKER = "No conversation found";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Derive `appliedTo` from the agent's `drafts` payload. Voice changes are
// the most common iteration target, so they win the precedence; multi-stream
// changes collapse to "timeline".
function deriveAppliedTo(
  drafts: ChatResponseBody["drafts"],
): ChatMessage["appliedTo"] {
  if (!drafts) return undefined;
  const touched = (["voices", "music", "sfx"] as const).filter((k) =>
    Boolean(drafts[k]),
  );
  if (touched.length === 0) return undefined;
  if (touched.length > 1) return "timeline";
  return touched[0] === "voices" ? "voice" : touched[0];
}

type SendMessageOptions = {
  files?: File[];
};

export type ChatTurnResult = {
  // Stream IDs that received a new draft on this turn. Same shape as the
  // chat endpoint's `result.drafts`. Empty/undefined for turns where the
  // agent answered without mutating any stream.
  drafts: { voices?: string; music?: string; sfx?: string };
};

export type UseChatSessionOptions = {
  // Fires after every successful chat turn (not on errors). The page wires
  // this to revalidate the SWR caches for the affected streams so the
  // workspace tabs reflect the new draft without requiring a manual reload.
  onTurnLanded?: (result: ChatTurnResult) => void;
};

// User messages in Redis include internal-build artefacts: the initial
// generation prompt produced by `buildUserMessage`, the `## Reference
// materials` block appended when files were attached, and the
// `[VOICE ONLY] / [MUSIC ONLY] / [SOUND EFFECTS ONLY]` focus markers prepended
// for stream-scoped iterations. Stripping them keeps the restored display log
// faithful to what the user actually typed. Returns null when the message is
// pure scaffolding (initial generation prompt) and should be dropped.
function sanitiseUserMessageForDisplay(content: string): string | null {
  let s = content.trim();
  // Drop the initial Generate Creative prompt — its first line follows a
  // predictable shape.
  if (/^Create a \d+-second .+ audio ad\./i.test(s)) return null;
  // Cut any appended internal section (Reference materials, focus markers'
  // IMPORTANT block, etc). They always start at a blank line + `## ` heading.
  const cut = s.indexOf("\n\n## ");
  if (cut >= 0) s = s.slice(0, cut).trim();
  // Strip leading stream-focus markers.
  s = s.replace(/^\[(VOICE|MUSIC|SOUND EFFECTS) ONLY\]\s*/i, "");
  return s.length > 0 ? s : null;
}

/**
 * Local chat session for the AI Copilot panel.
 *
 * The LLM's long-term memory lives in Redis (`continueConversation()` reads
 * it on every turn). This hook keeps the visible display log in React state
 * — refreshing the page clears the log; the Redis context survives.
 */
export function useChatSession(adId: string, options?: UseChatSessionOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callback in a ref so updates don't invalidate
  // sendMessage's identity. The hook would otherwise re-create sendMessage
  // on every render, breaking memoisation downstream.
  const onTurnLandedRef = useRef(options?.onTurnLanded);
  onTurnLandedRef.current = options?.onTurnLanded;

  // Restore visible history on mount from the Redis-backed conversation. The
  // endpoint already filters out system prompts + verbose summaries, so what
  // we receive is close to what the user saw live. `appliedTo` and
  // `attachments` are intentionally absent on restored messages — they're
  // client-derived per-turn and the Redis log doesn't track them.
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/ads/${adId}/conversation`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: { role: string; content: string }[];
        };
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;
        if (ac.signal.aborted) return;
        const restored: ChatMessage[] = [];
        for (const m of data.messages) {
          if (m.role !== "user" && m.role !== "assistant") continue;
          const cleaned =
            m.role === "user"
              ? sanitiseUserMessageForDisplay(m.content)
              : m.content;
          if (cleaned === null || cleaned.length === 0) continue;
          restored.push({
            id: `restored-${restored.length}`,
            role: m.role,
            content: cleaned,
            timestamp:
              Date.now() - (data.messages.length - restored.length) * 1000,
          });
        }
        if (restored.length === 0) return;
        // Only seed if no live messages have landed yet (avoids clobbering
        // a turn that the user fired while history was still loading).
        setMessages((prev) => (prev.length === 0 ? restored : prev));
      } catch {
        // Silent: missing history isn't an error worth surfacing.
      }
    })();
    return () => ac.abort();
  }, [adId]);

  const sendMessage = useCallback(
    async (text: string, options?: SendMessageOptions) => {
      const trimmed = text.trim();
      const files = options?.files ?? [];
      if (!trimmed || isSending) return;

      setError(null);
      setIsSending(true);

      const userMessage: ChatMessage = {
        id: randomId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
        attachments:
          files.length > 0
            ? files.map((f) => ({
                name: f.name,
                sizeBytes: f.size,
                type: f.type,
              }))
            : undefined,
      };
      const pendingId = randomId();
      const pendingAssistant: ChatMessage = {
        id: pendingId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        status: "pending",
      };

      setMessages((prev) => [...prev, userMessage, pendingAssistant]);

      try {
        let res: Response;
        if (files.length > 0) {
          // Multipart path — server extracts each file in-memory via the
          // AAC-27 pipeline and folds summaries into the message body.
          const form = new FormData();
          form.append("message", trimmed);
          for (const f of files) form.append("files", f, f.name);
          res = await fetch(`/api/ads/${adId}/chat`, {
            method: "POST",
            body: form,
          });
        } else {
          res = await fetch(`/api/ads/${adId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed }),
          });
        }
        const data = (await res.json().catch(() => ({}))) as ChatResponseBody;

        if (!res.ok) {
          const errText = data.error?.includes(NO_CONVERSATION_MARKER)
            ? "Please generate your ad first before using chat."
            : data.error || `Chat failed (HTTP ${res.status}).`;
          setError(errText);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingId
                ? { ...m, status: "error" as const, content: errText }
                : m,
            ),
          );
          return;
        }

        const assistantText = data.message?.trim() || "(no response)";
        const appliedTo = deriveAppliedTo(data.drafts);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  content: assistantText,
                  status: undefined,
                  appliedTo,
                  timestamp: Date.now(),
                }
              : m,
          ),
        );
        // Notify the workspace AFTER the local state update so consumers
        // (page-level SWR revalidation) react against a UI that already
        // reflects the assistant's reply.
        onTurnLandedRef.current?.({ drafts: data.drafts ?? {} });
      } catch (err) {
        const errText = err instanceof Error ? err.message : "Network error.";
        setError(errText);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? { ...m, status: "error" as const, content: errText }
              : m,
          ),
        );
      } finally {
        setIsSending(false);
      }
    },
    [adId, isSending],
  );

  // Re-runs the last user message that was followed by an errored assistant
  // turn. Removes the failed assistant bubble first so the optimistic flow in
  // sendMessage produces a fresh pending bubble.
  const retryLast = useCallback(async () => {
    setMessages((prev) => {
      const lastUserIdx = [...prev]
        .reverse()
        .findIndex((m) => m.role === "user");
      if (lastUserIdx === -1) return prev;
      const lastUser = prev[prev.length - 1 - lastUserIdx];
      const dropAfter = prev.slice(0, prev.length - lastUserIdx);
      // Defer the resend to the next tick so the dropped state is committed
      // before sendMessage appends new pending entries.
      queueMicrotask(() => {
        void sendMessage(lastUser.content);
      });
      return dropAfter;
    });
  }, [sendMessage]);

  const clearError = useCallback(() => setError(null), []);

  return { messages, isSending, error, sendMessage, retryLast, clearError };
}
