"use client";

import { ChatMessage } from "@/components/ui/ChatMessage";
import type { ChatMessage as ChatMessageModel } from "@/hooks/useChatSession";
import { PropsWithChildren, ReactNode } from "react";

/** Demo page for the {@link ChatMessage} bubble — every visual variant used by the AI Copilot panel, rendered with hand-crafted message objects. */
export default function UiKitDemoChatMessagePage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Chat</Kicker>
        <HeroTitle>Chat message</HeroTitle>
        <HeroDescription>
          Single chat bubble used by the AI Copilot panel. Renders user
          messages on the right (blue tint), assistant replies on the left
          (glass), with optional attachment chips, an
          <code className="text-wb-blue">{` Applied to {scope}. `}</code>
          confirmation line, pending dots, error retry, and long-content
          collapse with a Show more / Show less toggle.
        </HeroDescription>
      </section>

      <ComponentSection
        title="User message"
        description="Right-aligned with a blue tint. Wraps long content; no max line cap until ~6 lines."
      >
        <Stack>
          <ChatMessage message={mkUser("Shorten this to 15 seconds.")} />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="Assistant reply"
        description="Left-aligned, glass background. Short replies render plain prose."
      >
        <Stack>
          <ChatMessage
            message={mkAssistant(
              "I picked Emilia Roth — a warm American female ElevenLabs voice.",
            )}
          />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="Applied-to confirmation line"
        description="When a chat turn produced a draft mutation, the bubble shows a muted italic line under the prose indicating which stream changed. Scope is derived server-side from result.drafts."
      >
        <Stack>
          <ChatMessage
            message={mkAssistant(
              "Updated the voice with a more energetic, upbeat read.",
              { appliedTo: "voice" },
            )}
          />
          <ChatMessage
            message={mkAssistant(
              "Swapped the music for an acoustic guitar bed.",
              { appliedTo: "music" },
            )}
          />
          <ChatMessage
            message={mkAssistant(
              "Added a soft chime before the call to action.",
              { appliedTo: "sfx" },
            )}
          />
          <ChatMessage
            message={mkAssistant(
              "Rebuilt voice, music, and SFX for a younger audience.",
              { appliedTo: "timeline" },
            )}
          />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="User message with attachments"
        description="Files attached to a turn render as removable chips in the user bubble. The chips show name + size only — files are extracted in-memory server-side and never stored, so there's no link to follow."
      >
        <Stack>
          <ChatMessage
            message={mkUser(
              "Rewrite the script to match this brand-voice document.",
              {
                attachments: [
                  {
                    name: "brand-guidelines.pdf",
                    sizeBytes: 1_834_000,
                    type: "application/pdf",
                  },
                ],
              },
            )}
          />
          <ChatMessage
            message={mkUser("Make the music more like these references.", {
              attachments: [
                {
                  name: "mood-board.png",
                  sizeBytes: 412_000,
                  type: "image/png",
                },
                {
                  name: "vibe-reference.mp3",
                  sizeBytes: 6_120_000,
                  type: "audio/mpeg",
                },
                {
                  name: "tonal-notes.md",
                  sizeBytes: 3_400,
                  type: "text/markdown",
                },
              ],
            })}
          />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="Pending state"
        description="Assistant bubble while the chat endpoint is still processing. Three dots with a staggered pulse animation."
      >
        <Stack>
          <ChatMessage message={mkAssistant("", { status: "pending" })} />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="Error state with retry"
        description="When the send fails, the pending bubble flips to red with the error message and a Retry link. Retry re-runs the last user message."
      >
        <Stack>
          <ChatMessage
            message={mkAssistant(
              "Chat failed (HTTP 500). Please try again.",
              { status: "error" },
            )}
            onRetry={() => {}}
          />
        </Stack>
      </ComponentSection>

      <ComponentSection
        title="Long content — collapse with Show more"
        description="Bubble bodies clamp to ~6 lines by default. A Show more / Show less toggle appears only when the content actually overflows. Short messages render untouched."
      >
        <Stack>
          <ChatMessage
            message={mkAssistant(
              [
                "Here's a longer walkthrough of the new draft. ",
                "I kept the original brief's pacing and CTA placement, ",
                "but reworked the opening hook to land in the first two seconds. ",
                "The music bed is the same acoustic guitar from version 2, ",
                "with a small lift under the call-to-action. ",
                "I removed the second SFX you flagged as distracting, ",
                "kept the soft transition between scenes, ",
                "and tightened the closing tag by half a second. ",
                "Let me know if you want me to push the voice a touch warmer ",
                "or pull back the music in the bridge.",
              ].join(""),
            )}
          />
        </Stack>
      </ComponentSection>
    </div>
  );
}

// ============== Mock helpers ==============

function mkUser(
  content: string,
  extras: Partial<Omit<ChatMessageModel, "id" | "role" | "content" | "timestamp">> = {},
): ChatMessageModel {
  return {
    id: `demo-user-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content,
    timestamp: Date.now(),
    ...extras,
  };
}

function mkAssistant(
  content: string,
  extras: Partial<Omit<ChatMessageModel, "id" | "role" | "content" | "timestamp">> = {},
): ChatMessageModel {
  return {
    id: `demo-assistant-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content,
    timestamp: Date.now(),
    ...extras,
  };
}

// ============== Layout helpers (page-local) ==============

/** Vertical stack matching the ~400px-wide AI Copilot panel so bubble proportions look realistic. */
function Stack({ children }: PropsWithChildren) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 max-w-[420px]">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Oversized hero heading with a subtle white-to-translucent gradient fill. */
function HeroTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="mt-3 text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
      {children}
    </h1>
  );
}

/** Muted paragraph that sits directly under {@link HeroTitle}. */
function HeroDescription({ children }: PropsWithChildren) {
  return <p className="mt-4 max-w-2xl text-lg text-gray-400">{children}</p>;
}

/** Brand-colored eyebrow rendered above {@link HeroTitle}. */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

/** Top-level page section dedicated to a single variant or pairing of the component. */
function ComponentSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: ReactNode; description: ReactNode }>) {
  return (
    <section className="relative pb-16 pt-10 border-t border-white/10">
      <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl">{description}</p>
      {children}
    </section>
  );
}
