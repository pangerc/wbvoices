import { MixerTrack } from "@/store/mixerStore";
import type { SoundFxPlacementIntent } from "@/types";

// Legacy Timeline Calculator
// This contains the original 472-line heuristic-based timeline calculation logic
// Kept as a fallback for when AI Timeline Orchestrator fails or is disabled

// Natural overlap between sequential voice tracks for more organic pacing
const NATURAL_VOICE_OVERLAP = 0.15; // seconds

export type LegacyCalculatedTrack = MixerTrack & {
  actualStartTime: number;
  actualDuration: number;
};

export type LegacyCalculationResult = {
  calculatedTracks: LegacyCalculatedTrack[];
  totalDuration: number;
};

export class LegacyTimelineCalculator {
  /**
   * Resolve placement intent to actual track ID or special placement string
   * @param intent - The placement intent to resolve
   * @param voiceTracks - Array of voice tracks (for resolving index-based placement)
   * @returns Resolved playAfter value (track ID, "start", or undefined for end)
   */
  private static resolvePlacementIntent(
    intent: SoundFxPlacementIntent | undefined,
    voiceTracks: LegacyCalculatedTrack[]
  ): string | undefined {
    if (!intent) {
      // No intent specified - default to end placement
      return undefined;
    }

    switch (intent.type) {
      case "beforeVoices":
        // Sequential intro: SFX finishes, then voices start
        return "start";

      case "withFirstVoice":
        // Concurrent intro: SFX plays with first voice (handled specially in timeline)
        return "concurrent-start";

      case "start":
        // Legacy: maps to sequential intro (beforeVoices)
        return "start";

      case "afterVoice": {
        // Find the voice track by index
        const voiceOnlyTracks = voiceTracks.filter(t => t.type === "voice");
        const targetVoice = voiceOnlyTracks[intent.index];

        if (targetVoice) {
          console.log(
            `Resolved placement intent afterVoice[${intent.index}] to track "${targetVoice.label}" (${targetVoice.id})`
          );
          return targetVoice.id;
        }

        // Fallback: if voice track doesn't exist, try adjacent tracks
        const fallbackVoice =
          voiceOnlyTracks[intent.index - 1] ||
          voiceOnlyTracks[intent.index + 1];

        if (fallbackVoice) {
          console.warn(
            `Voice track at index ${intent.index} not found, falling back to "${fallbackVoice.label}"`
          );
          return fallbackVoice.id;
        }

        // No voice tracks available - place at end
        console.warn(
          `Voice track at index ${intent.index} not found and no fallback available, placing at end`
        );
        return undefined;
      }

      case "end":
        // Place at end (after all voices)
        return undefined;

      case "legacy":
        // Use legacy playAfter value directly
        return intent.playAfter;

      default:
        // Exhaustiveness check
        const _exhaustive: never = intent;
        return _exhaustive;
    }
  }

  static calculateTimings(
    tracks: MixerTrack[],
    audioDurations: { [key: string]: number }
  ): LegacyCalculationResult {
    console.log("🔧 Using Legacy Timeline Calculator (heuristic-based)");
    console.log(
      "Recalculating track timings. Available durations:",
      audioDurations
    );

    if (tracks.length === 0) {
      return { calculatedTracks: [], totalDuration: 0 };
    }

    // Filter out invalid tracks (like ones with invalid or missing URLs)
    const validTracks = tracks.filter((track) => {
      // Validate URL - must be a valid blob or http URL
      if (
        !track.url ||
        !(
          track.url.startsWith("blob:") ||
          track.url.startsWith("http:") ||
          track.url.startsWith("https:")
        )
      ) {
        return false;
      }

      return true;
    });

    if (validTracks.length === 0) {
      return { calculatedTracks: [], totalDuration: 0 };
    }

    // Helper function to get actual duration from track
    const getTrackDuration = (track: MixerTrack): number => {
      // First priority: use cached audio duration from actual audio element measurement
      if (audioDurations[track.id] && !isNaN(audioDurations[track.id])) {
        const measuredDuration = audioDurations[track.id];
        console.log(
          `Using measured duration for ${track.label}: ${measuredDuration}s`
        );
        return measuredDuration;
      }

      // Second priority: use track's explicit duration if set
      if (track.duration && !isNaN(track.duration)) {
        console.log(
          `Using explicit duration for ${track.label}: ${track.duration}s`
        );
        return track.duration;
      }

      // For voice tracks, be a bit more generous with the default
      if (track.type === "voice") {
        console.log(`Using default voice duration for ${track.label}: 4s`);
        return 4; // Default for voice is 4 seconds
      }

      // Fall back to default duration for other track types
      console.log(`Using default duration for ${track.label}: 3s`);
      return 3; // Default to 3 seconds
    };

    // We'll use this map to keep track of calculated start times
    const trackStartTimes = new Map<string, number>();

    // Result array to build
    const result: LegacyCalculatedTrack[] = [];

    // Group tracks by type for easier processing
    const voiceTracks = validTracks.filter((track) => track.type === "voice");
    const musicTracks = validTracks.filter((track) => track.type === "music");
    const soundFxTracks = validTracks.filter(
      (track) => track.type === "soundfx"
    );

    // SAFETY NET: Ensure withFirstVoice intent sets playAfter before early filtering
    // This handles cases where placementIntentToLegacyPlayAfter wasn't called properly
    soundFxTracks.forEach((track) => {
      if (track.metadata?.placementIntent) {
        const intent = track.metadata.placementIntent as SoundFxPlacementIntent;
        if (intent.type === "withFirstVoice" && track.playAfter !== "concurrent-start") {
          console.log(`[Timeline] Setting playAfter=concurrent-start for SFX "${track.label}" from placementIntent`);
          track.playAfter = "concurrent-start";
        }
      }
    });

    // First, handle sound effects with "playAfter: start" (sequential intro)
    const introSoundFxTracks = soundFxTracks.filter(
      (track) => track.playAfter === "start"
    );

    // Handle concurrent intro SFX (plays WITH first voice, not before)
    const concurrentSfxTracks = soundFxTracks.filter(
      (track) => track.playAfter === "concurrent-start"
    );

    let startingOffset = 0;

    // Process intro sound effects first and calculate their total duration
    if (introSoundFxTracks.length > 0) {
      console.log(
        `Found ${introSoundFxTracks.length} intro sound effects that play at start`
      );

      // Sort intro sound effects by their overlap (if any)
      introSoundFxTracks.sort((a, b) => {
        const overlapA = a.overlap || 0;
        const overlapB = b.overlap || 0;
        return overlapA - overlapB; // Sort by overlap amount (ascending)
      });

      // Position each intro sound effect sequentially
      let currentEndTime = 0;

      introSoundFxTracks.forEach((track) => {
        if (trackStartTimes.has(track.id)) return; // Skip if already positioned

        const actualDuration = getTrackDuration(track);
        const startTime = Math.max(0, currentEndTime - (track.overlap || 0));

        result.push({
          ...track,
          actualStartTime: startTime,
          actualDuration,
        });

        trackStartTimes.set(track.id, startTime);
        currentEndTime = startTime + actualDuration;
        console.log(
          `Positioned intro sound effect "${track.label}" at ${startTime}s (duration: ${actualDuration}s)`
        );
      });

      // Update starting offset for voice tracks to begin after intro effects
      startingOffset = currentEndTime;
      console.log(
        `Setting voice tracks to start at offset ${startingOffset}s due to intro sound effects`
      );
    }

    // Process concurrent SFX (plays at time 0, same as first voice)
    if (concurrentSfxTracks.length > 0) {
      console.log(
        `Found ${concurrentSfxTracks.length} concurrent sound effects that play with first voice`
      );

      concurrentSfxTracks.forEach((track) => {
        if (trackStartTimes.has(track.id)) return; // Skip if already positioned

        const actualDuration = getTrackDuration(track);

        // Concurrent SFX starts at same time as first voice (startingOffset, or 0 if no intro SFX)
        const startTime = startingOffset;

        result.push({
          ...track,
          actualStartTime: startTime,
          actualDuration,
        });

        trackStartTimes.set(track.id, startTime);
        console.log(
          `Positioned concurrent sound effect "${track.label}" at ${startTime}s (plays with first voice)`
        );
      });
    }

    let lastVoiceEndTime = startingOffset;

    // Process voice tracks based on explicit timing data if available
    if (voiceTracks.length > 0) {
      console.log(`Processing ${voiceTracks.length} voice tracks...`);

      // Step 1: First scan all voice tracks for metadata with their actual start times/durations
      for (const track of voiceTracks) {
        // Use the most accurate duration available
        const actualDuration = getTrackDuration(track);

        // Add support for explicit start times in metadata - need to check if this exists
        // since it's not in the original type definition
        if (
          track.metadata &&
          "startTime" in track.metadata &&
          track.metadata.startTime !== undefined
        ) {
          // Use explicit timing from metadata if available
          const explicitStartTime = track.metadata.startTime as number;
          console.log(
            `Using explicit start time for "${track.label}": ${explicitStartTime}s`
          );

          result.push({
            ...track,
            actualStartTime: explicitStartTime,
            actualDuration,
          });
          trackStartTimes.set(track.id, explicitStartTime);

          // Update lastVoiceEndTime if this track extends beyond current value
          const trackEndTime = explicitStartTime + actualDuration;
          if (trackEndTime > lastVoiceEndTime) {
            lastVoiceEndTime = trackEndTime;
          }
        }
      }

      // Step 2: Position remaining tracks sequentially
      // Position first voice track - check for explicit startTime on the track
      if (voiceTracks.length > 0 && !trackStartTimes.has(voiceTracks[0].id)) {
        const firstVoice = voiceTracks[0];
        const actualDuration = getTrackDuration(firstVoice);

        // Check if this track has an explicit startTime property
        const explicitStartTime =
          firstVoice.startTime !== undefined && !isNaN(firstVoice.startTime)
            ? firstVoice.startTime
            : startingOffset;

        result.push({
          ...firstVoice,
          actualStartTime: explicitStartTime,
          actualDuration,
        });
        trackStartTimes.set(firstVoice.id, explicitStartTime);
        lastVoiceEndTime = explicitStartTime + actualDuration;
        console.log(
          `Positioned first voice track "${firstVoice.label}" at ${explicitStartTime}s with duration ${actualDuration}s (ends at ${lastVoiceEndTime}s)`
        );
      }

      // Process remaining voice tracks in sequence
      for (let i = 1; i < voiceTracks.length; i++) {
        const voiceTrack = voiceTracks[i];

        // Skip if already positioned in step 1
        if (trackStartTimes.has(voiceTrack.id)) {
          console.log(
            `Skipping "${voiceTrack.label}" as it's already positioned`
          );
          continue;
        }

        // Use the most accurate duration available
        const actualDuration = getTrackDuration(voiceTrack);

        // If playAfter is specified, find that track and position after it
        if (voiceTrack.playAfter) {
          const referenceTrack = result.find(
            (t) => t.id === voiceTrack.playAfter
          );
          if (referenceTrack) {
            const refEndTime =
              referenceTrack.actualStartTime + referenceTrack.actualDuration;
            const startTime = Math.round(refEndTime * 100) / 100; // Round to 2 decimal places

            console.log(
              `Positioning "${voiceTrack.label}" at ${startTime}s after "${referenceTrack.label}" (which ends at ${refEndTime}s)`
            );

            result.push({
              ...voiceTrack,
              actualStartTime: startTime,
              actualDuration,
            });
            trackStartTimes.set(voiceTrack.id, startTime);
            lastVoiceEndTime = Math.max(
              lastVoiceEndTime,
              startTime + actualDuration
            );
            continue;
          }
        }

        // Default sequential positioning if no specific instructions
        // Get the previous track in the result array
        const prevTrack = result.find((t) => t.id === voiceTracks[i - 1].id);
        if (prevTrack) {
          const prevEndTime =
            prevTrack.actualStartTime + prevTrack.actualDuration;
          let startTime = Math.round(prevEndTime * 100) / 100; // Round to 2 decimal places

          // Apply overlap if specified, or use natural overlap for organic pacing
          if (voiceTrack.overlap !== undefined && voiceTrack.overlap > 0) {
            // Explicit overlap specified - use it
            startTime = Math.max(
              prevTrack.actualStartTime,
              prevEndTime - voiceTrack.overlap
            );
            startTime = Math.round(startTime * 100) / 100; // Round again after calculation
            console.log(
              `Applying explicit overlap of ${voiceTrack.overlap}s between tracks`
            );
          } else if (voiceTrack.overlap === undefined) {
            // No explicit overlap - apply natural overlap for more organic pacing
            startTime = Math.round((prevEndTime - NATURAL_VOICE_OVERLAP) * 100) / 100;
            // Safety check: ensure minimum gap between tracks (at least 0.5s of actual content)
            const minStartTime = prevTrack.actualStartTime + 0.5;
            if (startTime < minStartTime) {
              startTime = minStartTime;
              console.log(
                `Natural overlap would be too aggressive, using minimum gap instead`
              );
            } else {
              console.log(
                `Applying natural overlap of ${NATURAL_VOICE_OVERLAP}s for organic pacing`
              );
            }
          }

          console.log(
            `Positioning "${voiceTrack.label}" at ${startTime}s after "${prevTrack.label}" (which ends at ${prevEndTime}s)`
          );

          result.push({
            ...voiceTrack,
            actualStartTime: startTime,
            actualDuration,
          });
          trackStartTimes.set(voiceTrack.id, startTime);
          lastVoiceEndTime = Math.max(
            lastVoiceEndTime,
            startTime + actualDuration
          );
        }
      }
    }

    // Calculate the total voice duration for determining music length
    const voiceEndTime = lastVoiceEndTime > 0 ? lastVoiceEndTime : 3; // Default to at least 3 seconds

    // Check if there are sound effects that play after voices end
    // We need to know this before positioning music to decide on fade-out extension
    let maxSoundFxEndTime = 0;

    // Check intro sound effects (already processed)
    introSoundFxTracks.forEach((track) => {
      const startTime = trackStartTimes.get(track.id) || 0;
      const duration = getTrackDuration(track);
      maxSoundFxEndTime = Math.max(maxSoundFxEndTime, startTime + duration);
    });

    // Estimate when other sound effects will end
    soundFxTracks.forEach((track) => {
      // Skip already processed intro tracks
      if (trackStartTimes.has(track.id)) return;

      // Estimate based on playAfter relationships
      if (track.playAfter === "start" || track.playAfter === "concurrent-start" || track.playAfter === "previous") {
        // These are positioned relative to start or previous SFX
        // They'll likely be near the beginning, not affecting music fade
        const duration = getTrackDuration(track);
        maxSoundFxEndTime = Math.max(maxSoundFxEndTime, duration);
      } else if (track.playAfter) {
        // Sound effect plays after a specific track (likely a voice track)
        const refTrack = result.find((t) => t.id === track.playAfter);
        if (refTrack) {
          const refEndTime = refTrack.actualStartTime + refTrack.actualDuration;
          const sfxDuration = getTrackDuration(track);
          const sfxEndTime = refEndTime + sfxDuration - (track.overlap || 0);
          maxSoundFxEndTime = Math.max(maxSoundFxEndTime, sfxEndTime);
        }
      } else if (track.startTime !== undefined && track.startTime >= 0) {
        // Explicit start time
        const sfxDuration = getTrackDuration(track);
        const sfxEndTime = track.startTime + sfxDuration;
        maxSoundFxEndTime = Math.max(maxSoundFxEndTime, sfxEndTime);
      } else {
        // Default placement at end of voices
        const sfxDuration = getTrackDuration(track);
        maxSoundFxEndTime = Math.max(maxSoundFxEndTime, lastVoiceEndTime + sfxDuration);
      }
    });

    // Determine content end time and whether to extend music for fade-out
    const MUSIC_FADEOUT_EXTENSION = 2.0; // seconds
    const contentEndTime = Math.max(voiceEndTime, maxSoundFxEndTime);
    const hasSoundFxAfterVoices = maxSoundFxEndTime > voiceEndTime + 0.1; // Small tolerance

    console.log(
      `Content timing: voices end at ${voiceEndTime}s, sound effects end at ${maxSoundFxEndTime}s`
    );

    // Position music tracks - typically at the beginning with full timeline duration
    if (musicTracks.length > 0) {
      // We'll use just the first music track
      const musicTrack = musicTracks[0];
      if (!trackStartTimes.has(musicTrack.id)) {
        // Use the actual music duration from the audio element if available
        const actualDuration = getTrackDuration(musicTrack);

        // Calculate music duration based on content
        let targetMusicEndTime = contentEndTime;

        // If no sound effects play after voices, extend music for smooth fade-out
        if (!hasSoundFxAfterVoices) {
          targetMusicEndTime = voiceEndTime + MUSIC_FADEOUT_EXTENSION;
          console.log(
            `No ending sound effects detected - extending music ${MUSIC_FADEOUT_EXTENSION}s for fade-out`
          );
        } else {
          console.log(
            `Sound effects play after voices - music will end around voice end time`
          );
        }

        const visualDuration = Math.min(actualDuration, targetMusicEndTime);

        console.log(
          `Positioning music track ${musicTrack.label} with duration ${visualDuration}s (actual: ${actualDuration}s, target end: ${targetMusicEndTime}s)`
        );

        result.push({
          ...musicTrack,
          actualStartTime: 0,
          actualDuration: visualDuration,
          // Store the original duration for mixing/export
          metadata: {
            ...musicTrack.metadata,
            originalDuration: actualDuration,
          },
        });
        trackStartTimes.set(musicTrack.id, 0);
      }
    }

    // Process sound effects with explicit timing
    //
    // KNOWN LIMITATION: Sound effects placed "after voice N" will overlay with voice N+1
    // because ALL voice tracks are positioned first (lines 148-305), and only then are
    // sound effects positioned afterward (here). This creates an underlay effect where
    // SFX plays simultaneously with the next voice, rather than in its own gap.
    //
    // Example timeline with SFX "after voice 1":
    //   Voice 1: [0s ─────── 5s]
    //   Voice 2:             [5s ─────── 10s]  ← Positioned immediately after Voice 1
    //   SFX:                 [5s ── 8s]         ← Also positioned after Voice 1, overlays Voice 2!
    //
    // Proper fix requires Mixer V3 architecture (see docs/mixer-v3-concept.md) with:
    // - Semantic IDs that survive regeneration (voice-1, voice-2)
    // - Dependency-aware positioning that respects all playAfter relationships
    // - Command pattern that can insert gaps between tracks
    //
    // For now, SFX placement options work but create overlays, not gaps.
    //
    soundFxTracks.forEach((track) => {
      // Skip already processed tracks (like intro sound effects)
      if (trackStartTimes.has(track.id)) return;

      // Resolve placement intent if present
      let resolvedPlayAfter = track.playAfter;
      if (track.metadata?.placementIntent) {
        const voiceTracksCalculated = result.filter(t => t.type === "voice");
        resolvedPlayAfter = this.resolvePlacementIntent(
          track.metadata.placementIntent as SoundFxPlacementIntent,
          voiceTracksCalculated
        );
        console.log(
          `Resolved placement for sound effect "${track.label}": ${JSON.stringify(track.metadata.placementIntent)} → "${resolvedPlayAfter || 'end'}"`
        );
      }

      // Process tracks with explicit start times
      if (track.startTime !== undefined && track.startTime >= 0) {
        const actualDuration = getTrackDuration(track);
        result.push({
          ...track,
          actualStartTime: track.startTime,
          actualDuration,
        });
        trackStartTimes.set(track.id, track.startTime);
        return;
      }

      // Handle tracks that should play after another track
      if (resolvedPlayAfter) {
        // Skip "start" and "concurrent-start" cases - we already handled those earlier
        if (resolvedPlayAfter === "start" || resolvedPlayAfter === "concurrent-start") {
          return; // Skip because we already processed intro sound effects
        }

        // Handle "previous" case - play after previous track in list
        if (resolvedPlayAfter === "previous") {
          const trackIndex = soundFxTracks.indexOf(track);
          const prevSoundFx =
            trackIndex > 0 ? soundFxTracks[trackIndex - 1] : null;

          if (prevSoundFx && trackStartTimes.has(prevSoundFx.id)) {
            const prevStartTime = trackStartTimes.get(prevSoundFx.id) || 0;
            const prevDuration = getTrackDuration(prevSoundFx);
            const prevEndTime = prevStartTime + prevDuration;

            let startTime = prevEndTime;
            // Apply overlap if specified
            if (track.overlap && track.overlap > 0) {
              startTime = Math.max(prevStartTime, prevEndTime - track.overlap);
            }

            const actualDuration = getTrackDuration(track);
            result.push({
              ...track,
              actualStartTime: startTime,
              actualDuration,
            });
            trackStartTimes.set(track.id, startTime);
            return;
          } else {
            // If no previous sound FX found, place after voice tracks
            const actualDuration = getTrackDuration(track);
            result.push({
              ...track,
              actualStartTime: lastVoiceEndTime,
              actualDuration,
            });
            trackStartTimes.set(track.id, lastVoiceEndTime);
            return;
          }
        }

        // Handle play after specific track ID
        const referenceTrack = result.find((t) => t.id === resolvedPlayAfter);
        if (referenceTrack) {
          const refStartTime = referenceTrack.actualStartTime;
          const refDuration = referenceTrack.actualDuration;
          const refEndTime = refStartTime + refDuration;

          let startTime = refEndTime;
          // Apply overlap if specified
          if (track.overlap && track.overlap > 0) {
            startTime = Math.max(refStartTime, refEndTime - track.overlap);
          }

          const actualDuration = getTrackDuration(track);
          result.push({
            ...track,
            actualStartTime: startTime,
            actualDuration,
          });
          trackStartTimes.set(track.id, startTime);
          return;
        }
      }

      // Default placement for sound effects with no specific timing
      const actualDuration = getTrackDuration(track);
      result.push({
        ...track,
        actualStartTime: lastVoiceEndTime > 0 ? lastVoiceEndTime : 0,
        actualDuration,
      });
      trackStartTimes.set(
        track.id,
        lastVoiceEndTime > 0 ? lastVoiceEndTime : 0
      );
    });

    // Process any remaining tracks that haven't been positioned yet
    validTracks.forEach((track) => {
      // Skip already processed tracks
      if (trackStartTimes.has(track.id)) return;

      // Default placement - after all existing tracks
      const latestEndTime =
        result.length > 0
          ? Math.max(...result.map((t) => t.actualStartTime + t.actualDuration))
          : 0;

      const actualDuration = getTrackDuration(track);
      result.push({
        ...track,
        actualStartTime: latestEndTime,
        actualDuration,
      });
      trackStartTimes.set(track.id, latestEndTime);
    });

    // Calculate total duration directly from track timings
    // Find the maximum end time of all tracks (excluding music tracks with originalDuration)
    const excludeMusicForLength = result.some(
      (t) => t.type === "voice" || t.type === "soundfx"
    );

    const calculatedMaxDuration =
      result.length > 0
        ? Math.max(
            ...result.map((t) => {
              // For music tracks when we have voice/soundfx, use their visualDuration, not originalDuration
              if (excludeMusicForLength && t.type === "music") {
                return t.actualStartTime + t.actualDuration;
              }
              return t.actualStartTime + t.actualDuration;
            })
          )
        : 0;

    // Round up to the nearest half-second for clean display
    const totalDuration = Math.ceil(calculatedMaxDuration * 2) / 2;

    console.log(
      "Legacy track timing calculation complete:",
      result.map((track) => ({
        id: track.id,
        label: track.label,
        type: track.type,
        start: track.actualStartTime,
        duration: track.actualDuration,
        end: track.actualStartTime + track.actualDuration,
      }))
    );
    console.log(
      "Total timeline duration:",
      totalDuration,
      "(exact end time:",
      calculatedMaxDuration + ")"
    );

    return {
      calculatedTracks: result,
      totalDuration,
    };
  }
}