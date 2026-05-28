"use client";

import { useBackgroundAnimator } from "@/components/animated-background/animated-background";
import {
  BriefPanelV4,
  type StreamUpdateEvent,
} from "@/components/BriefPanelV4";
import { MusicDraftEditor } from "@/components/draft-editors/MusicDraftEditor";
import { SfxDraftEditor } from "@/components/draft-editors/SfxDraftEditor";
import { VoiceDraftEditor } from "@/components/draft-editors/VoiceDraftEditor";
import { ProjectHeader } from "@/components/Header/ProjectHeader";
import { MixerPanel } from "@/components/MixerPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import {
  DraftAccordion,
  EmptyStreamState,
  VersionAccordion,
} from "@/components/ui";
import type { DraftState } from "@/components/ui/DraftAccordion";
import { MusicVersionContent } from "@/components/version-content/MusicVersionContent";
import { SfxVersionContent } from "@/components/version-content/SfxVersionContent";
import { VoiceVersionContent } from "@/components/version-content/VoiceVersionContent";
import { useMixerData } from "@/hooks/useMixerData";
import { useStreamOperations } from "@/hooks/useStreamOperations";
import { ChatSidebar } from "@/components/ChatSidebar";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useMixerStore } from "@/store/mixerStore";
import { useUIStore } from "@/store/uiStore";
import type { ProjectBrief } from "@/types";
import type {
  MusicVersion,
  SfxVersion,
  VersionId,
  VoiceVersion,
} from "@/types/versions";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MatrixBackground } from "@/components/animated-background/MatrixBackground";

export default function AdWorkspace() {
  const params = useParams();
  const router = useRouter();
  const adId = params.id as string;

  // Stream operations via SWR-backed hooks
  const voice = useStreamOperations(adId, "voices");
  const music = useStreamOperations(adId, "music");
  const sfx = useStreamOperations(adId, "sfx");

  // Mixer data and operations
  const {
    data: mixerData,
    mutate: mutateMixer,
    removeStream,
  } = useMixerData(adId);

  // Helper to get mixer URL for a track type
  const getMixerUrl = (type: "music" | "soundfx") =>
    mixerData?.tracks?.find((t) => t.type === type)?.url;

  // URL fingerprint helper for multi-track comparison (voice, sfx)
  const getUrlFingerprint = (urls: (string | undefined | null)[]) =>
    urls.map((u) => u || "").join("|");

  // Accordion state from store
  const { openAccordion, setOpenAccordion } = useUIStore();
  // hasGenerated: true once any stream has at least one version. The chat
  // endpoint rejects with 400 before that — the panel uses this to render
  // the no-generation guard instead of a usable input.
  const hasGenerated = Boolean(
    (voice.data?.versions?.length ?? 0) > 0 ||
      (music.data?.versions?.length ?? 0) > 0 ||
      (sfx.data?.versions?.length ?? 0) > 0,
  );

  // Context-strip stats. `Take v{n}` is the position (1-indexed, oldest →
  // newest) of the active voice version in the version list — same rule as
  // VersionAccordion's chronological labelling.
  const voiceVersionsOldestFirst = voice.data?.versions
    ? [...voice.data.versions].reverse()
    : [];
  const activeVoiceIdx = voice.data?.active
    ? voiceVersionsOldestFirst.indexOf(voice.data.active)
    : -1;
  const versionLabel =
    activeVoiceIdx >= 0 ? `Take v${activeVoiceIdx + 1}` : undefined;
  const activeVoiceVersion = voice.data?.active
    ? (voice.data.versionsData[voice.data.active] as VoiceVersion | undefined)
    : undefined;
  const voiceTrackCount = activeVoiceVersion?.voiceTracks?.length ?? 0;
  const musicTrackCount = music.data?.active ? 1 : 0;
  const totalDurationSeconds = mixerData?.totalDuration
    ? Math.round(mixerData.totalDuration)
    : null;

  // Reset accordion state when navigating to a different ad
  useEffect(() => {
    setOpenAccordion("voices", "draft");
    setOpenAccordion("music", "draft");
    setOpenAccordion("sfx", "draft");
  }, [adId, setOpenAccordion]);

  // Ad metadata state (not part of streams)
  const [adName, setAdName] = useState<string>("");
  const [briefData, setBriefData] = useState<ProjectBrief | null | undefined>(
    undefined,
  );

  // Header tab state (0=Brief, 1=Voice, 2=Music, 3=SFX, 4=Mix, 5=Preview)
  const [selectedTab, setSelectedTab] = useState(0);

  // Generation state tracking for MatrixBackground animation
  const [isBriefGenerating, setIsBriefGenerating] = useState(false);
  const { generatingMusic, generatingSfx } = useAudioPlaybackStore();

  // Generation errors - displayed as dismissible banner
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);

  // Refs for draft editor imperative handles (DraftAccordion header buttons)
  const voicePlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const voiceSendToMixerRef = useRef<(() => void) | null>(null);
  const voiceRequestChangeRef = useRef<(() => void) | null>(null);
  const musicPlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const musicSendToMixerRef = useRef<(() => void) | null>(null);
  const musicRequestChangeRef = useRef<(() => void) | null>(null);
  const sfxPlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const sfxSendToMixerRef = useRef<(() => void) | null>(null);
  const sfxRequestChangeRef = useRef<(() => void) | null>(null);

  const [isLoadingBrief, setIsLoadingBrief] = useState(false);

  // Derived loading state
  const isLoading =
    isLoadingBrief || voice.isLoading || music.isLoading || sfx.isLoading;

  // Load ad metadata and brief
  useEffect(() => {
    // Reset state immediately when adId changes
    setAdName("");
    setBriefData(undefined);

    const loadAdMetadata = async () => {
      try {
        setIsLoadingBrief(true);
        const res = await fetch(`/api/ads/${adId}/brief`);
        if (res.ok) {
          const data = await res.json();
          setAdName(data.name || adId);
          setBriefData(data.brief ?? null);
        } else {
          // 403 (non-owner non-admin), 404 (not yet persisted), or other — fall back to defaults
          setAdName(adId);
          setBriefData(null);
        }
      } catch (error) {
        console.error("Failed to load ad metadata:", error);
        setBriefData(null);
        setAdName(adId);
      } finally {
        setIsLoadingBrief(false);
      }
    };

    loadAdMetadata();
  }, [adId]);

  // Mixer state is hydrated directly from SWR inside MixerPanel; no manual load on mount.

  // Handle preview - plays all tracks from a frozen version
  // streamType is required to disambiguate version IDs (v1, v2, etc. exist in each stream)
  const handlePreview = (
    versionId: VersionId,
    streamType: "voices" | "music" | "sfx",
  ) => {
    const { isPlaying, stop, playSequence } = useAudioPlaybackStore.getState();

    // If already playing, stop
    if (isPlaying) {
      stop();
      return;
    }

    if (streamType === "voices") {
      const voiceVersion = voice.data?.versionsData[versionId] as
        | VoiceVersion
        | undefined;
      if (voiceVersion) {
        const urls = voiceVersion.voiceTracks
          .map((t, i) => t.generatedUrl || voiceVersion.generatedUrls?.[i])
          .filter((url): url is string => !!url);
        if (urls.length > 0) {
          playSequence(urls, { type: "voice-all", versionId });
        }
      }
    } else if (streamType === "music") {
      const musicVersion = music.data?.versionsData[versionId] as
        | MusicVersion
        | undefined;
      if (musicVersion?.generatedUrl) {
        playSequence([musicVersion.generatedUrl], {
          type: "music-generated",
          versionId,
        });
      }
    } else if (streamType === "sfx") {
      const sfxVersion = sfx.data?.versionsData[versionId] as
        | SfxVersion
        | undefined;
      if (sfxVersion?.generatedUrls?.length) {
        const urls = sfxVersion.generatedUrls.filter(
          (url): url is string => !!url,
        );
        if (urls.length > 0) {
          playSequence(urls, { type: "sfx-preview", versionId });
        }
      }
    }
  };

  // Header handlers
  const handleTabChange = (index: number) => {
    setSelectedTab(index);
  };

  const handleNewAd = () => {
    router.push("/");
  };

  const switchToMixTab = () => setSelectedTab(4);

  // Handle drafts created callback from BriefPanelV4
  const handleDraftsCreated = async (draftIds: {
    voices?: string;
    music?: string;
    sfx?: string;
    adName?: string;
  }) => {
    console.log("✅ Drafts created:", draftIds);

    if (draftIds.adName) {
      setAdName(draftIds.adName);
    }

    // Reload brief from Redis
    const metaRes = await fetch(`/api/ads/${adId}/brief`);
    if (metaRes.ok) {
      const data = await metaRes.json();
      if (data.brief) {
        setBriefData(data.brief);
      }
    }

    // Invalidate all stream caches to show new drafts
    await Promise.all([voice.mutate(), music.mutate(), sfx.mutate()]);

    // Open the draft accordions for newly created drafts
    if (draftIds.voices) setOpenAccordion("voices", "draft");
    if (draftIds.music) setOpenAccordion("music", "draft");
    if (draftIds.sfx) setOpenAccordion("sfx", "draft");

    // Switch to Voice tab
    setSelectedTab(1);
  };

  // Handle progressive stream updates from SSE auto-generation
  const handleStreamUpdate = async (event: StreamUpdateEvent) => {
    switch (event.stream) {
      case "drafts":
        // Drafts created - invalidate all stream caches and clear previous errors
        setGenerationErrors([]);
        await Promise.all([voice.mutate(), music.mutate(), sfx.mutate()]);
        // Open draft accordions
        if (event.drafts.voices) setOpenAccordion("voices", "draft");
        if (event.drafts.music) setOpenAccordion("music", "draft");
        if (event.drafts.sfx) setOpenAccordion("sfx", "draft");
        break;

      case "voices":
        // Voice track update - refresh voice stream
        if (event.status === "failed" && event.error) {
          setGenerationErrors((prev) => [
            ...prev,
            `Voice generation failed: ${event.error}`,
          ]);
        }
        await voice.mutate();
        break;

      case "music":
        // Music update - refresh music stream
        if (event.status === "failed" && event.error) {
          setGenerationErrors((prev) => [
            ...prev,
            `Music generation failed: ${event.error}`,
          ]);
        }
        await music.mutate();
        break;

      case "sfx":
        // SFX update - refresh sfx stream
        if (event.status === "failed" && event.error) {
          setGenerationErrors((prev) => [
            ...prev,
            `SFX generation failed: ${event.error}`,
          ]);
        }
        await sfx.mutate();
        break;

      case "complete":
        // All generation complete - refresh mixer + streams and switch to mixer tab for "wow" effect
        if (event.success) {
          await Promise.all([
            mutateMixer(),
            voice.mutate(),
            music.mutate(),
            sfx.mutate(),
          ]);
          setSelectedTab(4);
        }
        break;
    }
  };

  // Type-safe draft getters
  const voiceDraft = voice.getDraft() as {
    id: VersionId;
    version: VoiceVersion;
  } | null;
  const musicDraft = music.getDraft() as {
    id: VersionId;
    version: MusicVersion;
  } | null;
  const sfxDraft = sfx.getDraft() as {
    id: VersionId;
    version: SfxVersion;
  } | null;

  // Draft states driven by editor callbacks (computed from LOCAL state, not stale SWR props)
  const [voiceDraftState, setVoiceDraftState] = useState<DraftState>("editing");
  const [musicDraftState, setMusicDraftState] = useState<DraftState>("editing");
  const [sfxDraftState, setSfxDraftState] = useState<DraftState>("editing");

  const searchParams = useSearchParams();

  const autoGenerate = searchParams.get("auto_generate") === "1";

  useEffect(() => {
    const autoGenerate = searchParams.get("auto_generate");

    if (autoGenerate) {
      router.replace(`/ad/${adId}`, {});
    }
  }, [searchParams]);

  useBackgroundAnimator(isBriefGenerating || generatingMusic || generatingSfx);

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-black text-white">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full"></div>
          <p className="ml-4">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <ProjectHeader
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        onNewProject={handleNewAd}
        adId={adId}
        projectName={adName}
      />

      <div className="flex-1 flex flex-row min-h-0">
      <div
        className="flex-1 overflow-auto relative"
      >
        <MatrixBackground />
        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Generation errors banner */}
          {generationErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              {generationErrors.map((err, i) => (
                <p key={i} className="text-red-400 text-sm">
                  {err}
                </p>
              ))}
              <button
                onClick={() => setGenerationErrors([])}
                className="mt-2 text-xs text-red-400/60 hover:text-red-400"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Brief - Tab 0 */}
          {selectedTab === 0 && (
            <BriefPanelV4
              autoGenerate={autoGenerate}
              adId={adId}
              initialBrief={briefData}
              onDraftsCreated={handleDraftsCreated}
              onGeneratingChange={setIsBriefGenerating}
              autoGenerateAudio={true}
              onStreamUpdate={handleStreamUpdate}
            />
          )}

          {/* Voice Versions - Tab 1 */}
          {selectedTab === 1 && voice.data && (
            <div>
              {voiceDraft && (
                <DraftAccordion
                  title={voiceDraft.id}
                  requestText={voiceDraft.version.requestText}
                  type="voice"
                  versionId={voiceDraft.id}
                  activeVersionId={voice.data.active}
                  currentUrl={getUrlFingerprint(
                    voiceDraft.version.voiceTracks.map((t) => t.generatedUrl),
                  )}
                  mixerUrl={getUrlFingerprint(
                    mixerData?.tracks
                      ?.filter((t) => t.type === "voice")
                      .map((t) => t.url) || [],
                  )}
                  isOpen={openAccordion.voices === "draft"}
                  onOpenChange={(open) =>
                    setOpenAccordion("voices", open ? "draft" : null)
                  }
                  onPlayAll={() => voicePlayAllRef.current?.()}
                  onSendToMixer={() => {
                    voiceSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => voiceRequestChangeRef.current?.()}
                  hasTracksWithAudio={voiceDraft.version.voiceTracks.some(
                    (t) => !!t.generatedUrl,
                  )}
                  draftState={voiceDraftState}
                  onNewBlankVersion={voice.createDraft}
                  onDelete={async () => {
                    const deleted = await voice.remove(voiceDraft.id);
                    if (deleted && openAccordion.voices === "draft") {
                      setOpenAccordion("voices", null);
                    }
                  }}
                >
                  <VoiceDraftEditor
                    key={voiceDraft.id}
                    adId={adId}
                    draftVersionId={voiceDraft.id}
                    draftVersion={voiceDraft.version}
                    onUpdate={() => voice.mutate()}
                    onPlayAllRef={voicePlayAllRef}
                    onSendToMixerRef={voiceSendToMixerRef}
                    onRequestChangeRef={voiceRequestChangeRef}
                    onNewBlankVersion={voice.createDraft}
                    onDraftStateChange={setVoiceDraftState}
                  />
                </DraftAccordion>
              )}

              {voice.data.versions.length === 0 ? (
                <EmptyStreamState
                  onGoToBrief={() => setSelectedTab(0)}
                  onCreateBlank={voice.createDraft}
                />
              ) : (
                <VersionAccordion
                  versions={voice.data.versions
                    .filter(
                      (vId) => voice.data!.versionsData[vId].status !== "draft",
                    )
                    .map((vId) => ({
                      id: vId,
                      ...(voice.data!.versionsData[vId] as VoiceVersion),
                    }))}
                  activeVersionId={voice.data.active}
                  streamType="voices"
                  openVersionId={
                    openAccordion.voices !== "draft"
                      ? openAccordion.voices
                      : null
                  }
                  onOpenChange={(versionId) =>
                    setOpenAccordion("voices", versionId)
                  }
                  onPreview={(id) => handlePreview(id, "voices")}
                  onClone={voice.clone}
                  onDelete={async (vId) => {
                    const deleted = await voice.remove(vId);
                    // Clear accordion state if we deleted the open version
                    if (deleted && openAccordion.voices === deleted) {
                      setOpenAccordion("voices", null);
                    }
                  }}
                  onSendToMixer={(vId) =>
                    voice.sendToMixer(vId, switchToMixTab)
                  }
                  hasAudio={(v) => {
                    const voice = v as VoiceVersion;
                    // Match backend validation: ALL tracks must have audio
                    return (
                      voice.voiceTracks.length > 0 &&
                      voice.voiceTracks.every(
                        (t, i) =>
                          !!t.generatedUrl || !!voice.generatedUrls?.[i],
                      )
                    );
                  }}
                  renderContent={(version, isActive) => (
                    <VoiceVersionContent
                      version={version as VoiceVersion}
                      versionId={version.id}
                      adId={adId}
                      isActive={isActive}
                      onNewVersion={() => voice.mutate()}
                      onNewBlankVersion={voice.createDraft}
                    />
                  )}
                />
              )}
            </div>
          )}

          {/* Music Versions - Tab 2 */}
          {selectedTab === 2 && music.data && (
            <div>
              {musicDraft && (
                <DraftAccordion
                  title={musicDraft.id}
                  requestText={musicDraft.version.requestText}
                  type="music"
                  versionId={musicDraft.id}
                  activeVersionId={music.data.active}
                  currentUrl={musicDraft.version.generatedUrl}
                  mixerUrl={getMixerUrl("music")}
                  isOpen={openAccordion.music === "draft"}
                  onOpenChange={(open) =>
                    setOpenAccordion("music", open ? "draft" : null)
                  }
                  onPlayAll={() => musicPlayAllRef.current?.()}
                  onSendToMixer={() => {
                    musicSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => musicRequestChangeRef.current?.()}
                  hasTracksWithAudio={!!musicDraft.version.generatedUrl}
                  draftState={musicDraftState}
                  onNewBlankVersion={music.createDraft}
                  onDelete={async () => {
                    const deleted = await music.remove(musicDraft.id);
                    if (deleted && openAccordion.music === "draft") {
                      setOpenAccordion("music", null);
                    }
                  }}
                >
                  <MusicDraftEditor
                    key={musicDraft.id}
                    adId={adId}
                    draftVersionId={musicDraft.id}
                    draftVersion={musicDraft.version}
                    onUpdate={() => music.mutate()}
                    onPlayAllRef={musicPlayAllRef}
                    onSendToMixerRef={musicSendToMixerRef}
                    onRequestChangeRef={musicRequestChangeRef}
                    onNewBlankVersion={music.createDraft}
                    onDraftStateChange={setMusicDraftState}
                  />
                </DraftAccordion>
              )}

              {music.data.versions.length === 0 ? (
                <EmptyStreamState
                  onGoToBrief={() => setSelectedTab(0)}
                  onCreateBlank={music.createDraft}
                />
              ) : (
                <VersionAccordion
                  versions={music.data.versions
                    .filter(
                      (vId) => music.data!.versionsData[vId].status !== "draft",
                    )
                    .map((vId) => ({
                      id: vId,
                      ...(music.data!.versionsData[vId] as MusicVersion),
                    }))}
                  activeVersionId={music.data.active}
                  streamType="music"
                  openVersionId={
                    openAccordion.music !== "draft" ? openAccordion.music : null
                  }
                  onOpenChange={(versionId) =>
                    setOpenAccordion("music", versionId)
                  }
                  onPreview={(id) => handlePreview(id, "music")}
                  onClone={music.clone}
                  onDelete={async (vId) => {
                    const deleted = await music.remove(vId);
                    if (deleted && openAccordion.music === deleted) {
                      setOpenAccordion("music", null);
                    }
                  }}
                  onSendToMixer={(vId) =>
                    music.sendToMixer(vId, switchToMixTab)
                  }
                  hasAudio={(v) =>
                    !!(v as MusicVersion).generatedUrl &&
                    (v as MusicVersion).generatedUrl.length > 0
                  }
                  renderContent={(version, isActive) => (
                    <MusicVersionContent
                      version={version as MusicVersion}
                      versionId={version.id}
                      adId={adId}
                      isActive={isActive}
                      onNewVersion={() => music.mutate()}
                      onNewBlankVersion={music.createDraft}
                    />
                  )}
                />
              )}
            </div>
          )}

          {/* Sound FX Versions - Tab 3 */}
          {selectedTab === 3 && sfx.data && (
            <div>
              {sfxDraft && (
                <DraftAccordion
                  title={sfxDraft.id}
                  requestText={sfxDraft.version.requestText}
                  type="sfx"
                  versionId={sfxDraft.id}
                  activeVersionId={sfx.data.active}
                  currentUrl={getUrlFingerprint(
                    sfxDraft.version.generatedUrls || [],
                  )}
                  mixerUrl={getUrlFingerprint(
                    mixerData?.tracks
                      ?.filter((t) => t.type === "soundfx")
                      .map((t) => t.url) || [],
                  )}
                  isOpen={openAccordion.sfx === "draft"}
                  onOpenChange={(open) =>
                    setOpenAccordion("sfx", open ? "draft" : null)
                  }
                  onPlayAll={() => sfxPlayAllRef.current?.()}
                  onSendToMixer={() => {
                    sfxSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => sfxRequestChangeRef.current?.()}
                  hasTracksWithAudio={
                    (sfxDraft.version.generatedUrls?.length || 0) > 0
                  }
                  draftState={sfxDraftState}
                  onNewBlankVersion={sfx.createDraft}
                  onDelete={async () => {
                    const deleted = await sfx.remove(sfxDraft.id);
                    if (deleted && openAccordion.sfx === "draft") {
                      setOpenAccordion("sfx", null);
                    }
                  }}
                >
                  <SfxDraftEditor
                    key={sfxDraft.id}
                    adId={adId}
                    draftVersionId={sfxDraft.id}
                    draftVersion={sfxDraft.version}
                    onUpdate={async () => {
                      const data = await sfx.mutate();
                      return data?.versionsData?.[sfxDraft.id] as
                        | SfxVersion
                        | undefined;
                    }}
                    onPlayAllRef={sfxPlayAllRef}
                    onSendToMixerRef={sfxSendToMixerRef}
                    onRequestChangeRef={sfxRequestChangeRef}
                    onNewBlankVersion={sfx.createDraft}
                    voiceStream={voice}
                    adDuration={briefData?.adDuration}
                    onDraftStateChange={setSfxDraftState}
                  />
                </DraftAccordion>
              )}

              {sfx.data.versions.length === 0 ? (
                <EmptyStreamState
                  onGoToBrief={() => setSelectedTab(0)}
                  onCreateBlank={sfx.createDraft}
                />
              ) : (
                <VersionAccordion
                  versions={sfx.data.versions
                    .filter(
                      (vId) => sfx.data!.versionsData[vId].status !== "draft",
                    )
                    .map((vId) => ({
                      id: vId,
                      ...(sfx.data!.versionsData[vId] as SfxVersion),
                    }))}
                  activeVersionId={sfx.data.active}
                  streamType="sfx"
                  openVersionId={
                    openAccordion.sfx !== "draft" ? openAccordion.sfx : null
                  }
                  onOpenChange={(versionId) =>
                    setOpenAccordion("sfx", versionId)
                  }
                  onPreview={(id) => handlePreview(id, "sfx")}
                  onClone={sfx.clone}
                  onDelete={async (vId) => {
                    const deleted = await sfx.remove(vId);
                    if (deleted && openAccordion.sfx === deleted) {
                      setOpenAccordion("sfx", null);
                    }
                  }}
                  onSendToMixer={(vId) => sfx.sendToMixer(vId, switchToMixTab)}
                  hasAudio={(v) =>
                    (v as SfxVersion).generatedUrls &&
                    (v as SfxVersion).generatedUrls.length > 0
                  }
                  renderContent={(version, isActive) => (
                    <SfxVersionContent
                      version={version as SfxVersion}
                      versionId={version.id}
                      adId={adId}
                      isActive={isActive}
                      onNewVersion={() => sfx.mutate()}
                      onNewBlankVersion={sfx.createDraft}
                    />
                  )}
                />
              )}
            </div>
          )}

          {/* Mix - Tab 4 */}
          {selectedTab === 4 && (
            <MixerPanel
              resetForm={() => {
                useMixerStore.getState().clearTracks();
              }}
              onChangeVoice={() => setSelectedTab(1)}
              onChangeMusic={() => setSelectedTab(2)}
              onChangeSoundFx={() => setSelectedTab(3)}
              onRemoveTrack={(trackId: string) => {
                const streamType = trackId.startsWith("sfx-")
                  ? "sfx"
                  : trackId.startsWith("music-")
                    ? "music"
                    : null;
                if (streamType) removeStream(streamType);
              }}
            />
          )}

          {/* Preview - Tab 5 */}
          {selectedTab === 5 && <PreviewPanel projectId={adId} />}
        </div>
      </div>

        <ChatSidebar
          adId={adId}
          hasGenerated={hasGenerated}
          contextStats={{
            versionLabel,
            durationSeconds: totalDurationSeconds,
            voiceTrackCount,
            musicTrackCount,
          }}
          onTurnLanded={(result) => {
            // 1) Revalidate the SWR caches for whichever streams the agent
            // produced a draft in. Without this the workspace tabs keep
            // showing stale data until the user refocuses the window or
            // remounts the page. The mixer is also mutated when any stream
            // changed because it composes from all three.
            const v = !!result.drafts.voices;
            const m = !!result.drafts.music;
            const s = !!result.drafts.sfx;
            if (v) void voice.mutate();
            if (m) void music.mutate();
            if (s) void sfx.mutate();
            if (v || m || s) void mutateMixer();

            // 2) Auto-navigate the user to the tab that hosts the new draft
            // so the change is visible without manual tab-switching. The
            // user just asked the AI to do something — they expect to see
            // it. Multi-stream changes land on Mix! since that's the only
            // tab that surfaces all three streams in one view.
            //   0 Brief · 1 Script · 2 Music · 3 FX · 4 Mix! · 5 Preview
            const touched = (v ? 1 : 0) + (m ? 1 : 0) + (s ? 1 : 0);
            let nextTab: number | null = null;
            if (touched > 1) nextTab = 4;
            else if (v) nextTab = 1;
            else if (m) nextTab = 2;
            else if (s) nextTab = 3;
            if (nextTab !== null && nextTab !== selectedTab) {
              setSelectedTab(nextTab);
            }
          }}
        />
      </div>
    </div>
  );
}
