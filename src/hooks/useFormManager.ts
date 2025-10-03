import { useState } from "react";
import { VoiceTrack, SoundFxPrompt } from "@/types";

export interface FormManagerState {
  // Voice editing state
  voiceTracks: VoiceTrack[];

  // Generation states
  isGeneratingCreative: boolean; // For LLM creative generation
  isGenerating: boolean;
  isGeneratingMusic: boolean;
  isGeneratingSoundFx: boolean;
  statusMessage: string;

  // Prompt state
  musicPrompt: string;
  soundFxPrompt: SoundFxPrompt | null;

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
  setSoundFxPrompt: (prompt: SoundFxPrompt | null) => void;

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
  const [statusMessage, setStatusMessage] = useState("");

  // Prompt state
  const [musicPrompt, setMusicPrompt] = useState("");
  const [soundFxPrompt, setSoundFxPrompt] = useState<SoundFxPrompt | null>(
    null
  );

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

  // Reset functions
  const resetVoiceTracks = () => {
    setVoiceTracks([{ voice: null, text: "" }]);
    setStatusMessage("");
  };

  const resetMusicPrompt = () => {
    setMusicPrompt("");
    setIsGeneratingMusic(false);
    setStatusMessage("");
  };

  const resetSoundFxPrompt = () => {
    setSoundFxPrompt(null);
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
    statusMessage,
    musicPrompt,
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
    setSoundFxPrompt,
    resetVoiceTracks,
    resetMusicPrompt,
    resetSoundFxPrompt,
    resetAllForms,
  };
}
