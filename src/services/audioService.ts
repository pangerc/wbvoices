import { Provider, Voice, VoiceTrack, MusicProvider, SoundFxPrompt, Pacing } from "@/types";
// Beatoven removed - trial expired and poor quality
import { generateMusicWithLoudly } from "@/utils/loudly-api";
import { generateMusicWithMubert } from "@/utils/mubert-api";
import { generateMusicWithElevenLabs } from "@/utils/elevenlabs-music-api";
import { useMixerStore, MixerTrack } from "@/store/mixerStore";
import { applyTimeStretch } from "@/utils/audio-processing";

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

        // Use track-specific provider if set, otherwise fall back to voice.provider or selectedProvider
        const trackProvider = track.trackProvider || track.voice.provider || selectedProvider;

        console.log(`🎭 Sending emotional parameters to ${trackProvider}:`);
        console.log(`  - Voice: ${track.voice.name} (${track.voice.id})`);
        console.log(`  - Provider: ${trackProvider}${track.trackProvider ? ' (track override)' : ''}`);
        console.log(`  - Style: ${track.style || 'none'}`);
        console.log(`  - Use Case: ${track.useCase || 'none'}`);
        console.log(`  - Voice Instructions: ${track.voiceInstructions || 'none'}`);
        console.log(`  - Speed: ${track.speed !== undefined ? `${track.speed}x (manual)` : 'not set (using preset/default)'}`);

        const res = await fetch(`/api/voice/${trackProvider}-v2`, {
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
            pacing, // Pass pacing for speed control (global)
            speed: track.speed, // Per-track speed override (manual control)
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
          console.log(`Using permanent blob URL for ${trackProvider}:`, url);
        } else {
          // Legacy blob response format (ElevenLabs, Lovo for now)
          const blob = await res.blob();
          url = URL.createObjectURL(blob);
          console.log(`Using temporary blob URL for ${trackProvider}:`, url);
        }

        // Apply post-processing speedup if specified (ElevenLabs only)
        if (trackProvider === 'elevenlabs' && (track.postProcessingSpeedup || track.targetDuration)) {
          console.log(`🎬 Post-processing required for ElevenLabs track`);
          onStatusUpdate(`Applying ${track.postProcessingSpeedup ? `${track.postProcessingSpeedup}x speedup` : `target duration ${track.targetDuration}s`}...`);
          url = await this.applyPostProcessingSpeedup(url, track, onStatusUpdate);
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
            voiceProvider: trackProvider,
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

    // NOTE: Clearing tracks is now handled by the caller (handleGenerateSoundFx)
    // to prevent clearing on each iteration when generating multiple soundfx
    const { addTrack } = useMixerStore.getState();

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

      // Derive playAfter from placement intent for backward compatibility
      let derivedPlayAfter: string | undefined = soundFxPrompt?.playAfter;
      const placementType = soundFxPrompt?.placement?.type;
      if (placementType === "beforeVoices" || placementType === "start") {
        derivedPlayAfter = "start"; // Sequential intro
      }
      // Note: "withFirstVoice" doesn't set playAfter - it's handled by placementIntent

      const mixerTrack: MixerTrack = {
        id: `soundfx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        url,
        label: `Sound FX: "${prompt.substring(0, 30)}${
          prompt.length > 30 ? "..." : ""
        }" (${actualDuration.toFixed(1)}s)`,
        type: "soundfx",
        duration: actualDuration,
        playAfter: derivedPlayAfter,
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

  /**
   * Apply post-processing speedup to audio
   * Downloads audio, applies time-stretching, uploads processed version
   * @param originalUrl URL of the original audio
   * @param track VoiceTrack with post-processing parameters
   * @param onStatusUpdate Status callback
   * @returns URL of the processed audio
   */
  private static async applyPostProcessingSpeedup(
    originalUrl: string,
    track: VoiceTrack,
    onStatusUpdate: (message: string) => void
  ): Promise<string> {
    try {
      // Download the original audio
      console.log(`📥 Downloading original audio from ${originalUrl}`);
      const response = await fetch(originalUrl);
      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.statusText}`);
      }
      const audioArrayBuffer = await response.arrayBuffer();
      console.log(`Downloaded ${audioArrayBuffer.byteLength} bytes`);

      // Calculate speedup
      let speedup = track.postProcessingSpeedup || 1.0;

      // If target duration is specified, measure original duration and calculate speedup
      if (track.targetDuration) {
        console.log(`🎯 Target duration specified: ${track.targetDuration}s`);
        onStatusUpdate(`Measuring audio duration...`);

        // Measure original duration using Audio element
        const originalDuration = await new Promise<number>((resolve) => {
          const audio = new Audio(originalUrl);
          audio.addEventListener('loadedmetadata', () => {
            console.log(`Original duration: ${audio.duration}s`);
            resolve(audio.duration);
          });
          audio.addEventListener('error', () => {
            console.warn(`Could not measure duration, using speedup parameter`);
            resolve(0);
          });
          audio.load();
        });

        if (originalDuration > 0) {
          // Calculate speedup to achieve target duration
          speedup = originalDuration / track.targetDuration!;
          console.log(`Calculated speedup: ${speedup}x (${originalDuration}s → ${track.targetDuration}s)`);

          // Clamp to 1.6x max
          if (speedup > 1.6) {
            console.warn(`⚠️ Calculated speedup ${speedup}x exceeds 1.6x, clamping to 1.6x`);
            const achievableDuration = originalDuration / 1.6;
            console.warn(`  Achievable duration at 1.6x: ${achievableDuration.toFixed(2)}s (target was ${track.targetDuration}s)`);
            speedup = 1.6;
          }
        }
      }

      // Apply time-stretching
      const pitch = track.postProcessingPitch || 1.0;
      console.log(`⚡ Applying ${speedup}x time-stretch with ${pitch}x pitch adjustment...`);
      onStatusUpdate(`Processing audio (${speedup.toFixed(2)}x speedup, ${pitch.toFixed(2)}x pitch)...`);
      const processedArrayBuffer = await applyTimeStretch(audioArrayBuffer, speedup, pitch);

      // Upload processed audio to Vercel
      console.log(`📤 Uploading processed audio...`);
      onStatusUpdate('Uploading processed audio...');

      const processedBlob = new Blob([processedArrayBuffer], { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('audio', processedBlob, `processed-voice-${Date.now()}.wav`);
      formData.append('voiceId', track.voice?.id || 'unknown');
      formData.append('provider', 'elevenlabs-processed');
      formData.append('projectId', `voice-processed-${Date.now()}`);

      const uploadResponse = await fetch('/api/voice/upload-processed', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload processed audio: ${uploadResponse.statusText}`);
      }

      const { audio_url } = await uploadResponse.json();
      console.log(`✅ Processed audio uploaded: ${audio_url}`);
      return audio_url;
    } catch (error) {
      console.error('❌ Post-processing failed:', error);
      onStatusUpdate('Post-processing failed, using original audio');
      // Return original URL on error
      return originalUrl;
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