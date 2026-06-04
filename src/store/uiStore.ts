import { create } from "zustand";

type StreamType = "voices" | "music" | "sfx";

type UIState = {
  // Accordion coordination: which accordion is open per stream
  // Can be "draft" | versionId | null (mutual exclusion: only one open at a time per stream)
  openAccordion: Record<StreamType, string | null>;
  setOpenAccordion: (stream: StreamType, id: string | null) => void;

  // AI Copilot panel open/closed. Lives in the store (vs local
  // state in ChatSidebar) so the workspace can react to it and shrink its
  // content area when the panel is docked. Persisted to localStorage by the
  // panel itself.
  isChatSidebarOpen: boolean;
  setChatSidebarOpen: (next: boolean) => void;
  // Expanded = full-screen overlay state. When true, the workspace shim is
  // bypassed because the panel covers the viewport.
  isChatSidebarExpanded: boolean;
  setChatSidebarExpanded: (next: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  openAccordion: {
    voices: "draft",
    music: "draft",
    sfx: "draft",
  },
  setOpenAccordion: (stream, id) =>
    set((state) => ({
      openAccordion: { ...state.openAccordion, [stream]: id },
    })),
  isChatSidebarOpen: false,
  setChatSidebarOpen: (next) =>
    set((state) => ({
      isChatSidebarOpen: next,
      // Closing the panel also drops the expanded flag so re-opening lands
      // in the default docked state.
      isChatSidebarExpanded: next ? state.isChatSidebarExpanded : false,
    })),
  isChatSidebarExpanded: false,
  setChatSidebarExpanded: (next) => set({ isChatSidebarExpanded: next }),
}));
