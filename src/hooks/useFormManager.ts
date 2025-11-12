import { useState } from "react";
import { VoiceTrack, SoundFxPrompt, MusicPrompts } from "@/types";

export interface FormManagerState {
  // Voice editing state
  voiceTracks: VoiceTrack[];

  // Generation states
  isGeneratingCreative: boolean; // For LLM creative generation
  isGenerating: boolean;
  isGeneratingMusic: boolean;
  isGeneratingSoundFx: boolean;
  generatingSoundFxStates: boolean[]; // Per-soundfx generation states
  statusMessage: string;

  // Prompt state
  musicPrompt: string;
  musicPrompts: MusicPrompts | null; // Provider-specific music prompts
  soundFxPrompts: SoundFxPrompt[]; // NEW: Array of sound effects
  soundFxPrompt: SoundFxPrompt | null; // LEGACY: Kept for backward compatibility

  // Voice track actions
  setVoiceTracks: (tracks: VoiceTrack[]) => void;
  updateVoiceTrack: (index: number, updates: Partial<VoiceTrack>) => void;
  addVoiceTrack: () => void;
  removeVoiceTrack: (index: number) => void;

  // Generation state actions
  setIsGeneratingCreative: (generating: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMusic: (generating: boolean) => void;
  setIsGeneratingSoundFx: (generating: boolean) => void;
  setStatusMessage: (message: string) => void;

  // Prompt actions
  setMusicPrompt: (prompt: string) => void;
  setMusicPrompts: (prompts: MusicPrompts | null) => void;
  setSoundFxPrompt: (prompt: SoundFxPrompt | null) => void; // LEGACY: wraps as array
  setSoundFxPrompts: (prompts: SoundFxPrompt[]) => void; // NEW: bulk setter
  addSoundFxPrompt: () => void; // NEW: add sound effect form
  updateSoundFxPrompt: (index: number, updates: Partial<SoundFxPrompt>) => void; // NEW: update specific soundfx
  removeSoundFxPrompt: (index: number) => void; // NEW: remove specific soundfx
  setGeneratingSoundFxState: (index: number, generating: boolean) => void; // NEW: per-form loading state

  // Reset functions
  resetVoiceTracks: () => void;
  resetMusicPrompt: () => void;
  resetSoundFxPrompt: () => void;
  resetAllForms: () => void;
}

export function useFormManager(): FormManagerState {
  // Voice editing state
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>([
    { voice: null, text: "" },
  ]);

  // Generation states
  const [isGeneratingCreative, setIsGeneratingCreative] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [isGeneratingSoundFx, setIsGeneratingSoundFx] = useState(false);
  const [generatingSoundFxStates, setGeneratingSoundFxStates] = useState<boolean[]>([]);
  const [statusMessage, setStatusMessage] = useState("");

  // Prompt state
  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicPrompts, setMusicPrompts] = useState<MusicPrompts | null>(null);
  const [soundFxPrompts, setSoundFxPromptsState] = useState<SoundFxPrompt[]>([]);
  const [soundFxPrompt, setSoundFxPrompt] = useState<SoundFxPrompt | null>(
    null
  ); // LEGACY: kept for backward compatibility

  // Voice track actions
  const updateVoiceTrack = (index: number, updates: Partial<VoiceTrack>) => {
    const newTracks = [...voiceTracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setVoiceTracks(newTracks);
  };

  const addVoiceTrack = () => {
    setVoiceTracks([...voiceTracks, { voice: null, text: "" }]);
  };

  const removeVoiceTrack = (index: number) => {
    const newTracks = voiceTracks.filter((_, i) => i !== index);
    // Ensure we always have at least one track
    if (newTracks.length === 0) {
      setVoiceTracks([{ voice: null, text: "" }]);
    } else {
      setVoiceTracks(newTracks);
    }
  };

  // Sound FX array management actions
  const setSoundFxPrompts = (prompts: SoundFxPrompt[]) => {
    setSoundFxPromptsState(prompts);
    // Sync legacy field with last prompt (for backward compatibility)
    setSoundFxPrompt(prompts.length > 0 ? prompts[prompts.length - 1] : null);
    // Initialize generation states array
    setGeneratingSoundFxStates(prompts.map(() => false));
  };

  const addSoundFxPrompt = () => {
    const newPrompt: SoundFxPrompt = {
      description: "",
      duration: 3,
      placement: { type: "end" },
    };
    setSoundFxPromptsState([...soundFxPrompts, newPrompt]);
    setGeneratingSoundFxStates([...generatingSoundFxStates, false]);
    // Update legacy field
    setSoundFxPrompt(newPrompt);
  };

  const updateSoundFxPrompt = (index: number, updates: Partial<SoundFxPrompt>) => {
    const newPrompts = [...soundFxPrompts];
    // Merge partial updates with existing prompt to preserve all fields
    newPrompts[index] = { ...newPrompts[index], ...updates };
    setSoundFxPromptsState(newPrompts);
    // Update legacy field if this is the last prompt
    if (index === newPrompts.length - 1) {
      setSoundFxPrompt(newPrompts[index]);
    }
  };

  const removeSoundFxPrompt = (index: number) => {
    const newPrompts = soundFxPrompts.filter((_, i) => i !== index);
    const newStates = generatingSoundFxStates.filter((_, i) => i !== index);
    setSoundFxPromptsState(newPrompts);
    setGeneratingSoundFxStates(newStates);
    // Update legacy field with new last prompt
    setSoundFxPrompt(newPrompts.length > 0 ? newPrompts[newPrompts.length - 1] : null);
  };

  const setGeneratingSoundFxState = (index: number, generating: boolean) => {
    const newStates = [...generatingSoundFxStates];
    newStates[index] = generating;
    setGeneratingSoundFxStates(newStates);
  };

  // Reset functions
  const resetVoiceTracks = () => {
    setVoiceTracks([{ voice: null, text: "" }]);
    setStatusMessage("");
  };

  const resetMusicPrompt = () => {
    setMusicPrompt("");
    setMusicPrompts(null);
    setIsGeneratingMusic(false);
    setStatusMessage("");
  };

  const resetSoundFxPrompt = () => {
    setSoundFxPromptsState([]);
    setSoundFxPrompt(null);
    setGeneratingSoundFxStates([]);
    setIsGeneratingSoundFx(false);
    setStatusMessage("");
  };

  const resetAllForms = () => {
    resetVoiceTracks();
    resetMusicPrompt();
    resetSoundFxPrompt();
  };

  return {
    voiceTracks,
    isGeneratingCreative,
    isGenerating,
    isGeneratingMusic,
    isGeneratingSoundFx,
    generatingSoundFxStates,
    statusMessage,
    musicPrompt,
    musicPrompts,
    soundFxPrompts,
    soundFxPrompt,
    setVoiceTracks,
    updateVoiceTrack,
    addVoiceTrack,
    removeVoiceTrack,
    setIsGeneratingCreative,
    setIsGenerating,
    setIsGeneratingMusic,
    setIsGeneratingSoundFx,
    setStatusMessage,
    setMusicPrompt,
    setMusicPrompts,
    setSoundFxPrompt,
    setSoundFxPrompts,
    addSoundFxPrompt,
    updateSoundFxPrompt,
    removeSoundFxPrompt,
    setGeneratingSoundFxState,
    resetVoiceTracks,
    resetMusicPrompt,
    resetSoundFxPrompt,
    resetAllForms,
  };
}
