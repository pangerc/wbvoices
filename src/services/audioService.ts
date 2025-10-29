import { Provider, Voice, VoiceTrack, MusicProvider, SoundFxPrompt, Pacing } from "@/types";
// Beatoven removed - trial expired and poor quality
import { generateMusicWithLoudly } from "@/utils/loudly-api";
import { generateMusicWithMubert } from "@/utils/mubert-api";
import { generateMusicWithElevenLabs } from "@/utils/elevenlabs-music-api";
import { useMixerStore, MixerTrack } from "@/store/mixerStore";

export class AudioService {
  static async generateVoiceAudio(
    voiceTracks: VoiceTrack[],
    selectedProvider: Provider,
    onStatusUpdate: (message: string) => void,
    setIsGenerating?: (generating: boolean) => void,
    region?: string,
    accent?: string,
    pacing?: Pacing | null
  ): Promise<void> {
    setIsGenerating?.(true);
    onStatusUpdate("Generating audio...");
    
    // Clear existing voice tracks from mixer
    const { clearTracks, addTrack } = useMixerStore.getState();
    clearTracks("voice");
    
    try {
      for (const track of voiceTracks) {
        if (!track.voice || !track.text) continue;

        console.log(`🎭 Sending emotional parameters to ${selectedProvider}:`);
        console.log(`  - Voice: ${track.voice.name} (${track.voice.id})`);
        console.log(`  - Style: ${track.style || 'none'}`);
        console.log(`  - Use Case: ${track.useCase || 'none'}`);
        console.log(`  - Voice Instructions: ${track.voiceInstructions || 'none'}`);

        const res = await fetch(`/api/voice/${selectedProvider}-v2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: track.text,
            voiceId: track.voice.id,
            style: track.style,
            useCase: track.useCase,
            voiceInstructions: track.voiceInstructions, // OpenAI-specific voice instructions
            region, // Pass region for accent support
            accent, // Pass accent for dialect support
            pacing, // Pass pacing for speed control
            projectId: `voice-project-${Date.now()}`, // Add projectId for blob storage
          }),
        });

        if (!res.ok) {
          const errBody = await res.json();
          throw new Error(JSON.stringify(errBody));
        }

        let url: string;
        const contentType = res.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          // New blob storage response format (OpenAI and future providers)
          const jsonResponse = await res.json();
          url = jsonResponse.audio_url;
          console.log(`Using permanent blob URL for ${selectedProvider}:`, url);
        } else {
          // Legacy blob response format (ElevenLabs, Lovo for now)
          const blob = await res.blob();
          url = URL.createObjectURL(blob);
          console.log(`Using temporary blob URL for ${selectedProvider}:`, url);
        }
        
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

      if (provider === "loudly") {
        // Loudly requires duration in 15-second increments
        const adjustedDuration = Math.round(duration / 15) * 15;
        musicTrack = await generateMusicWithLoudly(prompt, adjustedDuration);
      } else if (provider === "mubert") {
        musicTrack = await generateMusicWithMubert(prompt, duration);
      } else if (provider === "elevenlabs") {
        musicTrack = await generateMusicWithElevenLabs(prompt, duration);
      } else {
        throw new Error(`Unsupported music provider: ${provider}`);
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
      const response = await fetch("/api/sfx/elevenlabs-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt,
          duration: duration,
          projectId: `soundfx-project-${Date.now()}`, // Add projectId for blob storage
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

      let url: string;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        // New blob storage response format
        const jsonResponse = await response.json();
        url = jsonResponse.audio_url;
        console.log(`Using permanent blob URL for SoundFX:`, url);
      } else {
        // Legacy blob response format
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        console.log(`Using temporary blob URL for SoundFX:`, url);
      }

      // Measure actual audio duration before creating track
      const actualDuration = await new Promise<number>((resolve) => {
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && !isNaN(audio.duration)) {
            console.log(`Measured sound effect duration: ${audio.duration}s (requested: ${duration}s)`);
            resolve(audio.duration);
          } else {
            console.warn(`Could not measure audio duration, using requested duration: ${duration}s`);
            resolve(duration);
          }
        });
        audio.addEventListener('error', () => {
          console.warn(`Error loading audio for duration measurement, using requested duration: ${duration}s`);
          resolve(duration);
        });
        audio.load();
      });

      const mixerTrack: MixerTrack = {
        id: `soundfx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        label: `Sound FX: "${prompt.substring(0, 30)}${
          prompt.length > 30 ? "..." : ""
        }" (${actualDuration.toFixed(1)}s)`,
        type: "soundfx",
        duration: actualDuration,
        playAfter: soundFxPrompt?.playAfter,
        overlap: soundFxPrompt?.overlap,
        metadata: {
          promptText: prompt,
          originalDuration: duration, // Keep the requested duration in metadata
          placementIntent: soundFxPrompt?.placement, // Store placement intent for timeline resolution
        },
      };

      addTrack(mixerTrack);
      onStatusUpdate("Sound effect generation complete!");
    } finally {
      setIsGeneratingSoundFx?.(false);
    }
  }

  static mapVoiceSegmentsToTracks(
    segments: Array<{ voiceId: string; text: string; style?: string; useCase?: string; voiceInstructions?: string }>,
    filteredVoices: Voice[],
    allVoices: Voice[]
  ): VoiceTrack[] {
    console.log('🔍 mapVoiceSegmentsToTracks called with:');
    console.log('  - Segments:', segments.map(s => ({ voiceId: s.voiceId, text: s.text?.slice(0, 30) + '...' })));
    console.log('  - Filtered voices:', filteredVoices.length, 'voices');
    console.log('  - All voices:', allVoices.length, 'voices');
    
    return segments.map((segment, index) => {
      console.log(`🎯 Processing segment ${index}:`, { voiceId: segment.voiceId, text: segment.text?.slice(0, 30) + '...' });
      
      // Try to find the voice by ID from filtered voices first
      let voice = filteredVoices.find((v) => v.id === segment.voiceId);
      console.log(`  - Found in filtered voices:`, !!voice, voice?.name);

      // If not found in filtered voices, try all voices (fallback)
      if (!voice) {
        voice = allVoices.find((v) => v.id === segment.voiceId);
        console.log(`  - Found in all voices:`, !!voice, voice?.name);
      }

      // If still not found, try to find a voice by name in filtered voices
      if (!voice) {
        voice = filteredVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
        console.log(`  - Found by name in filtered voices:`, !!voice, voice?.name);
      }

      // If still not found, try to find by name in all voices (fallback)
      if (!voice) {
        voice = allVoices.find(
          (v) => v.name.toLowerCase() === segment.voiceId.toLowerCase()
        );
        console.log(`  - Found by name in all voices:`, !!voice, voice?.name);
      }

      // If still not found, use the first available voice
      if (!voice) {
        console.log(
          `❌ Voice ID "${segment.voiceId}" not found anywhere, using fallback voice`
        );
        voice = filteredVoices.length > 0 ? filteredVoices[0] : allVoices[0];
        console.log(`  - Using fallback:`, voice?.name);
      }

      const result = {
        voice,
        text: segment.text,
        style: segment.style,
        useCase: segment.useCase,
        voiceInstructions: segment.voiceInstructions,
      } as VoiceTrack;
      
      console.log(`  - Final result:`, { hasVoice: !!result.voice, voiceName: result.voice?.name, text: result.text?.slice(0, 20) + '...' });
      return result;
    });
  }
}