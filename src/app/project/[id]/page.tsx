"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { CampaignFormat, SoundFxPrompt, ProjectBrief, AIModel, MusicProvider, VoiceTrack, Language, Voice } from "@/types";
import {
  ScripterPanel,
  MixerPanel,
  MusicPanel,
  SoundFxPanel,
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
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>("dialog");
  const [adDuration, setAdDuration] = useState(20);
  const [selectedAiModel, setSelectedAiModel] = useState<AIModel>("gpt4");
  const [musicProvider, setMusicProvider] = useState<MusicProvider>("loudly");

  // Custom hooks for complex logic
  const voiceManager = useVoiceManagerV2(); // Redis-powered voice system
  const formManager = useFormManager();
  
  // Zustand stores
  const { tracks } = useMixerStore();
  const { 
    loadProjectFromRedis, 
    updateProject, 
    createProject 
  } = useProjectHistoryStore();

  // Load project data on mount or start with new project
  useEffect(() => {
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
          console.log('✅ Existing project loaded:', project.headline);
          setProjectName(project.headline);
          setProjectNotFound(false);
          
          // Restore all state from project
          setClientDescription(project.brief.clientDescription);
          setCreativeBrief(project.brief.creativeBrief);
          setCampaignFormat(project.brief.campaignFormat);
          setAdDuration(project.brief.adDuration);
          setSelectedAiModel(project.brief.selectedAiModel || "gpt4");
          setMusicProvider(project.brief.musicProvider || "loudly");
          
          // IMPORTANT: Restore voice manager state
          // Redis-powered voice system restoration
          console.log('🗡️ Redis voice system - restoring project state');
          
          // Step 1: Set language first (this triggers region loading)
          // CRITICAL: Normalize language code for V2 system (es-ES -> es)
          const normalizedLanguage = project.brief.selectedLanguage.split('-')[0] as Language;
          console.log(`🔥 Restoring language: ${project.brief.selectedLanguage} -> ${normalizedLanguage}`);
          voiceManager.setSelectedLanguage(normalizedLanguage);
          
          // Step 2: Set region if available, or default for legacy projects
          if (project.brief.selectedRegion) {
            console.log(`🔥 Restoring region: ${project.brief.selectedRegion}`);
            voiceManager.setSelectedRegion(project.brief.selectedRegion);
          } else {
            // For legacy projects without saved region, set a sensible default
            if (hasRegionalAccents(project.brief.selectedLanguage)) {
              const availableRegions = getLanguageRegions(project.brief.selectedLanguage);
              if (availableRegions.length > 0) {
                const defaultRegion = availableRegions[0].code; // Use first region as default
                console.log(`🔄 Legacy project: Setting default region for ${project.brief.selectedLanguage}: ${defaultRegion}`);
                voiceManager.setSelectedRegion(defaultRegion);
              }
            }
          }
          
          // Step 3: Set accent - handle backwards compatibility
          const accentToRestore = project.brief.selectedAccent || 'neutral';
          console.log(`🔥 Restoring accent: ${accentToRestore}`);
          voiceManager.setSelectedAccent(accentToRestore);
          
          // Step 4: Set provider
          console.log(`🔥 Restoring provider: ${project.brief.selectedProvider}`);
          voiceManager.setSelectedProvider(project.brief.selectedProvider);
          
          console.log('✅ Voice system state restored successfully!');
          
          // Step 5: CRITICAL - Bypass state management and load voices directly
          console.log('🔄 Loading voices directly with correct parameters');
          const targetLanguage = normalizedLanguage;
          const targetProvider = project.brief.selectedProvider;
          console.log(`🎯 Direct API call: provider=${targetProvider}, language=${targetLanguage}`);
          
          // Call API directly to avoid state conflicts
          const url = new URL('/api/voice-catalogue', window.location.origin);
          url.searchParams.set('operation', 'voices');
          url.searchParams.set('provider', targetProvider);
          url.searchParams.set('language', targetLanguage);
          
          const response = await fetch(url);
          const apiVoices = await response.json();
          
          console.log(`✅ Direct API loaded ${apiVoices.length} voices for ${targetProvider}/${targetLanguage}`);
          console.log(`🔍 First few voices:`, apiVoices.slice(0, 3).map((v: Record<string, unknown>) => ({ name: v.name, language: v.language })));
          
          // Map API voices to Voice format
          const mappedVoices: Voice[] = Array.isArray(apiVoices) ? apiVoices.map((v: Record<string, unknown>) => ({
            id: v.id as string,
            name: v.name as string,
            gender: (v.gender === 'male' || v.gender === 'female') ? v.gender as 'male' | 'female' : null,
            language: v.language as Language,
            accent: v.accent as string,
            description: (v.personality || v.description) as string,
            age: v.age as string,
            style: ((v.styles as string[])?.[0] || v.style) as string,
            use_case: (v.useCase || v.use_case) as string,
            sampleUrl: v.sampleUrl as string,
            provider: v.provider as string
          } as Voice)) : [];
          
          // 🎯 Set restored voices for ScripterPanel to use directly
          console.log('🎯 Setting restored voices for ScripterPanel:', mappedVoices.length);
          setRestoredVoices(mappedVoices);
          
          // Step 6: CRITICAL - Restore voice tracks with directly loaded voices
          if (project.voiceTracks && project.voiceTracks.length > 0) {
            console.log('🎯 Restoring voice tracks with directly loaded voices:', project.voiceTracks);
            console.log(`📋 Available voices for restoration: ${mappedVoices.length}`);
            
            if (mappedVoices.length === 0) {
              console.warn('⚠️ Direct API returned no voices! Using fallback.');
              // Fallback: Just restore text content without voices
              const fallbackTracks = project.voiceTracks.map(track => ({
                voice: null,
                text: track.text,
                style: track.style,
                useCase: track.useCase,
                voiceInstructions: track.voiceInstructions
              }));
              formManager.setVoiceTracks(fallbackTracks);
            } else {
              const mappedTracks = AudioService.mapVoiceSegmentsToTracks(
                project.voiceTracks.map(track => ({
                  voiceId: track.voice?.id || '',
                  text: track.text,
                  style: track.style,
                  useCase: track.useCase,
                  voiceInstructions: track.voiceInstructions
                })),
                mappedVoices,
                mappedVoices
              );
              
              formManager.setVoiceTracks(mappedTracks);
            }
          } else {
            console.log('📝 No voice tracks found, starting fresh');
            formManager.setVoiceTracks([{ voice: null, text: "" }]);
          }
          if (project.musicPrompt) {
            formManager.setMusicPrompt(project.musicPrompt);
          }
          if (project.soundFxPrompt) {
            console.log('🔊 Restoring sound FX prompt:', project.soundFxPrompt);
            formManager.setSoundFxPrompt(project.soundFxPrompt);
          } else {
            console.log('🔇 No sound FX prompt to restore');
          }
          
          // Restore mixer state
          const { clearTracks, addTrack } = useMixerStore.getState();
          clearTracks();
          
          if (project.mixerState && project.mixerState.tracks) {
            console.log('🎵 Restoring mixer tracks:', project.mixerState.tracks.length);
            
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
          setProjectName("");
          setProjectNotFound(true); // This means "new project"
          setSelectedTab(0); // Start at brief tab
          setRestoredVoices(null); // Clear any previous restored voices
        }
        
      } catch (error) {
        if (!isCancelled) {
          console.error('❌ Failed to initialize project:', error);
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
  }, [projectId, loadProjectFromRedis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Removed automatic reset on language/provider change - bad UX!
  // Users should keep their work when changing settings.
  // Only "Generate Creative" should reset the forms.

  // Switch to mixer tab when tracks are generated
  useEffect(() => {
    if (tracks.length > 0) {
      setSelectedTab(4);
    }
  }, [tracks.length]);

  // Simple debounce utility
  const debounce = (func: (...args: unknown[]) => void, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: unknown[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Manual save project function
  const saveProject = async (reason?: string) => {
    if (isLoading || projectNotFound) return;
    
    console.log(`💾 Saving project: ${projectId} (${reason || 'manual save'})`);
    
    // SAFEGUARD: Prevent saving empty voice tracks if we have mixer tracks with content
    // This prevents corruption where auto-save might clear valid voice tracks
    const hasEmptyVoiceTracks = formManager.voiceTracks.length === 1 && 
                                !formManager.voiceTracks[0].voice && 
                                !formManager.voiceTracks[0].text;
    const hasMixerVoiceTracks = tracks.some(t => t.type === 'voice' && t.metadata?.scriptText);
    
    if (hasEmptyVoiceTracks && hasMixerVoiceTracks) {
      console.warn('⚠️ BLOCKED: Attempted to save empty voice tracks while mixer has valid tracks. This would corrupt the project state.');
      console.log('Current voice tracks:', formManager.voiceTracks);
      console.log('Mixer voice tracks:', tracks.filter(t => t.type === 'voice').map(t => ({
        id: t.id,
        scriptText: t.metadata?.scriptText?.slice(0, 30) + '...'
      })));
      return; // Don't save in this corrupted state
    }
    
    // Debug: Log what we're saving
    console.log('Voice tracks being saved:', formManager.voiceTracks.map(t => ({ 
      hasVoice: !!t.voice, 
      voiceId: t.voice?.id, 
      voiceName: t.voice?.name,
      text: t.text?.slice(0, 30) + '...'
    })));
    console.log('Sound FX prompt being saved:', formManager.soundFxPrompt);
    
    // Get fresh tracks from store instead of using potentially stale closure
    const currentTracks = useMixerStore.getState().tracks;
    const currentCalculatedTracks = useMixerStore.getState().calculatedTracks;
    const currentTotalDuration = useMixerStore.getState().totalDuration;
    // Also get audio durations from store
    const currentAudioDurations = useMixerStore.getState().audioDurations;

    // Collect mixer state - preserve ALL track properties for accurate restoration
    const mixerState = currentTracks.length > 0 ? {
      tracks: currentTracks.map(track => ({
        ...track, // Preserve all original track properties
        // Use actual audio duration if available, otherwise keep original duration
        duration: currentAudioDurations[track.id] || track.duration,
        volume: track.volume,
        startTime: currentCalculatedTracks.find(ct => ct.id === track.id)?.actualStartTime
      })),
      totalDuration: currentTotalDuration
    } : undefined;

    // Collect generated track URLs
    const generatedTracks = {
      voiceUrls: currentTracks.filter(t => t.type === 'voice').map(t => t.url),
      musicUrl: currentTracks.find(t => t.type === 'music')?.url,
      soundFxUrl: currentTracks.find(t => t.type === 'soundfx')?.url,
    };

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
      },
      voiceTracks: formManager.voiceTracks,
      musicPrompt: formManager.musicPrompt,
      soundFxPrompt: formManager.soundFxPrompt,
      generatedTracks: tracks.length > 0 ? generatedTracks : undefined,
      mixerState,
      lastModified: Date.now()
    };

    try {
      await updateProject(projectId, projectUpdate);
      console.log('✅ Save successful');
    } catch (error) {
      console.error('❌ Save failed:', error);
    }
  };

  // Debounced save for text changes (500ms delay)
  const debouncedSave = useMemo(
    () => debounce(() => saveProject('text changes'), 500),
    [projectId, projectNotFound] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Enhanced voice track update with immediate save for voice changes, debounced for text
  const handleVoiceTrackUpdate = useCallback(
    (index: number, updates: Partial<VoiceTrack>) => {
      formManager.updateVoiceTrack(index, updates);
      
      if ('voice' in updates) {
        // Voice selection changed - save immediately
        setTimeout(() => saveProject('voice selection changed'), 100);
      } else if ('text' in updates) {
        // Text changed - save with debounce
        debouncedSave();
      }
    },
    [formManager, debouncedSave] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Track music prompt changes for saving
  useEffect(() => {
    if (!isLoading && !projectNotFound && formManager.musicPrompt) {
      debouncedSave();
    }
  }, [formManager.musicPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track sound FX prompt changes for saving
  useEffect(() => {
    if (!isLoading && !projectNotFound && formManager.soundFxPrompt) {
      debouncedSave();
    }
  }, [formManager.soundFxPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Event Handlers
  const handleNewProject = () => {
    // Clear all mixer state before navigating to new project
    const { clearTracks } = useMixerStore.getState();
    clearTracks(); // Clear all tracks
    
    // Reset form manager state
    formManager.resetAllForms();
    
    // Clear restored voices
    setRestoredVoices(null);
    
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
    soundFxPrompts?: string | string[] | SoundFxPrompt[]
  ) => {
    // Map voice segments to tracks FIRST
    const filteredVoices = voiceManager.currentVoices;
    const allVoices = voiceManager.currentVoices;
    const newVoiceTracks = AudioService.mapVoiceSegmentsToTracks(
      segments,
      filteredVoices,
      allVoices
    );


    // Update state - clear mixer tracks from previous generations
    const { clearTracks } = useMixerStore.getState();
    clearTracks(); // Clear all existing mixer tracks
    
    formManager.resetVoiceTracks();
    // Don't reset sound FX here - we'll set it below if the LLM provides one
    formManager.setVoiceTracks(newVoiceTracks);
    formManager.setMusicPrompt(prompt);
    
    // Debug: Log what we're setting in the form manager
    console.log('🎯 Setting voice tracks in form manager:', newVoiceTracks.map(t => ({ 
      hasVoice: !!t.voice, 
      voiceId: t.voice?.id, 
      voiceName: t.voice?.name,
      text: t.text?.slice(0, 30) + '...'
    })));
    
    // NOW create the project if it doesn't exist - AFTER we have the content!
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
      };

      try {
        console.log('📝 Creating new project with content already set:', projectId);
        await createProject(projectId, brief);
        
        // Load the newly created project to get the generated headline
        const newProject = await loadProjectFromRedis(projectId);
        if (newProject) {
          setProjectName(newProject.headline);
          console.log('✅ Updated project name to:', newProject.headline);
        }
        
        setProjectNotFound(false);
      } catch (error) {
        console.error('Failed to create project:', error);
        // Continue anyway since the content is already set in the UI
      }
    }

    // Handle sound FX prompts
    if (soundFxPrompts) {
      console.log('🎵 Processing sound FX prompts from LLM:', soundFxPrompts);
      if (Array.isArray(soundFxPrompts) && soundFxPrompts.length > 0) {
        const firstPrompt = soundFxPrompts[0];
        if (typeof firstPrompt === "object" && "description" in firstPrompt) {
          console.log('🔊 Setting sound FX prompt (object):', firstPrompt);
          formManager.setSoundFxPrompt(firstPrompt as SoundFxPrompt);
        } else if (typeof firstPrompt === "string") {
          console.log('🔊 Setting sound FX prompt (string):', firstPrompt);
          formManager.setSoundFxPrompt({
            description: firstPrompt,
            duration: 5,
          });
        }
      } else if (typeof soundFxPrompts === "string") {
        console.log('🔊 Setting sound FX prompt (direct string):', soundFxPrompts);
        formManager.setSoundFxPrompt({
          description: soundFxPrompts,
          duration: 5,
        });
      }
    } else {
      console.log('🔇 No sound FX prompts from LLM');
    }

    setSelectedTab(1); // Switch to scripter
    
    // Save project after creative generation completes
    await saveProject('after generate creative');
  };

  const handleGenerateVoices = async () => {
    try {
      const selectedProvider = voiceManager.selectedProvider;
        
      await AudioService.generateVoiceAudio(
        formManager.voiceTracks,
        selectedProvider,
        formManager.setStatusMessage,
        formManager.setIsGenerating
      );

      setSelectedTab(4); // Switch to mixer
      
      // Save project after voice generation completes
      await saveProject('after voice generation');
    } catch (error) {
      console.error(error);
      formManager.setStatusMessage(
        error instanceof Error ? error.message : "An error occurred"
      );
    }
  };

  const handleGenerateMusic = async (
    prompt: string,
    provider: "loudly" | "mubert",
    duration: number
  ) => {
    try {
      await AudioService.generateMusic(
        prompt,
        provider,
        duration,
        formManager.setStatusMessage,
        formManager.setIsGeneratingMusic
      );

      setSelectedTab(4); // Switch to mixer
      
      // Save project after music generation completes
      await saveProject('after music generation');
    } catch (error) {
      console.error("Failed to generate music:", error);
      formManager.setStatusMessage(
        `Failed to generate music: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const handleGenerateSoundFx = async (prompt: string, duration: number) => {
    try {
      await AudioService.generateSoundEffect(
        prompt,
        duration,
        formManager.soundFxPrompt,
        formManager.setStatusMessage,
        formManager.setIsGeneratingSoundFx
      );

      setSelectedTab(4); // Switch to mixer
      
      // Save project after sound effect generation completes
      await saveProject('after sound effect generation');
    } catch (error) {
      console.error("Failed to generate sound effect:", error);
      formManager.setStatusMessage(
        `Failed to generate sound effect: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
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
    <div className="flex flex-col h-screen bg-white text-black">
      <Header
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        onNewProject={handleNewProject}
        projectId={projectId}
        isNewProject={projectNotFound}
        projectName={projectName}
      />

      <div className="flex flex-col flex-1 bg-black relative">
        {/* Background image */}
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            backgroundImage: "url(/bg-pixels.svg)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "left top",
            backgroundSize: "auto 100%",
            width: "100%",
            height: "100%",
            zIndex: 0,
          }}
        ></div>

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
              voiceManager={voiceManager}
              onGenerateCreative={handleGenerateCreative}
            />
          )}

          {selectedTab === 1 && (
            <ScripterPanel
              voiceTracks={formManager.voiceTracks}
              updateVoiceTrack={handleVoiceTrackUpdate}
              addVoiceTrack={formManager.addVoiceTrack}
              generateAudio={handleGenerateVoices}
              isGenerating={formManager.isGenerating}
              statusMessage={formManager.statusMessage}
              selectedLanguage={voiceManager.selectedLanguage}
              getFilteredVoices={voiceManager.getFilteredVoices}
              isVoicesLoading={voiceManager.isLoading}
              resetForm={formManager.resetVoiceTracks}
              overrideVoices={restoredVoices}
            />
          )}

          {selectedTab === 2 && (
            <MusicPanel
              onGenerate={handleGenerateMusic}
              isGenerating={formManager.isGeneratingMusic}
              statusMessage={formManager.statusMessage}
              initialPrompt={formManager.musicPrompt}
              adDuration={adDuration}
              musicProvider={musicProvider}
              setMusicProvider={setMusicProvider}
              resetForm={formManager.resetMusicPrompt}
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
            />
          )}

          {selectedTab === 4 && (
            <MixerPanel
              resetForm={formManager.resetAllForms}
              isGeneratingVoice={formManager.isGenerating}
              isGeneratingMusic={formManager.isGeneratingMusic}
              isGeneratingSoundFx={formManager.isGeneratingSoundFx}
            />
          )}
        </div>
      </div>
    </div>
  );
}