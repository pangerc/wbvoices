import { VoiceTrack, MusicPrompts, SoundFxPlacementIntent } from "@/types";
import type { SoundFxPrompt } from "@/types";

// Define interfaces for the JSON structure
interface ScriptVoiceItem {
  type: "voice";
  speaker: string;
  text: string;
  playAfter?: string;
  overlap?: number;
  // Provider-specific fields
  style?: string;              // Lovo emotional style
  useCase?: string;            // Lovo use case  
  description?: string;        // ElevenLabs emotional tone
  use_case?: string;           // ElevenLabs use case
  voiceInstructions?: string;  // OpenAI voice control instructions
}

interface ScriptSoundFxItem {
  type: "soundfx";
  description: string;
  playAfter?: string;
  overlap?: number;
  duration?: number;
}

interface ScriptConcurrentItem {
  type: "concurrent";
  elements: Array<ScriptVoiceItem>;
}

type ScriptItem = ScriptVoiceItem | ScriptSoundFxItem | ScriptConcurrentItem;

interface SoundFxPromptJson {
  description: string;
  playAfter?: string;
  overlap?: number;
  duration?: number;
}

interface ConcurrentGroup {
  speakers: string[];
  texts: string[];
}

interface CreativeResponse {
  script?: ScriptItem[];
  music?: {
    description: string;
    loudly?: string;
    mubert?: string;
    elevenlabs?: string;
  };
  soundFxPrompts?: SoundFxPromptJson[];
}

export type ParsedCreativeResponse = {
  voiceSegments: VoiceTrack[];
  musicPrompt: string | null; // Backwards compatibility - fallback to description
  musicPrompts: MusicPrompts | null; // Provider-specific prompts
  soundFxPrompts: Array<{
    description: string;
    playAfter?: string;
    overlap?: number;
    duration?: number;
  }>;
  timing: {
    concurrent: Array<{
      speakers: string[];
      texts: string[];
    }>;
    voiceTimings: Array<{
      voiceId: string;
      playAfter?: string;
      overlap?: number;
      startTime?: number;
    }>;
  };
};

// Add this helper function near the top of the file
function cleanDescription(description: string): string {
  // Remove various duration indicator patterns:
  // - "(2s)", "(30s)" - simple seconds
  // - "(1-2s)", "(2-3s)" - range in seconds
  // - "(2 seconds)", "(30 seconds)" - spelled out
  // - "(short, 2 seconds)" - descriptive with duration
  // - "(short)" - just descriptive words
  return description
    .replace(/\s*\(\d+-?\d*\s*s(?:econds?)?\)\s*$/i, "") // (2s), (1-2s), (2 seconds)
    .replace(/\s*\((?:short|long|brief),?\s*\d+\s*s(?:econds?)?\)\s*$/i, "") // (short, 2 seconds)
    .replace(/\s*\((?:short|long|brief)\)\s*$/i, "") // (short)
    .trim();
}

// Convert legacy playAfter string to placement intent
function parsePlayAfterToIntent(playAfter?: string): SoundFxPlacementIntent | undefined {
  if (!playAfter) {
    // Default to end placement (backwards compatible behavior)
    return { type: "end" };
  }

  if (playAfter === "start") {
    return { type: "start" };
  }

  if (playAfter === "previous") {
    // "previous" means after all voices (legacy behavior)
    return { type: "end" };
  }

  // Otherwise it's a reference to a specific track ID (legacy format)
  return { type: "legacy", playAfter };
}

// Add this function to enforce different voices in dialogues
function ensureDifferentVoicesForDialogue(
  scriptItems: ScriptItem[]
): ScriptItem[] {
  // Count voice items and check for unique speakers
  const voiceItems = scriptItems.filter(
    (item) => item.type === "voice"
  ) as ScriptVoiceItem[];

  if (voiceItems.length >= 2) {
    const uniqueSpeakers = new Set(voiceItems.map((item) => item.speaker));

    // If all speakers are the same, we need to fix it
    if (uniqueSpeakers.size === 1) {
      console.warn(
        "Dialog has same voice for all speakers! Applying differentiation..."
      );

      // Modify alternate voice items with a different voice ID
      for (let i = 1; i < voiceItems.length; i += 2) {
        const originalId = voiceItems[i].speaker;

        // Create a different ID by adding "-alt" suffix and a unique number
        // This ensures uniqueness and indicates it was auto-differentiated
        voiceItems[i].speaker = `${originalId}-alt-${i}`;

        console.log(
          `Auto-differentiated voice: ${originalId} → ${voiceItems[i].speaker}`
        );
      }
    }
  }

  return scriptItems;
}

export function parseCreativeJSON(jsonString: string): ParsedCreativeResponse {
  console.log("Parsing creative JSON:", jsonString);

  // Check if the input is valid JSON
  if (!jsonString || typeof jsonString !== "string") {
    console.error("Invalid JSON input:", jsonString);
    return {
      voiceSegments: [],
      musicPrompt: null,
      musicPrompts: null,
      soundFxPrompts: [],
      timing: { concurrent: [], voiceTimings: [] },
    };
  }

  try {
    // Try to parse the JSON
    let jsonData: CreativeResponse;
    try {
      jsonData = JSON.parse(jsonString);
    } catch (error) {
      console.error("JSON parsing error:", error);
      return {
        voiceSegments: [],
        musicPrompt: null,
        musicPrompts: null,
        soundFxPrompts: [],
        timing: { concurrent: [], voiceTimings: [] },
      };
    }

    // Ensure dialogues use different voices
    if (jsonData.script && Array.isArray(jsonData.script)) {
      jsonData.script = ensureDifferentVoicesForDialogue(jsonData.script);
    }

    const voiceSegments: VoiceTrack[] = [];
    const soundFxPrompts: SoundFxPrompt[] = [];
    const concurrentGroups: ConcurrentGroup[] = [];
    const voiceTimings: Array<{
      voiceId: string;
      playAfter?: string;
      overlap?: number;
      startTime?: number;
    }> = [];
    let musicPrompt: string | null = null;
    let musicPrompts: MusicPrompts | null = null;

    // Extract script elements
    if (jsonData.script && Array.isArray(jsonData.script)) {
      // First pass - collect all voice IDs for reference
      const voiceIds: string[] = [];
      jsonData.script.forEach((item, scriptIndex) => {
        if (item.type === "voice") {
          voiceIds.push(item.speaker);
          // Store timing information for each voice
          voiceTimings.push({
            voiceId: item.speaker,
            playAfter: scriptIndex > 0 ? "previous" : undefined,
            overlap: 0,
            startTime: scriptIndex === 0 ? 0 : undefined,
          });
        }
      });

      // Second pass - extract all elements with their timing
      jsonData.script.forEach((item) => {
        // Handle voice segments
        if (item.type === "voice") {
          // Extract voice ID from speaker string like "Jessica (id: cgSgspJ2msm6clMCkdW9)"
          const idMatch = item.speaker.match(/\(id:\s*([^)]+)\)/);
          const voiceId = idMatch ? idMatch[1] : item.speaker;
          const voiceName = idMatch ? item.speaker.substring(0, item.speaker.indexOf('(')).trim() : item.speaker;
          
          const voiceTrack: VoiceTrack = {
            voice: {
              id: voiceId,
              name: voiceName,
              gender: null,
            },
            text: item.text,
            // Handle provider-specific emotional dimensions
            style: item.style || item.description,           // Lovo uses style, ElevenLabs uses description
            useCase: item.useCase || item.use_case,          // Lovo uses useCase, ElevenLabs uses use_case
            voiceInstructions: item.voiceInstructions,       // OpenAI only
          };

          // Debug logging to see what we're extracting
          console.log(`🎭 JSON Parser extracting voice track:`, {
            voiceId,
            voiceName,
            text: item.text.substring(0, 30) + '...',
            style: voiceTrack.style,
            useCase: voiceTrack.useCase,
            voiceInstructions: voiceTrack.voiceInstructions
          });

          // Add timing information if provided
          if (item.playAfter) {
            voiceTrack.playAfter = item.playAfter;

            // Update the corresponding voice timing
            const timingIndex = voiceTimings.findIndex(
              (t) => t.voiceId === item.speaker
            );
            if (timingIndex !== -1) {
              voiceTimings[timingIndex].playAfter = item.playAfter;
            }
          }

          if (item.overlap !== undefined) {
            voiceTrack.overlap = item.overlap;

            // Update the corresponding voice timing
            const timingIndex = voiceTimings.findIndex(
              (t) => t.voiceId === item.speaker
            );
            if (timingIndex !== -1) {
              voiceTimings[timingIndex].overlap = item.overlap;
            }
          }

          voiceSegments.push(voiceTrack);
        }
        // Handle sound effect segments
        else if (item.type === "soundfx") {
          soundFxPrompts.push({
            description: cleanDescription(item.description),
            playAfter:
              item.playAfter === "start"
                ? "start"
                : item.playAfter || "previous",
            overlap: item.overlap || 0,
            duration: item.duration ? Math.min(item.duration, 15) : 3, // Cap at 15 seconds, default to 3 if not provided
            placement: parsePlayAfterToIntent(item.playAfter), // Add placement intent
          });
        }
        // Handle concurrent elements
        else if (item.type === "concurrent" && item.elements) {
          const speakers: string[] = [];
          const texts: string[] = [];

          item.elements.forEach((element) => {
            if (element.type === "voice") {
              speakers.push(element.speaker);
              texts.push(element.text);

              // Also add to voice segments for individual processing
              const voiceTrack: VoiceTrack = {
                voice: {
                  id: element.speaker,
                  name: element.speaker,
                  gender: null,
                },
                text: element.text,
                // Handle provider-specific emotional dimensions
                style: element.style || element.description,           // Lovo uses style, ElevenLabs uses description
                useCase: element.useCase || element.use_case,          // Lovo uses useCase, ElevenLabs uses use_case
                voiceInstructions: element.voiceInstructions,          // OpenAI only
                isConcurrent: true, // Mark as concurrent so mixer can handle it specially
              };

              voiceSegments.push(voiceTrack);

              // Add special timing for concurrent voices
              // These voices should start at the same time
              if (speakers.length > 1) {
                // Get the timing of the first speaker in this concurrent group
                const firstSpeakerId = speakers[0];
                const firstSpeakerIndex = voiceTimings.findIndex(
                  (t) => t.voiceId === firstSpeakerId
                );

                if (firstSpeakerIndex !== -1) {
                  const timing = voiceTimings[firstSpeakerIndex];

                  // Add or update timing for this concurrent voice
                  const voiceTimingIndex = voiceTimings.findIndex(
                    (t) => t.voiceId === element.speaker
                  );
                  if (voiceTimingIndex !== -1) {
                    voiceTimings[voiceTimingIndex] = {
                      ...voiceTimings[voiceTimingIndex],
                      playAfter: timing.playAfter,
                      overlap: timing.overlap,
                      startTime: timing.startTime,
                    };
                  } else {
                    voiceTimings.push({
                      voiceId: element.speaker,
                      playAfter: timing.playAfter,
                      overlap: timing.overlap,
                      startTime: timing.startTime,
                    });
                  }
                }
              }
            }
          });

          concurrentGroups.push({ speakers, texts });
        }
      });
    }

    // Also extract sound effect prompts from the soundFxPrompts array if present
    if (jsonData.soundFxPrompts && Array.isArray(jsonData.soundFxPrompts)) {
      jsonData.soundFxPrompts.forEach((item) => {
        if (item.description) {
          soundFxPrompts.push({
            description: cleanDescription(item.description),
            playAfter:
              item.playAfter === "start"
                ? "start"
                : item.playAfter || "previous",
            overlap: item.overlap || 0,
            duration: item.duration ? Math.min(item.duration, 15) : 3, // Cap at 15 seconds, default to 3 if not provided
            placement: parsePlayAfterToIntent(item.playAfter), // Add placement intent
          });
        }
      });
    }

    // Extract music prompts with smart fallbacks
    if (jsonData.music) {
      const music = jsonData.music;

      // Always extract description for backwards compatibility
      if (music.description) {
        musicPrompt = cleanDescription(music.description);
      }

      // Extract provider-specific prompts if present
      if (music.loudly || music.mubert || music.elevenlabs) {
        musicPrompts = {
          loudly: music.loudly ? cleanDescription(music.loudly) : musicPrompt || "",
          mubert: music.mubert ? cleanDescription(music.mubert) : musicPrompt || "",
          elevenlabs: music.elevenlabs ? cleanDescription(music.elevenlabs) : musicPrompt || "",
        };

        console.log("🎵 JSON Parser extracted music prompts:", {
          description: musicPrompt,
          loudly: musicPrompts.loudly.substring(0, 50) + "...",
          mubert: musicPrompts.mubert,
          elevenlabs: musicPrompts.elevenlabs.substring(0, 50) + "...",
        });
      }
    }

    return {
      voiceSegments,
      musicPrompt,
      musicPrompts,
      soundFxPrompts,
      timing: {
        concurrent: concurrentGroups,
        voiceTimings,
      },
    };
  } catch (error) {
    console.error("Error parsing creative JSON:", error);
    return {
      voiceSegments: [],
      musicPrompt: null,
      musicPrompts: null,
      soundFxPrompts: [],
      timing: { concurrent: [], voiceTimings: [] },
    };
  }
}
