import React, { useState, useEffect, useMemo, useRef } from "react";
import { MusicProvider, LibraryMusicTrack, MusicPrompts } from "@/types";
import { migrateMusicPrompt } from "@/utils/music-prompt-validator";
import {
  GlassyTextarea,
  GlassyOptionPicker,
  GlassySlider,
  GlassyInput,
  ResetButton,
  GenerateButton,
  GlassTabBar,
  GlassTab,
  Tooltip,
  GenerateIcon,
  UploadIcon,
  LibraryIcon,
  LoadingSpinner,
} from "./ui";
import { FileUpload, useFileUpload } from "./ui/FileUpload";
import { useParams } from "next/navigation";

type MusicMode = 'generate' | 'upload' | 'library';

const PROVIDER_OPTIONS: Array<{
  value: MusicProvider;
  label: string;
  description: string;
}> = [
  {
    value: "loudly",
    label: "Loudly",
    description: "High-quality, customizable music (duration in 15s increments)",
  },
  {
    value: "mubert",
    label: "Mubert",
    description: "Real-time AI music for ads (fast generation)",
  },
  {
    value: "elevenlabs",
    label: "ElevenLabs",
    description: "AI-composed music with advanced synthesis",
  },
];

const DURATION_TICK_MARKS = [
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
  { value: 60, label: "60s" },
  { value: 75, label: "75s" },
  { value: 90, label: "90s" },
  { value: 105, label: "105s" },
  { value: 120, label: "120s" },
];

type MusicPanelProps = {
  onGenerate: (
    prompt: string,
    provider: MusicProvider,
    duration: number
  ) => Promise<string | null | void>;
  isGenerating: boolean;
  statusMessage?: string;
  adDuration: number;
  musicProvider: MusicProvider;
  setMusicProvider: (provider: MusicProvider) => void;
  resetForm: () => void;
  onTrackSelected?: (url: string, filename?: string, duration?: number) => void; // Optional callback with URL after track selection/upload
  initialPrompts?: MusicPrompts; // Initial prompts from draft version
  initialProvider?: MusicProvider; // Provider from draft version (to detect custom uploads)
  hasGeneratedUrl?: boolean; // Whether draft already has a generated URL
  existingFilename?: string; // For custom uploads: shows which file is loaded (from musicPrompt)
};

export function MusicPanel({
  onGenerate,
  isGenerating,
  statusMessage: parentStatusMessage,
  adDuration,
  musicProvider,
  setMusicProvider,
  resetForm,
  onTrackSelected,
  initialPrompts,
  initialProvider,
  hasGeneratedUrl,
  existingFilename,
}: MusicPanelProps) {
  const params = useParams();
  const projectId = params.id as string;
  
  // File upload hook
  const {
    uploadedFiles,
    isUploading,
    uploadingFilename,
    errors,
    handleUploadComplete,
    handleUploadError,
    startUpload,
  } = useFileUpload();
  
  const [mode, setMode] = useState<MusicMode>('generate');
  const [duration, setDuration] = useState(Math.max(30, adDuration + 15));
  const [localStatusMessage, setLocalStatusMessage] = useState<string>("");

  // Provider-specific prompts - one state per provider
  // Initialize from draft version if available
  const [providerPrompts, setProviderPrompts] = useState<MusicPrompts>(
    initialPrompts || { loudly: "", mubert: "", elevenlabs: "" }
  );

  // Library state
  const [libraryTracks, setLibraryTracks] = useState<LibraryMusicTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Note: Music prompts are now managed through the V3 version stream system
  // The draft version already contains all necessary data

  // Initialize mode based on whether this is a custom upload with audio
  useEffect(() => {
    if (initialProvider === "custom" && hasGeneratedUrl) {
      setMode('upload');
    }
  }, [initialProvider, hasGeneratedUrl]);

  // Update duration when adDuration changes - add 15 seconds for LLM overruns and fade, minimum 30s
  useEffect(() => {
    setDuration(Math.max(30, adDuration + 15));
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

  // Handle music upload completion - passes URL to parent for Redis persistence
  const handleMusicUpload = async (result: { url: string; filename: string; duration?: number }) => {
    handleUploadComplete("music")(result);
    console.log('✅ Custom music track uploaded:', result.filename, 'duration:', result.duration);

    // Pass URL, filename, and duration to parent for V3 version creation
    onTrackSelected?.(result.url, result.filename, result.duration ?? undefined);
  };

  // Handle library track selection - passes URL to parent for Redis persistence
  const handleLibraryTrackSelect = async (track: LibraryMusicTrack) => {
    console.log(`✅ Library music track from "${track.projectTitle}" selected`);

    // Pass URL, filename (project title), and duration to parent for V3 version creation
    onTrackSelected?.(track.musicUrl, `${track.projectTitle} (library)`, track.duration ?? undefined);
  };

  // Handle local reset
  const handleReset = () => {
    setMode('generate');
    setMusicProvider("elevenlabs");
    setDuration(Math.max(30, adDuration + 15));
    setLocalStatusMessage("");
    setProviderPrompts({
      loudly: "",
      mubert: "",
      elevenlabs: "",
    });
    resetForm();
  };

  const handleGenerate = () => {
    const prompt = providerPrompts[musicProvider] || "";

    // For Loudly, we need to round to the nearest 15 seconds
    if (musicProvider === "loudly") {
      const roundedDuration = Math.round(duration / 15) * 15;
      onGenerate(prompt, musicProvider, roundedDuration);
    } else {
      // For Mubert and ElevenLabs, we pass the exact duration
      onGenerate(prompt, musicProvider, duration);
    }
  };

  // Only show mode tabs for custom provider OR drafts without generated audio yet
  // LLM-generated drafts with audio shouldn't show upload/library tabs (confusing UX)
  const showModeTabs = initialProvider === "custom" || !hasGeneratedUrl;

  return (
    <div className="py-8 text-white">
      {/* Mode Toggle - only show for custom uploads or drafts without audio */}
      {showModeTabs && (
        <div className="flex justify-center mb-8">
          <GlassTabBar>
            <Tooltip content="Generate AI music" side="bottom">
              <GlassTab
                isActive={mode === 'generate'}
                onClick={() => setMode('generate')}
              >
                <GenerateIcon isActive={mode === 'generate'} />
              </GlassTab>
            </Tooltip>
            <Tooltip content="Upload custom music" side="bottom">
              <GlassTab
                isActive={mode === 'upload'}
                onClick={() => setMode('upload')}
              >
                <UploadIcon isActive={mode === 'upload'} />
              </GlassTab>
            </Tooltip>
            <Tooltip content="Browse music library" side="bottom">
              <GlassTab
                isActive={mode === 'library'}
                onClick={() => setMode('library')}
              >
                <LibraryIcon isActive={mode === 'library'} />
              </GlassTab>
            </Tooltip>
          </GlassTabBar>
        </div>
      )}

      {mode === 'generate' ? (
        <>
          <div className="space-y-12 md:grid md:grid-cols-2 md:gap-6">
            <div>
              {/* Single static label for all textareas */}
              <label className="block mb-2 text-white">Music Prompt</label>

              {/* Loudly textarea */}
              <div style={{ display: musicProvider === 'loudly' ? 'block' : 'none' }}>
                <GlassyTextarea
                  value={providerPrompts.loudly}
                  onChange={(e) => {
                    setProviderPrompts(prev => ({
                      ...prev,
                      loudly: e.target.value,
                    }));
                  }}
                  placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
                  className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  minRows={3}
                />
              </div>

              {/* Mubert textarea */}
              <div style={{ display: musicProvider === 'mubert' ? 'block' : 'none' }}>
                <GlassyTextarea
                  value={providerPrompts.mubert}
                  onChange={(e) => {
                    setProviderPrompts(prev => ({
                      ...prev,
                      mubert: e.target.value,
                    }));
                  }}
                  placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
                  className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  minRows={3}
                />
              </div>

              {/* ElevenLabs textarea */}
              <div style={{ display: musicProvider === 'elevenlabs' ? 'block' : 'none' }}>
                <GlassyTextarea
                  value={providerPrompts.elevenlabs}
                  onChange={(e) => {
                    setProviderPrompts(prev => ({
                      ...prev,
                      elevenlabs: e.target.value,
                    }));
                  }}
                  placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
                  className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                  minRows={3}
                />
              </div>

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
                options={PROVIDER_OPTIONS}
              />

              <label className="block text-base mb-1">
                Duration{" "}
                <span className="text-sm text-gray-400">
                  {duration}s
                </span>
              </label>
              <GlassySlider
                label={null}
                value={duration}
                onChange={setDuration}
                min={30}
                max={120}
                step={1}
                tickMarks={DURATION_TICK_MARKS}
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
          {/* Show existing custom upload state if present */}
          {initialProvider === "custom" && hasGeneratedUrl && existingFilename && !isUploading.music && (
            <div className="text-center mb-8">
              <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-green-400 font-medium text-lg">Custom Track Loaded</p>
                <p className="text-gray-300 mt-2">{existingFilename}</p>
                <p className="text-gray-500 text-sm mt-4">
                  Upload a new file below to replace this track
                </p>
              </div>
            </div>
          )}

          {/* Upload in progress state */}
          {isUploading.music && (
            <div className="mb-8 p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-4">
                <LoadingSpinner size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-blue-400 font-medium">Uploading...</p>
                  {uploadingFilename.music && (
                    <p className="text-gray-400 text-sm mt-1 truncate">
                      {uploadingFilename.music}
                    </p>
                  )}
                </div>
              </div>
              {/* Indeterminate progress bar */}
              <div className="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-progress-indeterminate" />
              </div>
            </div>
          )}

          <div className="text-center mb-8">
            <FileUpload
              fileType="custom-music"
              projectId={projectId}
              onUploadComplete={handleMusicUpload}
              onUploadError={handleUploadError("music")}
              onUploadStart={(filename) => startUpload("music", filename)}
              disabled={isUploading.music}
              className="w-full px-8 py-12 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            >
              <div className="text-center">
                <UploadIcon size={48} className="mx-auto mb-4 opacity-70" />
                <h3 className="text-lg font-semibold mb-2">
                  {isUploading.music ? "Uploading..." : (hasGeneratedUrl && initialProvider === "custom" ? "Replace Music Track" : "Upload Music Track")}
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

            {uploadedFiles.music && !isUploading.music && (
              <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-green-400 font-medium">Upload Complete</p>
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
                        <Tooltip content={isPlaying ? "Pause" : "Preview track"}>
                          <button
                            onClick={() => handlePlayPause(track)}
                            className="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-white"
                          >
                            {isPlaying ? '⏸' : '▶'}
                          </button>
                        </Tooltip>

                        {/* Select Button */}
                        <Tooltip content="Use this track">
                          <button
                            onClick={() => handleLibraryTrackSelect(track)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
                          >
                            Select
                          </button>
                        </Tooltip>
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
