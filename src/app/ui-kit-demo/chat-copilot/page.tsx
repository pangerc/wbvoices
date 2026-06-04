"use client";

import { ChatMessage } from "@/components/ui/ChatMessage";
import type { ChatMessage as ChatMessageModel } from "@/hooks/useChatSession";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PropsWithChildren, ReactNode } from "react";

/**
 * Demo page for the {@link ChatSidebar} pattern — the AI Copilot panel
 * composed in three visual states (docked / expanded / closed). Renders a
 * static replica of the panel chrome to keep the demo isolated from the
 * runtime store and from the live chat backend.
 */
export default function UiKitDemoChatCopilotPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>AI</Kicker>
        <HeroTitle>AI Copilot panel</HeroTitle>
        <HeroDescription>
          The persistent chat panel docked in the ad workspace. Three states:
          <strong className="text-white"> docked</strong> on the right of the
          workspace at ~400px wide,
          <strong className="text-white"> expanded</strong> to a fullscreen
          overlay, or
          <strong className="text-white"> closed</strong> with a launcher button
          floating in the bottom-right corner. The demo below renders a faithful
          replica of the chrome — the live panel mounts in
          <code className="text-wb-blue"> /ad/[id] </code> via
          <code className="text-wb-blue"> &lt;ChatSidebar&gt; </code>.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Docked"
        description="Default state on desktop. Fixed right column sitting beside the workspace content. Two header icons (expand + close); context strip with live ad metadata under the header; message list scrolls; input toolbar with paperclip + textarea + send."
      >
        <PanelFrame>
          <PanelChrome state="docked" />
        </PanelFrame>
      </ComponentSection>

      <ComponentSection
        title="Expanded"
        description="Toggled via the expand icon in the header. Fullscreen overlay (z-50). Same chrome, just sized to the viewport. Header expand icon flips to collapse."
      >
        <PanelFrame wide>
          <PanelChrome state="expanded" />
        </PanelFrame>
      </ComponentSection>

      <ComponentSection
        title="Closed — launcher only"
        description="Panel hidden; a chat-bubble launcher floats at the bottom-right corner. Click to reopen as docked. The user's open/closed choice is persisted to localStorage so it survives reloads."
      >
        <div className="relative h-32 rounded-2xl border border-white/10 bg-white/[0.02]">
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            Workspace area (panel hidden)
          </p>
          <LauncherButton />
        </div>
      </ComponentSection>

      <ComponentSection
        title="No-generation guard"
        description="Before the user's first Generate Creative run, the chat endpoint returns 400. The panel handles this by replacing the input with a placeholder."
      >
        <PanelFrame>
          <PanelChrome state="docked" guard="no-generation" />
        </PanelFrame>
      </ComponentSection>

      <ComponentSection
        title="Empty conversation"
        description="When the ad has been generated but no chat turn has fired yet, the message list shows a small onboarding card with example prompts. Clicking an example fills the input — does not auto-submit."
      >
        <PanelFrame>
          <PanelChrome state="docked" guard="empty" />
        </PanelFrame>
      </ComponentSection>
    </div>
  );
}

// ============== Panel replica ==============

type PanelState = "docked" | "expanded";
type GuardState = "messages" | "no-generation" | "empty";

function PanelFrame({ wide, children }: PropsWithChildren<{ wide?: boolean }>) {
  return (
    <div
      className={`rounded-2xl border border-white/10 overflow-hidden ${wide ? "h-[520px]" : "max-w-[420px] h-[520px]"}`}
    >
      {children}
    </div>
  );
}

function PanelChrome({
  state,
  guard = "messages",
}: {
  state: PanelState;
  guard?: GuardState;
}) {
  return (
    <aside className="h-full flex flex-col bg-black/90 backdrop-blur-md">
      <PanelHeader expanded={state === "expanded"} />
      <ContextStrip />
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {guard === "no-generation" ? null : guard === "empty" ? (
          <EmptyOnboarding />
        ) : (
          DEMO_MESSAGES.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
      </div>
      {guard === "no-generation" ? <NoGenerationGuard /> : <InputBar />}
    </aside>
  );
}

function PanelHeader({ expanded }: { expanded: boolean }) {
  return (
    <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
      <h3 className="text-white text-base font-semibold tracking-tight">
        AI Copilot
      </h3>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand fullscreen"}
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white"
        >
          {expanded ? (
            <ArrowsPointingInIcon className="w-4 h-4" />
          ) : (
            <ArrowsPointingOutIcon className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

function ContextStrip() {
  return (
    <div className="px-5 py-2 border-b border-white/10 bg-white/[0.02] text-xs text-gray-400">
      Currently editing · Take v3 · 40s · 1 voice · 1 soundtrack
    </div>
  );
}

function EmptyOnboarding() {
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

function InputBar() {
  return (
    <div className="px-4 py-3 border-t border-white/10">
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label="Attach files"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
        >
          <PaperClipIcon className="w-4 h-4" />
        </button>
        <textarea
          rows={2}
          placeholder="Describe what you want to adjust…"
          className="flex-1 resize-none rounded-lg bg-black/60 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-wb-blue/50 focus:ring-1 focus:ring-wb-blue/40"
          readOnly
        />
        <button
          type="button"
          aria-label="Send message"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-wb-blue hover:bg-wb-blue/80 text-white"
        >
          <PaperAirplaneIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function LauncherButton() {
  return (
    <button
      type="button"
      aria-label="Open AI Copilot"
      className="absolute bottom-4 right-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-wb-blue/90 hover:bg-wb-blue text-white shadow-lg backdrop-blur-md"
    >
      <ChatBubbleLeftRightIcon className="w-5 h-5" strokeWidth={1.75} />
    </button>
  );
}

// ============== Seed data ==============

const DEMO_MESSAGES: ChatMessageModel[] = [
  {
    id: "demo-1",
    role: "user",
    content: "Make the voice more energetic and upbeat.",
    timestamp: Date.now() - 60_000,
  },
  {
    id: "demo-2",
    role: "assistant",
    content:
      "Updated the voice to a warmer, more energetic read while keeping the same music and SFX.",
    timestamp: Date.now() - 50_000,
    appliedTo: "voice",
  },
  {
    id: "demo-3",
    role: "user",
    content: "Rewrite the script to match this brand-voice document.",
    timestamp: Date.now() - 30_000,
    attachments: [
      {
        name: "brand-guidelines.pdf",
        sizeBytes: 1_834_000,
        type: "application/pdf",
      },
    ],
  },
  {
    id: "demo-4",
    role: "assistant",
    content: "",
    timestamp: Date.now() - 25_000,
    status: "pending",
  },
];

// ============== Layout helpers ==============

function HeroTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="mt-3 text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
      {children}
    </h1>
  );
}

function HeroDescription({ children }: PropsWithChildren) {
  return <p className="mt-4 max-w-2xl text-lg text-gray-400">{children}</p>;
}

function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

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
