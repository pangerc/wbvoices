import { create } from "zustand";

/**
 * Ephemeral UI state for MixerPanel.
 * Track data comes from SWR (useMixerData) - this store is for transient UI state only.
 */
type MixerUIState = {
  // Export state
  isExporting: boolean;
  isUploadingMix: boolean;
  uploadError: string | null;

  // Per-track loading state (for audio element loading)
  loadingStates: Record<string, boolean>;
  audioErrors: Record<string, boolean>;

  // Preview state (local blob URL, not the permanent one)
  previewUrl: string | null;
  isPreviewValid: boolean;

  // Actions
  setIsExporting: (val: boolean) => void;
  setIsUploadingMix: (val: boolean) => void;
  setUploadError: (error: string | null) => void;
  setTrackLoading: (id: string, loading: boolean) => void;
  setTrackError: (id: string, hasError: boolean) => void;
  setPreviewUrl: (url: string | null) => void;
  setIsPreviewValid: (valid: boolean) => void;
  reset: () => void;
};

const initialState = {
  isExporting: false,
  isUploadingMix: false,
  uploadError: null,
  loadingStates: {},
  audioErrors: {},
  previewUrl: null,
  isPreviewValid: false,
};

export const useMixerUIStore = create<MixerUIState>((set) => ({
  ...initialState,

  setIsExporting: (val) => set({ isExporting: val }),
  setIsUploadingMix: (val) => set({ isUploadingMix: val }),
  setUploadError: (error) => set({ uploadError: error }),

  setTrackLoading: (id, loading) =>
    set((s) => ({ loadingStates: { ...s.loadingStates, [id]: loading } })),

  setTrackError: (id, hasError) =>
    set((s) => ({ audioErrors: { ...s.audioErrors, [id]: hasError } })),

  setPreviewUrl: (url) => set({ previewUrl: url }),
  setIsPreviewValid: (valid) => set({ isPreviewValid: valid }),

  reset: () => set(initialState),
}));
