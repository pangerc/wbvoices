import { Provider, Voice, VoiceTrack, MusicProvider, SoundFxPrompt } from "@/types";
import { generateMusic } from "@/utils/beatoven-api";
import { generateMusicWithLoudly } from "@/utils/loudly-api";
import { useMixerStore, MixerTrack } from "@/store/mixerStore";

export class AudioService {
  static async generateVoiceAudio(
    voiceTracks: VoiceTrack[],
    selectedProvider: Provider,
    onStatusUpdate: (message: string) => void,
    setIsGenerating?: (generating: boolean) => void
  ): Promise<void> {
    setIsGenerating?.(true);
    onStatusUpdate("Generating audio...");
    
    // Clear existing voice tracks from mixer
    const { clearTracks, addTrack } = useMixerStore.getState();
    clearTracks("voice");
    
    try {
      for (const track of voiceTracks) {
        if (!track.voice || !track.text) continue;

        const res = await fetch(`/api/voice/${selectedProvider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: track.text,
            voiceId: track.voice.id,
            style: track.style,
            useCase: track.useCase,
          }),
        });

        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(JSON.stringify(errBody));
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        const mixerTrack: MixerTrack = {
          id: `voice-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          url,
          label: `${track.voice.name}: "${track.text.slice(0, 30)}${
            track.text.length > 30 ? "..." : ""
          }"`,
          type: "voice",
          playAfter: track.playAfter,
          overlap: track.overlap,
          isConcurrent: track.isConcurrent,
          metadata: {
            voiceId: track.voice.id,
            voiceProvider: selectedProvider,
            scriptText: track.text,
          },
        };

        addTrack(mixerTrack);
      }

      onStatusUpdate("Audio generation complete!");
    } finally {
      setIsGenerating?.(false);
    }
  }

  static async generateMusic(
    prompt: string,
    provider: MusicProvider,
    duration: number,
    onStatusUpdate: (message: string) => void,
    setIsGeneratingMusic?: (generating: boolean) => void
  ): Promise<void> {
    setIsGeneratingMusic?.(true);
    onStatusUpdate("Generating music...");
    
    // Clear existing music tracks from mixer
    const { clearTracks, addTrack } = useMixerStore.getState();
    clearTracks("music");
    
    try {
      let musicTrack;

      if (provider === "beatoven") {
        musicTrack = await generateMusic(prompt, duration);
      } else {
        // Loudly requires duration in 15-second increments
        const adjustedDuration = Math.round(duration / 15) * 15;
        musicTrack = await generateMusicWithLoudly(prompt, adjustedDuration);
      }

      if (!musicTrack || !musicTrack.url) {
        throw new Error(`Failed to generate music with ${provider}`);
      }

      const mixerTrack: MixerTrack = {
        id: `music-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url: musicTrack.url,
        label: `Music: "${musicTrack.title.substring(0, 30)}${
          musicTrack.title.length > 30 ? "..." : ""
        }" (${duration}s)`,
        type: "music",
        duration: duration,
        metadata: {
          promptText: prompt,
          originalDuration: musicTrack.duration || duration,
        },
      };

      addTrack(mixerTrack);
      onStatusUpdate("Music generation complete!");
    } finally {
      setIsGeneratingMusic?.(false);
    }
  }

  static async generateSoundEffect(
    prompt: string,
    duration: number,
    soundFxPrompt: SoundFxPrompt | null,
    onStatusUpdate: (message: string) => void,
    setIsGeneratingSoundFx?: (generating: boolean) => void
  ): Promise<void> {
    setIsGeneratingSoundFx?.(true);
    onStatusUpdate("Generating sound effect...");
    
    // Clear existing soundfx tracks from mixer
    const { clearTracks, addTrack } = useMixerStore.getState();
    clearTracks("soundfx");
    
    try {
      const response = await fetch("/api/sfx/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt,
          duration: duration,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to generate sound effect: ${
            errorData.error || response.statusText
          }`
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const mixerTrack: MixerTrack = {
        id: `soundfx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        label: `Sound FX: "${prompt.substring(0, 30)}${
          prompt.length > 30 ? "..." : ""
        }" (${duration}s)`,
        type: "soundfx",
        duration,
        playAfter: soundFxPrompt?.playAfter,
        overlap: soundFxPrompt?.overlap,
        metadata: {
          promptText: prompt,
          originalDuration: duration,
        },
      };

      addTrack(mixerTrack);
      onStatusUpdate("Sound effect generation complete!");
    } finally {
      setIsGeneratingSoundFx?.(false);
    }
  }

  static mapVoiceSegmentsToTracks(
    segments: Array<{ voiceId: string; text: string; style?: string; useCase?: string }>,
    filteredVoices: Voice[],
    allVoices: Voice[]
  ): VoiceTrack[] {
    return segments.map((segment) => {
      // Try to find the voice by ID from filtered voices first
      let voice = filteredVoices.find((v) => v.id === segment.voiceId);

      // If not found in filtered voices, try all voices (fallback)
      if (!voice) {
        voice = allVoices.find((v) => v.id === segment.voiceId);
      }

      // If still not found, try to find a voice by name in filtered voices
      if (!voice) {
        voice = filteredVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
      }

      // If still not found, try to find by name in all voices (fallback)
      if (!voice) {
        voice = allVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
      }

      // If still not found, use the first available voice
      if (!voice) {
        console.log(
          `Voice ID "${segment.voiceId}" not found, using a fallback voice`
        );
        voice = filteredVoices.length > 0 ? filteredVoices[0] : allVoices[0];
      }

      return {
        voice,
        text: segment.text,
        style: segment.style,
        useCase: segment.useCase,
      } as VoiceTrack;
    });
  }
}