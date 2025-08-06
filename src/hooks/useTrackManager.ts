import { useState } from "react";
import { VoiceTrack, SoundFxPrompt } from "@/types";

export interface Track {
  url: string;
  label: string;
  type: "voice" | "music" | "soundfx";
  startTime?: number;
  duration?: number;
  playAfter?: string;
  overlap?: number;
  volume?: number;
  concurrentGroup?: string;
  isConcurrent?: boolean;
  isLoading?: boolean;
}

export interface TrackManagerState {
  // State
  tracks: Track[];
  voiceTracks: VoiceTrack[];
  isGenerating: boolean;
  isGeneratingMusic: boolean;
  isGeneratingSoundFx: boolean;
  statusMessage: string;
  musicPrompt: string;
  soundFxPrompt: SoundFxPrompt | null;
  
  // Actions
  setTracks: (tracks: Track[] | ((prev: Track[]) => Track[])) => void;
  setVoiceTracks: (tracks: VoiceTrack[]) => void;
  updateVoiceTrack: (index: number, updates: Partial<VoiceTrack>) => void;
  addVoiceTrack: () => void;
  setStatusMessage: (message: string) => void;
  setMusicPrompt: (prompt: string) => void;
  setSoundFxPrompt: (prompt: SoundFxPrompt | null) => void;
  setIsGenerating: (generating: boolean) => void;
  setIsGeneratingMusic: (generating: boolean) => void;
  setIsGeneratingSoundFx: (generating: boolean) => void;
  
  // Reset functions
  resetVoiceTracks: () => void;
  resetMusicTracks: () => void;
  resetSoundFxTracks: () => void;
  resetAllTracks: () => void;
}

export function useTrackManager(): TrackManagerState {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [voiceTracks, setVoiceTracks] = useState<VoiceTrack[]>([
    { voice: null, text: "" },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [isGeneratingSoundFx, setIsGeneratingSoundFx] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [soundFxPrompt, setSoundFxPrompt] = useState<SoundFxPrompt | null>(null);

  const updateVoiceTrack = (index: number, updates: Partial<VoiceTrack>) => {
    const newTracks = [...voiceTracks];
    newTracks[index] = { ...newTracks[index], ...updates };
    setVoiceTracks(newTracks);
  };

  const addVoiceTrack = () => {
    setVoiceTracks([...voiceTracks, { voice: null, text: "" }]);
  };

  const resetVoiceTracks = () => {
    setVoiceTracks([{ voice: null, text: "" }]);
    setTracks((tracks) => tracks.filter((t) => t.type !== "voice"));
    setStatusMessage("");
  };

  const resetMusicTracks = () => {
    setMusicPrompt("");
    setIsGeneratingMusic(false);
    setTracks((tracks) => tracks.filter((t) => t.type !== "music"));
    setStatusMessage("");
  };

  const resetSoundFxTracks = () => {
    setSoundFxPrompt(null);
    setIsGeneratingSoundFx(false);
    setTracks((tracks) => tracks.filter((t) => t.type !== "soundfx"));
    setStatusMessage("");
  };

  const resetAllTracks = () => {
    setTracks([]);
    resetVoiceTracks();
    resetMusicTracks();
    resetSoundFxTracks();
  };

  return {
    tracks,
    voiceTracks,
    isGenerating,
    isGeneratingMusic,
    isGeneratingSoundFx,
    statusMessage,
    musicPrompt,
    soundFxPrompt,
    setTracks,
    setVoiceTracks,
    updateVoiceTrack,
    addVoiceTrack,
    setStatusMessage,
    setMusicPrompt,
    setSoundFxPrompt,
    setIsGenerating,
    setIsGeneratingMusic,
    setIsGeneratingSoundFx,
    resetVoiceTracks,
    resetMusicTracks,
    resetSoundFxTracks,
    resetAllTracks,
  };
}