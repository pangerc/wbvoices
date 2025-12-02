import { create } from "zustand";

type StreamType = "voices" | "music" | "sfx";

type UIState = {
  // Accordion coordination: which accordion is open per stream
  // Can be "draft" | versionId | null (mutual exclusion: only one open at a time per stream)
  openAccordion: Record<StreamType, string | null>;
  setOpenAccordion: (stream: StreamType, id: string | null) => void;
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
}));
