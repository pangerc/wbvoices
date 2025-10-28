"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CampaignFormat,
  SoundFxPrompt,
  ProjectBrief,
  AIModel,
  MusicProvider,
  MusicPrompts,
  VoiceTrack,
  Language,
  Voice,
  Provider,
  Pacing,
} from "@/types";

// Type for LLM response data that needs to be saved
type LLMResponseData = {
  voiceTracks: VoiceTrack[];
  musicPrompt: string;
  musicPrompts: MusicPrompts | null; // Provider-specific music prompts
  soundFxPrompt: SoundFxPrompt | null;
  projectReady?: boolean; // Whether project is ready for saving
};
import {
  ScripterPanel,
  MixerPanel,
  MusicPanel,
  SoundFxPanel,
  PreviewPanel,
  MatrixBackground,
} from "@/components";
import { BriefPanel } from "@/components/BriefPanel";
import { Header } from "@/components/Header";
import { useMixerStore } from "@/store/mixerStore";
import { useVoiceManagerV2 } from "@/hooks/useVoiceManagerV2";
import { useFormManager } from "@/hooks/useFormManager";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { AudioService } from "@/services/audioService";
import { generateProjectId } from "@/utils/projectId";
import { hasRegionalAccents, getLanguageRegions } from "@/utils/language";
import { ErrorDetails } from "@/lib/providers/BaseAudioProvider";

export default function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // UI State
  const [selectedTab, setSelectedTab] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [projectNotFound, setProjectNotFound] = useState(false);
  const [projectName, setProjectName] = useState<string>("");
  const [, setIsInitializing] = useState(true);
  const [restoredVoices, setRestoredVoices] = useState<Voice[] | null>(null);

  // Brief Panel State
  const [clientDescription, setClientDescription] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [campaignFormat, setCampaignFormat] =
    useState<CampaignFormat>("dialog");
  const [adDuration, setAdDuration] = useState(25);
  const [selectedAiModel, setSelectedAiModel] = useState<AIModel>("gpt5");
  const [musicProvider, setMusicProvider] = useState<MusicProvider>("loudly");
  const [selectedCTA, setSelectedCTA] = useState<string | null>(null);
  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(null);

  // Custom hooks for complex logic
  // 🧪 DEMON HUNTING: THE MOMENT OF TRUTH - Re-enabling prime suspect!
  const voiceManager = useVoiceManagerV2(); // ⚡ STEP 3: Re-enabled - THE PRIME SUSPECT
  const formManager = useFormManager(); // ✅ STEP 1: Re-enabled - simpler hook

  // Zustand stores
  const { tracks } = useMixerStore(); // ✅ STEP 2a: Re-enabled - simple state access
  const { loadProjectFromRedis, updateProject, createProject } =
    useProjectHistoryStore(); // ✅ STEP 2b: Re-enabled - project functions

  // 🧪 DEMON DIAGNOSTIC: Component lifecycle tracking
  useEffect(() => {
    console.log("🏁 PROJECT PAGE MOUNTED");
    return () => console.log("💀 PROJECT PAGE UNMOUNTED");
  }, []);

  // Load project data on mount or start with new project
  // 🧪 DEMON HUNTING: Re-enabling project initialization useEffect - NEW PRIME SUSPECT!
  useEffect(() => {
    console.count("🔥 project:init"); // 🧪 DEMON DIAGNOSTIC
    let isCancelled = false;

    // Reset initialization flag when projectId changes
    setIsInitializing(true);

    const initializeProject = async () => {
      if (isCancelled) return;

      try {
        setIsLoading(true);

        // Try to load existing project
        const project = await loadProjectFromRedis(projectId);

        if (isCancelled) return;

        if (project) {
          // Existing project found - restore all state
          console.log("✅ Existing project loaded:", project.headline);
          setProjectName(project.headline);
          setProjectNotFound(false);

          // Restore all state from project
          setClientDescription(project.brief.clientDescription);
          setCreativeBrief(project.brief.creativeBrief);
          setCampaignFormat(project.brief.campaignFormat);
          setAdDuration(project.brief.adDuration);
          setSelectedAiModel(project.brief.selectedAiModel || "gpt4");
          setMusicProvider(project.brief.musicProvider || "loudly");
          setSelectedCTA(project.brief.selectedCTA || null);
          setSelectedPacing(project.brief.selectedPacing || null);

          // IMPORTANT: Restore voice manager state
          // Redis-powered voice system restoration
          console.log("🗡️ Redis voice system - restoring project state");

          // Step 1: Set language first (this triggers region loading)
          // CRITICAL: Normalize language code for V2 system (es-ES -> es)
          const normalizedLanguage = project.brief.selectedLanguage.split(
            "-"
          )[0] as Language;
          console.log(
            `🔥 Restoring language: ${project.brief.selectedLanguage} -> ${normalizedLanguage}`
          );
          voiceManager.setSelectedLanguage(normalizedLanguage);

          // Step 2: Set region if available, or default for legacy projects
          if (project.brief.selectedRegion) {
            console.log(`🔥 Restoring region: ${project.brief.selectedRegion}`);
            voiceManager.setSelectedRegion(project.brief.selectedRegion);
          } else {
            // For legacy projects without saved region, set a sensible default
            if (hasRegionalAccents(project.brief.selectedLanguage)) {
              const availableRegions = getLanguageRegions(
                project.brief.selectedLanguage
              );
              if (availableRegions.length > 0) {
                const defaultRegion = availableRegions[0].code; // Use first region as default
                console.log(
                  `🔄 Legacy project: Setting default region for ${project.brief.selectedLanguage}: ${defaultRegion}`
                );
                voiceManager.setSelectedRegion(defaultRegion);
              }
            }
          }

          // Step 3: Set accent - handle backwards compatibility
          const accentToRestore = project.brief.selectedAccent || "neutral";
          console.log(`🔥 Restoring accent: ${accentToRestore}`);
          voiceManager.setSelectedAccent(accentToRestore);

          // Step 4: Set provider
          console.log(
            `🔥 Restoring provider: ${project.brief.selectedProvider}`
          );
          voiceManager.setSelectedProvider(project.brief.selectedProvider);

          console.log("✅ Voice system state restored successfully!");

          // Step 5: Load ALL voices for restored criteria (skipped for now)

          // Step 6: Restore voice tracks (will be handled after voices are loaded)
          // Note: Voice track restoration is deferred until after restoration endpoint responds
          if (project.voiceTracks && project.voiceTracks.length > 0) {
            // Store tracks for later restoration - they'll be processed after restoredVoices is set
            console.log(
              "🎯 Voice tracks will be restored after voices are loaded:",
              project.voiceTracks.length
            );
            formManager.setVoiceTracks(project.voiceTracks);
          } else {
            console.log("📝 No voice tracks found, starting fresh");
            formManager.setVoiceTracks([{ voice: null, text: "" }]);
          }
          if (project.musicPrompt) {
            formManager.setMusicPrompt(project.musicPrompt);
          }
          if (project.musicPrompts) {
            console.log("🎵 Restoring provider-specific music prompts:", project.musicPrompts);
            formManager.setMusicPrompts(project.musicPrompts);
          }
          if (project.soundFxPrompt) {
            console.log("🔊 Restoring sound FX prompt:", project.soundFxPrompt);
            formManager.setSoundFxPrompt(project.soundFxPrompt);
          } else {
            console.log("🔇 No sound FX prompt to restore");
          }

          // Restore mixer state
          const { clearTracks, addTrack } = useMixerStore.getState();
          clearTracks();

          if (project.mixerState && project.mixerState.tracks) {
            console.log(
              "🎵 Restoring mixer tracks:",
              project.mixerState.tracks.length
            );

            for (const track of project.mixerState.tracks) {
              addTrack({
                ...track, // Restore all original track properties
              });
            }

            // Switch to mixer tab if we have tracks
            setSelectedTab(4);
          } else if (project.voiceTracks && project.voiceTracks.length > 0) {
            setSelectedTab(1); // Script tab
          } else {
            setSelectedTab(0); // Brief tab
          }
        } else {
          // No existing project - this is a NEW project (normal case!)
          console.log("📝 New project detected - no Redis data found");

          console.log("🆕 Fresh project: Using voice manager defaults");

          setProjectName("");
          setProjectNotFound(true); // This means "new project"
          setSelectedTab(0); // Start at brief tab
          setRestoredVoices(null); // Clear any previous restored voices
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("❌ Failed to initialize project:", error);
          // Fallback to new project on any error
          setProjectName("");
          setProjectNotFound(true);
          setSelectedTab(0);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          // Mark initialization as complete after a short delay to ensure all effects have run
          setTimeout(() => setIsInitializing(false), 100);
        }
      }
    };

    if (projectId) {
      initializeProject();
    }

    return () => {
      isCancelled = true;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Removed automatic reset on language/provider change - bad UX!
  // Users should keep their work when changing settings.
  // Only "Generate Creative" should reset the forms.

  // Switch to mixer tab when tracks are generated
  useEffect(() => {
    if (tracks.length > 0) {
      setSelectedTab(4);
    }
  }, [tracks.length]);

  // 🔥 Track pending debounced saves to prevent race conditions
  const pendingSaveRef = useRef<NodeJS.Timeout | null>(null);

  // Simple debounce utility
  const debounce = (func: (...args: unknown[]) => void, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: unknown[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Manual save project function
  // ✅ VICTORY: Re-enabling saveProject callback - demon defeated!
  const saveProject = useCallback(
    async (reason?: string, explicitLLMData?: LLMResponseData) => {
      if (isLoading || projectNotFound) return;

      console.log(
        `💾 Saving project: ${projectId} (${reason || "manual save"})`
      );

      // Get fresh tracks from store instead of using potentially stale closure
      const currentTracks = useMixerStore.getState().tracks;
      const currentCalculatedTracks = useMixerStore.getState().calculatedTracks;
      const currentTotalDuration = useMixerStore.getState().totalDuration;
      // Also get audio durations from store
      const currentAudioDurations = useMixerStore.getState().audioDurations;

      // Collect mixer state - preserve ALL track properties for accurate restoration
      const mixerState =
        currentTracks.length > 0
          ? {
              tracks: currentTracks.map((track) => ({
                ...track, // Preserve all original track properties
                // Use actual audio duration if available, otherwise keep original duration
                duration: currentAudioDurations[track.id] || track.duration,
                volume: track.volume,
                startTime: currentCalculatedTracks.find(
                  (ct) => ct.id === track.id
                )?.actualStartTime,
              })),
              totalDuration: currentTotalDuration,
            }
          : undefined;

      // Collect generated track URLs
      const generatedTracks = {
        voiceUrls: currentTracks
          .filter((t) => t.type === "voice")
          .map((t) => t.url),
        musicUrl: currentTracks.find((t) => t.type === "music")?.url,
        soundFxUrl: currentTracks.find((t) => t.type === "soundfx")?.url,
      };

      // Use explicit LLM data if provided (AUTO mode), otherwise use formManager state (manual mode)
      let dataToSave: LLMResponseData;
      if (explicitLLMData) {
        // LLM generation - use complete data including musicPrompts
        dataToSave = explicitLLMData;
      } else {
        // Auto-save from user edit - use formManager state
        dataToSave = {
          voiceTracks: formManager.voiceTracks,
          musicPrompt: formManager.musicPrompt,
          musicPrompts: formManager.musicPrompts, // Use provider-specific prompts from formManager
          soundFxPrompt: formManager.soundFxPrompt,
        };
      }

      // SAFEGUARD: Prevent saving empty voice tracks if we have mixer tracks with content
      // This prevents corruption where auto-save might clear valid voice tracks
      // Check the data we're actually saving (not just formManager state)
      const hasEmptyVoiceTracks =
        dataToSave.voiceTracks.length === 1 &&
        !dataToSave.voiceTracks[0].voice &&
        !dataToSave.voiceTracks[0].text;
      const hasMixerVoiceTracks = currentTracks.some(
        (t) => t.type === "voice" && t.metadata?.scriptText
      );

      if (hasEmptyVoiceTracks && hasMixerVoiceTracks && !explicitLLMData) {
        console.warn(
          "⚠️ BLOCKED: Attempted to save empty voice tracks while mixer has valid tracks. This would corrupt the project state."
        );
        console.log("Data being saved:", dataToSave.voiceTracks);
        console.log(
          "Mixer voice tracks:",
          currentTracks
            .filter((t) => t.type === "voice")
            .map((t) => ({
              id: t.id,
              scriptText: t.metadata?.scriptText?.slice(0, 30) + "...",
            }))
        );
        return; // Don't save in this corrupted state
      }

      // Debug: Log what we're saving
      console.log(
        "Voice tracks being saved:",
        dataToSave.voiceTracks.map((t) => ({
          hasVoice: !!t.voice,
          voiceId: t.voice?.id,
          voiceName: t.voice?.name,
          text: t.text?.slice(0, 30) + "...",
        }))
      );
      console.log("Sound FX prompt being saved:", dataToSave.soundFxPrompt);
      console.log("🔍 CRITICAL: musicPrompts being saved:", dataToSave.musicPrompts);

      const projectUpdate = {
        brief: {
          clientDescription,
          creativeBrief,
          campaignFormat,
          selectedLanguage: voiceManager.selectedLanguage,
          selectedProvider: voiceManager.selectedProvider,
          selectedRegion: voiceManager.selectedRegion,
          adDuration,
          selectedAccent: voiceManager.selectedAccent,
          selectedAiModel,
          musicProvider,
          selectedCTA,
          selectedPacing,
        },
        voiceTracks: dataToSave.voiceTracks,
        musicPrompt: dataToSave.musicPrompt,
        musicPrompts: dataToSave.musicPrompts ?? undefined, // Save provider-specific prompts, convert null to undefined
        soundFxPrompt: dataToSave.soundFxPrompt,
        generatedTracks: tracks.length > 0 ? generatedTracks : undefined,
        mixerState,
        lastModified: Date.now(),
      };

      try {
        await updateProject(projectId, projectUpdate);
        console.log("✅ Save successful");
      } catch (error) {
        console.error("❌ Save failed:", error);
      }
    },
    [
      isLoading,
      projectNotFound,
      projectId,
      formManager,
      adDuration,
      campaignFormat,
      clientDescription,
      creativeBrief,
      musicProvider,
      selectedAiModel,
      tracks.length,
      updateProject,
      voiceManager.selectedAccent,
      voiceManager.selectedLanguage,
      voiceManager.selectedProvider,
      voiceManager.selectedRegion,
    ]
  );

  // 🗡️ DEMON EXORCISM: Safe debounced mixer state watcher (no circular dependencies)
  useEffect(() => {
    // Watch mixer state changes and save with debounce
    // CRITICAL: No saveProject in dependencies to break circular chain
    const debouncedMixerSave = debounce(() => {
      if (!isLoading && !projectNotFound) {
        // Use current saveProject without creating dependency
        saveProject("mixer state changed");
      }
    }, 1000); // 1 second debounce

    // Only trigger saves when tracks actually change
    if (tracks.length > 0) {
      debouncedMixerSave();
    }

    // No cleanup needed - debounce handles its own timeout
  }, [tracks.length, tracks, isLoading, projectNotFound]); // No saveProject dependency!

  // Debounced save for text changes (500ms delay) with timeout tracking
  // 🗡️ DEMON EXORCISM: Safe debounced save without saveProject dependency
  const debouncedSave = useMemo(() => {
    return () => {
      // Clear any existing pending save
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }

      // Schedule new save and store timeout reference
      pendingSaveRef.current = setTimeout(() => {
        if (!isLoading && !projectNotFound) {
          saveProject("text changes");
        }
        pendingSaveRef.current = null; // Clear after execution
      }, 500);
    };
  }, [projectId, projectNotFound, isLoading]); // No saveProject dependency

  // Enhanced voice track update with immediate save for voice changes, debounced for text
  // 🗡️ DEMON EXORCISM: Restored with safe dependency management
  const handleVoiceTrackUpdate = useCallback(
    (index: number, updates: Partial<VoiceTrack>) => {
      formManager.updateVoiceTrack(index, updates);

      if ("voice" in updates) {
        // Voice selection changed - save immediately (no circular dependency risk)
        setTimeout(() => {
          if (!isLoading && !projectNotFound) {
            saveProject("voice selection changed");
          }
        }, 100);
      } else if ("text" in updates) {
        // Text changed - save with debounce
        debouncedSave();
      }
    },
    [formManager, debouncedSave, isLoading, projectNotFound] // No saveProject dependency
  );

  // Track music prompt changes for saving
  // 🗡️ DEMON EXORCISM: Restored with safe dependency management
  useEffect(() => {
    if (!isLoading && !projectNotFound && formManager.musicPrompt) {
      debouncedSave();
    }
  }, [formManager.musicPrompt, debouncedSave, isLoading, projectNotFound]);

  // Track sound FX prompt changes for saving
  useEffect(() => {
    if (!isLoading && !projectNotFound && formManager.soundFxPrompt) {
      debouncedSave();
    }
  }, [formManager.soundFxPrompt, debouncedSave, isLoading, projectNotFound]);

  // Event Handlers
  const handleNewProject = () => {
    // Clear all mixer state before navigating to new project
    const { clearTracks } = useMixerStore.getState();
    clearTracks(); // Clear all tracks

    // Reset form manager state
    formManager.resetAllForms();

    // Clear restored voices
    setRestoredVoices(null);

    console.log("🆕 New project: Using voice manager defaults");

    // Navigate to a new project
    const newProjectId = generateProjectId();
    router.push(`/project/${newProjectId}`);
  };

  const handleTabChange = (index: number) => {
    formManager.setStatusMessage("");
    setSelectedTab(index);
  };

  const handleGenerateCreative = async (
    segments: Array<{ voiceId: string; text: string }>,
    prompt: string,
    soundFxPrompts?: string | string[] | SoundFxPrompt[],
    resolvedVoices?: Voice[], // Voices actually used for generation
    musicPrompts?: MusicPrompts | null // Provider-specific music prompts from LLM
  ) => {
    const llmResponseData = await generateCreativeContent(
      segments,
      prompt,
      soundFxPrompts,
      resolvedVoices,
      musicPrompts
    ); // Pure generation function
    setSelectedTab(1); // Navigation
    await saveProject("after generate creative", llmResponseData); // Save with explicit data

    // NOW update formManager after save completes - this triggers MusicPanel reload
    // At this point, Redis has the correct musicPrompts, so loadMusicPrompts will work correctly
    formManager.setMusicPrompt(llmResponseData.musicPrompt);
  };

  // 🎯 PURE GENERATION FUNCTIONS - No navigation, clean separation
  const generateCreativeContent = async (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompts?: string | string[] | SoundFxPrompt[],
    resolvedVoices?: Voice[], // Voices actually used for generation
    musicPrompts?: MusicPrompts | null // Provider-specific music prompts from LLM
  ): Promise<LLMResponseData> => {
    console.log("🎯 generateCreativeContent called with:", {
      segments: segments.length,
      musicPrompt: !!musicPrompt,
      soundFxPrompts: !!soundFxPrompts,
      resolvedVoices: resolvedVoices?.length,
      musicPrompts: musicPrompts, // LOG THE ACTUAL PROVIDER-SPECIFIC PROMPTS
    });
    console.log("🎯 Segments details:", segments);
    console.log("🎯 Music prompt (singular):", musicPrompt);
    console.log("🎯 Music prompts (provider-specific):", musicPrompts);

    // Map voice segments to tracks FIRST
    // Use resolved voices if provided (from LLM generation), otherwise fall back to current voices
    const filteredVoices = resolvedVoices || voiceManager.currentVoices;
    const allVoices = resolvedVoices || voiceManager.currentVoices;
    console.log("🎯 Available voices:", filteredVoices.length, "(resolved:", !!resolvedVoices, ")");

    const newVoiceTracks = AudioService.mapVoiceSegmentsToTracks(
      segments,
      filteredVoices,
      allVoices
    );

    console.log("🎯 Generated voice tracks:", newVoiceTracks.length);
    console.log(
      "🎯 Voice tracks details:",
      newVoiceTracks.map((t) => ({
        hasVoice: !!t.voice,
        voiceId: t.voice?.id,
        voiceName: t.voice?.name,
        text: t.text?.slice(0, 50) + "...",
      }))
    );

    // Update state - clear mixer tracks from previous generations
    const { clearTracks } = useMixerStore.getState();
    clearTracks(); // Clear all existing mixer tracks

    formManager.resetVoiceTracks();
    formManager.setVoiceTracks(newVoiceTracks);
    // DON'T set musicPrompt here - it will be set after saveProject completes
    // This prevents race condition where MusicPanel reloads before Redis has new data

    // Handle sound FX prompts
    let processedSoundFxPrompt: SoundFxPrompt | null = null;
    if (soundFxPrompts) {
      console.log("🎵 Processing sound FX prompts from LLM:", soundFxPrompts);
      if (Array.isArray(soundFxPrompts) && soundFxPrompts.length > 0) {
        const firstPrompt = soundFxPrompts[0];
        if (typeof firstPrompt === "object" && "description" in firstPrompt) {
          processedSoundFxPrompt = firstPrompt as SoundFxPrompt;
          formManager.setSoundFxPrompt(processedSoundFxPrompt);
        } else if (typeof firstPrompt === "string") {
          processedSoundFxPrompt = {
            description: firstPrompt,
            duration: 5,
          };
          formManager.setSoundFxPrompt(processedSoundFxPrompt);
        }
      } else if (typeof soundFxPrompts === "string") {
        processedSoundFxPrompt = {
          description: soundFxPrompts,
          duration: 5,
        };
        formManager.setSoundFxPrompt(processedSoundFxPrompt);
      }
    }

    // Store provider-specific music prompts in formManager so they're available for auto-save
    if (musicPrompts) {
      console.log("🎵 Storing provider-specific music prompts in formManager");
      formManager.setMusicPrompts(musicPrompts);
    }

    // Track if project creation was successful
    let projectReady = !projectNotFound; // If project already exists, it's ready

    // Create project if needed
    if (projectNotFound) {
      const brief: ProjectBrief = {
        clientDescription,
        creativeBrief,
        campaignFormat,
        selectedLanguage: voiceManager.selectedLanguage,
        selectedProvider: voiceManager.selectedProvider,
        adDuration,
        selectedAccent: voiceManager.selectedAccent,
        selectedAiModel,
        musicProvider,
        selectedCTA,
        selectedPacing,
      };

      try {
        console.log(
          "📝 Creating new project with content already set:",
          projectId
        );
        await createProject(projectId, brief);

        // Load the newly created project to get the generated headline
        const newProject = await loadProjectFromRedis(projectId);
        if (newProject) {
          setProjectName(newProject.headline);
        }

        setProjectNotFound(false);
        projectReady = true; // Project creation successful
      } catch (error) {
        console.error("Failed to create project:", error);
        projectReady = false; // Project creation failed
      }
    }

    // Return the processed LLM data and project status for explicit saving
    console.log("🔍 ABOUT TO RETURN from generateCreativeContent:");
    console.log("  musicPrompts parameter value:", musicPrompts);
    console.log("  typeof musicPrompts:", typeof musicPrompts);
    console.log("  musicPrompts === null?:", musicPrompts === null);
    console.log("  musicPrompts === undefined?:", musicPrompts === undefined);
    console.log("  musicPrompts || null evaluates to:", musicPrompts || null);

    return {
      voiceTracks: newVoiceTracks,
      musicPrompt: musicPrompt,
      musicPrompts: musicPrompts || null, // Include provider-specific prompts (5th parameter)
      soundFxPrompt: processedSoundFxPrompt,
      projectReady, // Include whether project is ready for saving
    };
  };

  // 🔥 RESTORED: Simple resolveProvider for AUTO mode compatibility
  const resolveProvider = (mode: string): Provider => {
    if (mode === "AUTO") {
      // AUTO mode: use the provider selected in BriefPanel (server auto-selected)
      return voiceManager.selectedProvider as Provider;
    }
    // Manual mode: will read from Redis in handleGenerateVoices
    return voiceManager.selectedProvider as Provider;
  };

  const generateVoiceAudio = async (
    voiceTracks: VoiceTrack[],
    provider: Provider
  ) => {
    await AudioService.generateVoiceAudio(
      voiceTracks,
      provider,
      formManager.setStatusMessage,
      formManager.setIsGenerating,
      voiceManager.selectedRegion || undefined,
      voiceManager.selectedAccent || undefined
    );
  };

  const generateMusicAudio = async (musicPrompt: string, duration: number) => {
    await AudioService.generateMusic(
      musicPrompt,
      musicProvider,
      duration,
      formManager.setStatusMessage,
      formManager.setIsGeneratingMusic
    );
  };

  const generateSoundFxAudio = async (soundFxPrompt: SoundFxPrompt) => {
    await AudioService.generateSoundEffect(
      soundFxPrompt.description,
      soundFxPrompt.duration || 5,
      soundFxPrompt,
      formManager.setStatusMessage,
      formManager.setIsGeneratingSoundFx
    );
  };

  // 🎯 HANDLERS WITH NAVIGATION - Use pure functions + add navigation
  const handleGenerateVoices = async (
    provider?: Provider,
    voiceTracks?: VoiceTrack[]
  ) => {
    try {
      // 🔥 CRITICAL: Flush any pending debounced saves before voice generation
      // This prevents race condition where manual script edits are lost
      if (pendingSaveRef.current) {
        console.log("⏱️ Flushing pending save before voice generation");
        clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;

        // Execute the save immediately to persist manual edits
        if (!projectNotFound) {
          await saveProject("flush manual edits before voice generation");
        }
      }

      // Simple: use provided provider or fall back to voice manager state
      const providerToUse =
        provider || (voiceManager.selectedProvider as Provider);
      const tracksToUse = voiceTracks || formManager.voiceTracks;

      await generateVoiceAudio(tracksToUse, providerToUse);
      setSelectedTab(4); // Navigation

      // Save complete project state
      if (!projectNotFound) {
        await saveProject("after generate voices");
        console.log("✅ Project saved after voice generation");
      }
    } catch (error) {
      console.error(error);
      formManager.setStatusMessage(
        error instanceof Error ? error.message : "An error occurred"
      );
    }
  };

  const handleGenerateMusic = async (
    prompt: string,
    provider: "loudly" | "mubert" | "elevenlabs",
    duration: number
  ) => {
    try {
      // Update formManager with the new prompt so it gets saved to Redis
      formManager.setMusicPrompt(prompt);

      setMusicProvider(provider);
      await generateMusicAudio(prompt, duration);
      setSelectedTab(4); // Navigation

      // Save complete project state
      if (!projectNotFound) {
        await saveProject("after generate music");
        console.log("✅ Project saved after music generation");
      }
    } catch (error) {
      console.error("Failed to generate music:", error);

      // Extract detailed error messages (prompt suggestions, character limits, etc.)
      let errorMessage = `Failed to generate music: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;

      // Add helpful details if available
      const details = (error as { details?: ErrorDetails })?.details;
      if (details) {
        // ElevenLabs: prompt_suggestion nested under 'data'
        if (details.data?.prompt_suggestion) {
          errorMessage += `\n\nSuggested prompt: ${details.data.prompt_suggestion}`;
        }
        // Mubert: validation errors at top level
        else if (details.prompt && Array.isArray(details.prompt)) {
          errorMessage += `\n\n${details.prompt.join('\n')}`;
        }
        // Fallback: show any error message from details
        else if (details.message) {
          errorMessage += `\n\n${details.message}`;
        }
      }

      formManager.setStatusMessage(errorMessage);
    }
  };

  const handleGenerateSoundFx = async (
    prompt: string,
    duration: number,
    placement?: import("@/types").SoundFxPlacementIntent
  ) => {
    try {
      const soundFxPrompt = {
        description: prompt,
        duration,
        placement, // Store placement intent
      };

      // Store in formManager so saveProject() persists it to Redis
      formManager.setSoundFxPrompt(soundFxPrompt);

      await generateSoundFxAudio(soundFxPrompt);
      setSelectedTab(4); // Navigation

      // Save complete project state
      if (!projectNotFound) {
        await saveProject("after generate sound fx");
        console.log("✅ Project saved after sound fx generation");
      }
    } catch (error) {
      console.error("Failed to generate sound effect:", error);
      formManager.setStatusMessage(
        `Failed to generate sound effect: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  // 🚀 AUTO MODE: Sequential LLM → Parallel generation (DEPENDENCY CHAIN FIXED!)
  const handleGenerateCreativeAuto = async (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompts?: string | string[] | SoundFxPrompt[],
    resolvedVoices?: Voice[], // Voices actually used for generation
    musicPrompts?: MusicPrompts | null // Provider-specific music prompts from LLM
  ) => {
    console.log("🚀 AUTO MODE: Starting sequential→parallel generation");
    console.log("🔍 AUTO MODE received musicPrompts:", musicPrompts);

    try {
      // PHASE 1: Generate creative content and WAIT for LLM prompts
      console.log(
        "📝 Phase 1: Generating creative content and waiting for LLM prompts..."
      );
      const llmResponseData = await generateCreativeContent(
        segments,
        musicPrompt,
        soundFxPrompts,
        resolvedVoices,
        musicPrompts
      );

      console.log(
        `🔍 LLM generated: ${
          llmResponseData.voiceTracks.length
        } voice tracks, music: ${!!llmResponseData.musicPrompt}, soundfx: ${!!llmResponseData.soundFxPrompt}`
      );
      console.log("🔍 LLM Response musicPrompts:", llmResponseData.musicPrompts);

      // Save LLM data immediately if project is ready
      if (llmResponseData.projectReady) {
        await saveProject("AUTO: after generate creative", llmResponseData);
        console.log("✅ LLM data saved successfully");

        // NOW update formManager after save completes - this triggers MusicPanel reload
        // At this point, Redis has the correct musicPrompts, so loadMusicPrompts will work correctly
        formManager.setMusicPrompt(llmResponseData.musicPrompt);
      } else {
        console.warn(
          "⚠️ Skipping LLM data save - project creation failed or not ready"
        );
      }

      formManager.setStatusMessage(
        "🚀 AUTO MODE: Generating voice + music + sound effects..."
      );

      // Resolve provider for voice generation
      const providerToUse = resolveProvider("AUTO");

      const promises: Promise<void>[] = [
        handleGenerateVoices(providerToUse, llmResponseData.voiceTracks),
      ];

      if (llmResponseData.musicPrompt?.trim()) {
        promises.push(
          handleGenerateMusic(
            llmResponseData.musicPrompt,
            musicProvider,
            Math.max(30, adDuration + 5)
          )
        );
      }
      if (llmResponseData.soundFxPrompt) {
        promises.push(
          handleGenerateSoundFx(
            llmResponseData.soundFxPrompt.description,
            llmResponseData.soundFxPrompt.duration || 3
          )
        );
      }

      console.log(`🚀 Starting ${promises.length} parallel processes...`);

      // PHASE 4: Wait for all parallel processes to complete
      console.log("🎯 Before Promise.all - checking states:", {
        isGenerating: formManager.isGenerating,
        isGeneratingMusic: formManager.isGeneratingMusic,
        isGeneratingSoundFx: formManager.isGeneratingSoundFx,
      });

      await Promise.all(promises);

      console.log("🎯 After Promise.all - checking states:", {
        isGenerating: formManager.isGenerating,
        isGeneratingMusic: formManager.isGeneratingMusic,
        isGeneratingSoundFx: formManager.isGeneratingSoundFx,
      });

      formManager.setStatusMessage("🚀 AUTO MODE: Complete! Ready for mixing.");
      setSelectedTab(4);
    } catch (error) {
      console.error("🚀 AUTO MODE: Error during generation:", error);
      formManager.setStatusMessage(
        `AUTO MODE failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  // Handle track removal from timeline
  const handleRemoveTrack = async (trackId: string) => {
    const { tracks, removeTrack } = useMixerStore.getState();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // Remove from mixer store
    removeTrack(trackId);

    // Update Redis project
    try {
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject || !currentProject.generatedTracks) return;

      const updates: {
        lastModified: number;
        generatedTracks?: {
          voiceUrls: string[];
          musicUrl?: string | undefined;
          soundFxUrl?: string | undefined;
        };
        musicPrompt?: string;
        soundFxPrompt?: null;
      } = {
        lastModified: Date.now(),
      };

      if (track.type === 'voice') {
        // Remove from voiceUrls array
        const voiceUrls = (currentProject.generatedTracks.voiceUrls || [])
          .filter(url => url !== track.url);
        updates.generatedTracks = {
          ...currentProject.generatedTracks,
          voiceUrls,
        };
      } else if (track.type === 'music') {
        updates.generatedTracks = {
          ...currentProject.generatedTracks,
          musicUrl: undefined,
        };
        // Also clear music prompt
        updates.musicPrompt = '';
      } else if (track.type === 'soundfx') {
        updates.generatedTracks = {
          ...currentProject.generatedTracks,
          soundFxUrl: undefined,
        };
        // Also clear soundfx prompt
        updates.soundFxPrompt = null;
      }

      await updateProject(projectId, updates);
      console.log(`✅ Removed ${track.type} track from project`);
    } catch (error) {
      console.error('❌ Failed to update project after track removal:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-black text-white">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
          <p className="ml-4">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* 🗡️ DEMON EXORCISM: Restored original Header with proper props */}
      <Header
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        onNewProject={handleNewProject}
        projectId={projectId}
        isNewProject={projectNotFound}
        projectName={projectName}
      />

      <div className="flex flex-col flex-1 bg-black relative">
        {/* Dynamic Matrix Background */}
        <MatrixBackground
          isAnimating={
            formManager.isGeneratingCreative ||
            formManager.isGenerating ||
            formManager.isGeneratingMusic ||
            formManager.isGeneratingSoundFx
          }
        />

        {/* Tab panels */}
        <div className="flex-1 overflow-hidden container mx-auto relative z-10">
          {selectedTab === 0 && (
            <BriefPanel
              clientDescription={clientDescription}
              setClientDescription={setClientDescription}
              creativeBrief={creativeBrief}
              setCreativeBrief={setCreativeBrief}
              campaignFormat={campaignFormat}
              setCampaignFormat={setCampaignFormat}
              adDuration={adDuration}
              setAdDuration={setAdDuration}
              selectedAiModel={selectedAiModel}
              setSelectedAiModel={setSelectedAiModel}
              selectedCTA={selectedCTA}
              setSelectedCTA={setSelectedCTA}
              selectedPacing={selectedPacing}
              setSelectedPacing={setSelectedPacing}
              voiceManager={voiceManager}
              onGenerateCreative={handleGenerateCreative}
              onGenerateCreativeAuto={handleGenerateCreativeAuto}
              setIsGeneratingCreative={formManager.setIsGeneratingCreative}
            />
          )}

          {selectedTab === 1 && (
            <ScripterPanel
              voiceTracks={formManager.voiceTracks}
              updateVoiceTrack={handleVoiceTrackUpdate}
              addVoiceTrack={formManager.addVoiceTrack}
              removeVoiceTrack={formManager.removeVoiceTrack}
              generateAudio={handleGenerateVoices}
              isGenerating={formManager.isGenerating}
              statusMessage={formManager.statusMessage}
              selectedLanguage={voiceManager.selectedLanguage}
              selectedProvider={voiceManager.selectedProvider}
              selectedRegion={voiceManager.selectedRegion}
              selectedAccent={voiceManager.selectedAccent}
              campaignFormat={campaignFormat}
              hasRegions={voiceManager.hasRegions}
              resetForm={formManager.resetVoiceTracks}
              overrideVoices={restoredVoices}
            />
          )}

          {selectedTab === 2 && (
            <MusicPanel
              onGenerate={handleGenerateMusic}
              isGenerating={formManager.isGeneratingMusic}
              statusMessage={formManager.statusMessage}
              adDuration={adDuration}
              musicProvider={musicProvider}
              setMusicProvider={setMusicProvider}
              resetForm={formManager.resetMusicPrompt}
              onTrackSelected={() => setSelectedTab(4)}
            />
          )}

          {selectedTab === 3 && (
            <SoundFxPanel
              onGenerate={handleGenerateSoundFx}
              isGenerating={formManager.isGeneratingSoundFx}
              statusMessage={formManager.statusMessage}
              initialPrompt={formManager.soundFxPrompt}
              adDuration={adDuration}
              resetForm={formManager.resetSoundFxPrompt}
              voiceTrackCount={formManager.voiceTracks.length}
              voiceTrackPreviews={formManager.voiceTracks.map((track) => ({
                name: track.voice?.name || "Unknown Voice",
                text: track.text || "",
              }))}
            />
          )}

          {selectedTab === 4 && (
            <MixerPanel
              resetForm={formManager.resetAllForms}
              isGeneratingVoice={formManager.isGenerating}
              isGeneratingMusic={formManager.isGeneratingMusic}
              isGeneratingSoundFx={formManager.isGeneratingSoundFx}
              onChangeVoice={() => setSelectedTab(1)}
              onChangeMusic={() => setSelectedTab(2)}
              onChangeSoundFx={() => setSelectedTab(3)}
              onRemoveTrack={handleRemoveTrack}
            />
          )}

          {selectedTab === 5 && <PreviewPanel projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
