import React, { useState, useEffect, useMemo, useRef } from "react";
import { MusicProvider, LibraryMusicTrack } from "@/types";
import {
  GlassyTextarea,
  GlassyOptionPicker,
  GlassySlider,
  GlassyInput,
  ResetButton,
  GenerateButton,
  GlassTabBar,
  GlassTab,
} from "./ui";
import { FileUpload, useFileUpload } from "./ui/FileUpload";
import { useMixerStore } from "@/store/mixerStore";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { useParams } from "next/navigation";

type MusicMode = 'generate' | 'upload' | 'library';

type MusicPanelProps = {
  onGenerate: (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: string;
  adDuration: number;
  musicProvider: MusicProvider;
  setMusicProvider: (provider: MusicProvider) => void;
  resetForm: () => void;
  onTrackSelected?: () => void; // Optional callback after track selection/upload
};

export function MusicPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  initialPrompt = "",
  adDuration,
  musicProvider,
  setMusicProvider,
  resetForm,
  onTrackSelected,
}: MusicPanelProps) {
  const params = useParams();
  const projectId = params.id as string;
  const { addTrack, clearTracks } = useMixerStore();
  const { updateProject, loadProjectFromRedis } = useProjectHistoryStore();
  
  // File upload hook
  const {
    uploadedFiles,
    isUploading,
    errors,
    handleUploadComplete,
    handleUploadError,
  } = useFileUpload();
  
  const [mode, setMode] = useState<MusicMode>('generate');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [duration, setDuration] = useState(Math.max(30, adDuration + 5));
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");

  // Library state
  const [libraryTracks, setLibraryTracks] = useState<LibraryMusicTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Update prompt when initialPrompt changes
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Update duration when adDuration changes - add 5 seconds for smoother fade, minimum 30s
  useEffect(() => {
    setDuration(Math.max(30, adDuration + 5));
  }, [adDuration]);

  // Update local status message when parent status message changes
  // Update during generation OR when there's an error message to show
  useEffect(() => {
    if (isGenerating || parentStatusMessage) {
      setLocalStatusMessage(parentStatusMessage || "");
    }
  }, [isGenerating, parentStatusMessage]);

  // Reset status message when component mounts
  useEffect(() => {
    setLocalStatusMessage("");
  }, []);

  // Load library tracks when switching to library mode
  // Cleanup audio when leaving library mode
  useEffect(() => {
    if (mode === 'library') {
      loadLibraryTracks();
    } else {
      // Stop audio when leaving library mode
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingTrackId(null);
    }
  }, [mode]);

  // Cleanup audio on component unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Load library tracks from API
  const loadLibraryTracks = async () => {
    setIsLoadingLibrary(true);
    try {
      const sessionId = 'universal-session'; // Match the session ID pattern used in the app
      const response = await fetch(`/api/music-library?sessionId=${encodeURIComponent(sessionId)}`);

      if (!response.ok) {
        throw new Error('Failed to load music library');
      }

      const data = await response.json();
      setLibraryTracks(data.tracks || []);
      console.log(`✅ Loaded ${data.tracks?.length || 0} tracks from library`);
    } catch (error) {
      console.error('❌ Failed to load music library:', error);
      setLibraryTracks([]);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  // Filter library tracks based on search query
  const filteredLibraryTracks = useMemo(() => {
    if (!searchQuery.trim()) return libraryTracks;

    const query = searchQuery.toLowerCase();
    return libraryTracks.filter(track =>
      track.projectTitle.toLowerCase().includes(query) ||
      track.musicPrompt.toLowerCase().includes(query) ||
      track.musicProvider.toLowerCase().includes(query)
    );
  }, [libraryTracks, searchQuery]);

  // Handle play/pause for library track previews
  const handlePlayPause = (track: LibraryMusicTrack) => {
    const trackId = `${track.projectId}-${track.createdAt}`;

    // If this track is already playing, pause it
    if (playingTrackId === trackId && audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
      return;
    }

    // Stop any currently playing track
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Start playing new track
    const audio = new Audio(track.musicUrl);
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    // Clear state when track ends
    audio.onended = () => {
      setPlayingTrackId(null);
      audioRef.current = null;
    };

    // Clear state on error
    audio.onerror = () => {
      setPlayingTrackId(null);
      audioRef.current = null;
      console.error('Failed to play audio:', track.musicUrl);
    };

    audio.play().catch(error => {
      console.error('Error playing audio:', error);
      setPlayingTrackId(null);
      audioRef.current = null;
    });
  };

  // Handle music upload completion
  const handleMusicUpload = async (result: { url: string; filename: string }) => {
    handleUploadComplete("music")(result);
    
    if (!projectId) {
      console.error('No project ID for music upload');
      return;
    }
    
    try {
      // Load current project to preserve existing data
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject) {
        console.error('Project not found for music upload');
        return;
      }
      
      // Update project with uploaded music URL (same place as generated music)
      await updateProject(projectId, {
        generatedTracks: {
          voiceUrls: currentProject.generatedTracks?.voiceUrls || [],
          soundFxUrl: currentProject.generatedTracks?.soundFxUrl,
          musicUrl: result.url,
        },
        lastModified: Date.now(),
      });

      // Clear existing music tracks from mixer (like generation does)
      clearTracks("music");

      // Add track to mixer store (same as generated music)
      addTrack({
        id: `custom-music-${Date.now()}`,
        url: result.url,
        label: "Custom Music Track",
        type: "music",
        metadata: {
          originalDuration: duration, // Use the selected duration
        },
      });

      console.log('✅ Custom music track uploaded and added to mixer');

      // Switch to mixer tab to show the result
      onTrackSelected?.();
    } catch (error) {
      console.error('❌ Failed to process music upload:', error);
    }
  };

  // Handle library track selection
  const handleLibraryTrackSelect = async (track: LibraryMusicTrack) => {
    if (!projectId) {
      console.error('No project ID for library selection');
      return;
    }

    try {
      // Load current project to preserve existing data
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject) {
        console.error('Project not found for library selection');
        return;
      }

      // Update project with selected music URL and prompt
      await updateProject(projectId, {
        generatedTracks: {
          voiceUrls: currentProject.generatedTracks?.voiceUrls || [],
          soundFxUrl: currentProject.generatedTracks?.soundFxUrl,
          musicUrl: track.musicUrl,
        },
        musicPrompt: track.musicPrompt, // Also save the prompt from the library track
        lastModified: Date.now(),
      });

      // Clear existing music tracks from mixer (like generation does)
      clearTracks("music");

      // Add track to mixer store
      addTrack({
        id: `library-music-${Date.now()}`,
        url: track.musicUrl,
        label: `Music from "${track.projectTitle}"`,
        type: "music",
        metadata: {
          originalDuration: track.duration,
          source: 'library',
          sourceProjectId: track.projectId,
        },
      });

      console.log(`✅ Library music track from "${track.projectTitle}" added to mixer`);

      // Switch to mixer tab to show the result
      onTrackSelected?.();
    } catch (error) {
      console.error('❌ Failed to select library track:', error);
    }
  };

  // Handle local reset
  const handleReset = () => {
    setMode('generate');
    setPrompt("");
    setMusicProvider("loudly");
    setDuration(Math.max(30, adDuration + 5));
    setLocalStatusMessage("");
    resetForm();
  };

  const handleGenerate = () => {
    // For Loudly, we need to round to the nearest 15 seconds
    if (musicProvider === "loudly") {
      const roundedDuration = Math.round(duration / 15) * 15;
      onGenerate(prompt, musicProvider, roundedDuration);
    } else {
      // For Mubert and ElevenLabs, we pass the exact duration
      onGenerate(prompt, musicProvider, duration);
    }
  };

  const providerOptions = [
    {
      value: "loudly" as MusicProvider,
      label: "Loudly",
      description:
        "High-quality, customizable music (duration in 15s increments)",
    },
    {
      value: "mubert" as MusicProvider,
      label: "Mubert",
      description: "Real-time AI music for ads (fast generation)",
    },
    {
      value: "elevenlabs" as MusicProvider,
      label: "ElevenLabs",
      description: "AI-composed music with advanced synthesis",
    },
  ];

  return (
    <div className="py-8 text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Soundtrack Your Story</h1>
          <h2 className="font-medium mb-12">
            {mode === 'generate'
              ? "Choose the mood. We'll generate the perfect track for your audio ad."
              : mode === 'upload'
              ? "Upload your own music track to use as the soundtrack."
              : "Browse and reuse music from your previous projects."
            }
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          {mode === 'generate' && (
            <GenerateButton
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              isGenerating={isGenerating}
              text="Generate Music"
              generatingText="Generating..."
            />
          )}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex justify-center mb-8">
        <GlassTabBar>
          <GlassTab 
            isActive={mode === 'generate'} 
            onClick={() => setMode('generate')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 1L8.5 4.5L12 2L9.5 5.5L14 4L10.5 7.5L15 8L11.5 8.5L14 12L10.5 9.5L12 14L8.5 10.5L8 15L7.5 11.5L4 14L6.5 10.5L2 12L5.5 8.5L1 8L4.5 7.5L2 4L5.5 6.5L4 2L7.5 5.5L8 1Z"
                fill={mode === 'generate' ? "#2F7DFA" : "#FFFFFF"}
              />
            </svg>
          </GlassTab>
          <GlassTab
            isActive={mode === 'upload'}
            onClick={() => setMode('upload')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 10V2M8 2L5.5 4.5M8 2L10.5 4.5"
                stroke={mode === 'upload' ? "#2F7DFA" : "#FFFFFF"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12V13C2 13.5304 2.21071 14.0391 2.58579 14.4142C2.96086 14.7893 3.46957 15 4 15H12C12.5304 15 13.0391 14.7893 13.4142 14.4142C13.7893 14.0391 14 13.5304 14 13V12"
                stroke={mode === 'upload' ? "#2F7DFA" : "#FFFFFF"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </GlassTab>
          <GlassTab
            isActive={mode === 'library'}
            onClick={() => setMode('library')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2 2h4v12H2V2zm6 0h2v12H8V2zm4 0h2v12h-2V2z"
                fill={mode === 'library' ? "#2F7DFA" : "#FFFFFF"}
              />
            </svg>
          </GlassTab>
        </GlassTabBar>
      </div>

      {mode === 'generate' ? (
        <>
          <div className="space-y-12 md:grid md:grid-cols-2 md:gap-6">
            <div>
              <GlassyTextarea
                label="Music Description"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
                className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                minRows={3}
              />

              {/* Timing instructions for music */}
              <div className="mt-3 pl-4 text-xs text-gray-500 p-2 ">
                <span className="font-medium ">Timing: </span>
                <span>
                  Background music typically plays from the beginning of the ad
                </span>
                <div className="mt-1">
                  <span className="text-sky-300 ">Pro tip: </span>
                  Music will be automatically mixed with voice tracks at reduced
                  volume. For best results, choose music that complements the
                  emotion of your script.
                </div>
              </div>
            </div>
            <div className="space-y-12">
              <GlassyOptionPicker
                label="AI Music Provider"
                value={musicProvider}
                onChange={setMusicProvider}
                options={providerOptions}
              />

              <GlassySlider
                label="Duration"
                value={duration}
                onChange={setDuration}
                min={30}
                max={90}
                step={musicProvider === "loudly" ? 15 : 5}
                formatLabel={(val) =>
                  `${val} seconds${
                    musicProvider === "loudly" && val % 15 !== 0
                      ? " (will be rounded to nearest 15s)"
                      : ""
                  }${val === Math.max(30, adDuration + 5) ? " (recommended)" : ""}`
                }
                tickMarks={[
                  { value: 30, label: "30s" },
                  { value: 45, label: "45s" },
                  { value: 60, label: "60s" },
                  { value: 75, label: "75s" },
                  { value: 90, label: "90s" },
                ]}
              />
            </div>
          </div>

          {localStatusMessage && (
            <div className="mt-6 text-left text-sm text-gray-300 whitespace-pre-line">
              {localStatusMessage}
            </div>
          )}
        </>
      ) : mode === 'upload' ? (
        /* Upload Mode */
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <FileUpload
              fileType="custom-music"
              projectId={projectId}
              onUploadComplete={handleMusicUpload}
              onUploadError={handleUploadError("music")}
              disabled={isUploading.music}
              className="w-full px-8 py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            >
              <div className="text-center">
                <svg width="48" height="48" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4 opacity-70">
                  <path
                    d="M8 10V2M8 2L5.5 4.5M8 2L10.5 4.5"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 12V13C2 13.5304 2.21071 14.0391 2.58579 14.4142C2.96086 14.7893 3.46957 15 4 15H12C12.5304 15 13.0391 14.7893 13.4142 14.4142C13.7893 14.0391 14 13.5304 14 13V12"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <h3 className="text-lg font-semibold mb-2">
                  {isUploading.music ? "Uploading..." : "Upload Music Track"}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Drag & drop your music file here, or click to browse
                </p>
                <p className="text-xs text-gray-500">
                  Supported: MP3, WAV, M4A • Max size: 50MB
                </p>
              </div>
            </FileUpload>

            {errors.music && (
              <p className="text-red-400 text-sm mt-4">{errors.music}</p>
            )}

            {uploadedFiles.music && (
              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-green-400 font-medium">✅ Upload Complete</p>
                <p className="text-gray-400 text-sm mt-1">
                  {uploadedFiles.music.filename}
                </p>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-gray-400 mt-8">
            <p>Your custom music will be automatically added to the mixer and subject to the same timing calculations as generated tracks.</p>
          </div>
        </div>
      ) : (
        /* Library Mode */
        <div className="max-w-4xl mx-auto">
          {/* Search Bar */}
          <div className="mb-6">
            <GlassyInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by project title, prompt, or provider..."
              className="w-full"
            />
          </div>

          {/* Library List */}
          {isLoadingLibrary ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
              <p className="text-gray-400">Loading library...</p>
            </div>
          ) : filteredLibraryTracks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {searchQuery ? (
                <>
                  <p className="mb-2">No tracks match your search</p>
                  <p className="text-sm">Try a different search term</p>
                </>
              ) : (
                <>
                  <p className="mb-2">No music tracks in library yet</p>
                  <p className="text-sm">Generate or upload some music to build your library</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLibraryTracks.map((track) => {
                const trackId = `${track.projectId}-${track.createdAt}`;
                const isPlaying = playingTrackId === trackId;

                return (
                  <div
                    key={trackId}
                    className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:bg-white/10 transition-colors"
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                      <div>
                        <h3 className="font-semibold text-white mb-1">{track.projectTitle}</h3>
                        <p className="text-sm text-gray-400 mb-2 line-clamp-2">{track.musicPrompt}</p>
                        <p className="text-xs text-gray-500">
                          Provider: {track.musicProvider} • {new Date(track.createdAt).toLocaleDateString()}
                          {track.duration && ` • ${Math.round(track.duration)}s`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => handlePlayPause(track)}
                          className="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white"
                          title={isPlaying ? "Pause" : "Preview track"}
                        >
                          {isPlaying ? '⏸' : '▶'}
                        </button>

                        {/* Select Button */}
                        <button
                          onClick={() => handleLibraryTrackSelect(track)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
