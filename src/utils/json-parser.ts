import { VoiceTrack } from "@/types";
import type { SoundFxPrompt } from "@/types";

// Define interfaces for the JSON structure
interface ScriptVoiceItem {
  type: "voice";
  speaker: string;
  text: string;
  playAfter?: string;
  overlap?: number;
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
  };
  soundFxPrompts?: SoundFxPromptJson[];
}

export type ParsedCreativeResponse = {
  voiceSegments: VoiceTrack[];
  musicPrompt: string | null;
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
  // Remove duration indicators like (30s), (15s), etc.
  return description.replace(/\s*\(\d+s\)\s*$/i, "");
}

export function parseCreativeJSON(jsonString: string): ParsedCreativeResponse {
  console.log("Parsing creative JSON:", jsonString);

  // Check if the input is valid JSON
  if (!jsonString || typeof jsonString !== "string") {
    console.error("Invalid JSON input:", jsonString);
    return {
      voiceSegments: [],
      musicPrompt: null,
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
        soundFxPrompts: [],
        timing: { concurrent: [], voiceTimings: [] },
      };
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
          const voiceTrack: VoiceTrack = {
            voice: {
              id: item.speaker,
              name: item.speaker,
              gender: null,
            },
            text: item.text,
          };

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
          });
        }
      });
    }

    // Extract music prompt and clean the description
    if (jsonData.music && jsonData.music.description) {
      musicPrompt = cleanDescription(jsonData.music.description);
    }

    return {
      voiceSegments,
      musicPrompt,
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
      soundFxPrompts: [],
      timing: { concurrent: [], voiceTimings: [] },
    };
  }
}
