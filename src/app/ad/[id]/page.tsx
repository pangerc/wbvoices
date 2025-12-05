"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MatrixBackground } from "@/components";
import { VersionAccordion, DraftAccordion } from "@/components/ui";
import { VoiceVersionContent } from "@/components/version-content/VoiceVersionContent";
import { MusicVersionContent } from "@/components/version-content/MusicVersionContent";
import { SfxVersionContent } from "@/components/version-content/SfxVersionContent";
import { VoiceDraftEditor } from "@/components/draft-editors/VoiceDraftEditor";
import { MusicDraftEditor } from "@/components/draft-editors/MusicDraftEditor";
import { SfxDraftEditor } from "@/components/draft-editors/SfxDraftEditor";
import { BriefPanelV3 } from "@/components/BriefPanelV3";
import { MixerPanel } from "@/components/MixerPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useMixerStore } from "@/store/mixerStore";
import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { useUIStore } from "@/store/uiStore";
import { useStreamOperations } from "@/hooks/useStreamOperations";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
} from "@/types/versions";
import type { ProjectBrief } from "@/types";

export default function AdWorkspace() {
  const params = useParams();
  const router = useRouter();
  const adId = params.id as string;

  // Stream operations via SWR-backed hooks
  const voice = useStreamOperations(adId, "voices");
  const music = useStreamOperations(adId, "music");
  const sfx = useStreamOperations(adId, "sfx");

  // Accordion state from store
  const { openAccordion, setOpenAccordion } = useUIStore();

  // Reset accordion state when navigating to a different ad
  useEffect(() => {
    setOpenAccordion("voices", "draft");
    setOpenAccordion("music", "draft");
    setOpenAccordion("sfx", "draft");
  }, [adId, setOpenAccordion]);

  // Ad metadata state (not part of streams)
  const [adName, setAdName] = useState<string>("");
  const [briefData, setBriefData] = useState<ProjectBrief | null | undefined>(undefined);

  // Header tab state (0=Brief, 1=Voice, 2=Music, 3=SFX, 4=Mix, 5=Preview)
  const [selectedTab, setSelectedTab] = useState(0);

  // Generation state tracking for MatrixBackground animation
  const [isBriefGenerating, setIsBriefGenerating] = useState(false);
  const { generatingMusic, generatingSfx } = useAudioPlaybackStore();

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

  // Derived loading state
  const isLoading = voice.isLoading && music.isLoading && sfx.isLoading;

  // Load ad metadata and brief
  useEffect(() => {
    // Reset state immediately when adId changes
    setAdName("");
    setBriefData(undefined);

    const loadAdMetadata = async () => {
      try {
        const sessionId = typeof window !== 'undefined'
          ? localStorage.getItem('universal-session') || 'default-session'
          : 'default-session';

        const res = await fetch(`/api/ads?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          const ad = data.ads.find((a: { adId: string }) => a.adId === adId);
          if (ad) {
            setAdName(ad.meta.name || adId);
            setBriefData(ad.meta.brief || null);
          } else {
            setAdName(adId);
            setBriefData(null);
          }
        } else {
          setBriefData(null);
        }
      } catch (error) {
        console.error("Failed to load ad metadata:", error);
        setBriefData(null);
        setAdName(adId);
      }
    };

    loadAdMetadata();
  }, [adId]);

  // Load mixer state from Redis on mount
  useEffect(() => {
    const loadMixerState = async () => {
      const { clearTracks, addTrack, setTrackVolume } = useMixerStore.getState();
      clearTracks();

      try {
        const res = await fetch(`/api/ads/${adId}/mixer`);
        if (res.ok) {
          const mixerState = await res.json();
          if (mixerState.tracks && mixerState.tracks.length > 0) {
            mixerState.tracks.forEach((track: { id: string; url: string; label: string; type: "voice" | "music" | "soundfx"; volume?: number }) => {
              addTrack(track);
            });

            if (mixerState.volumes) {
              Object.entries(mixerState.volumes).forEach(([id, volume]) => {
                setTrackVolume(id, volume as number);
              });
            }

            console.log(`🔄 Restored mixer state with ${mixerState.tracks.length} tracks`);
          }
        }
      } catch (error) {
        console.error("Failed to load mixer state:", error);
      }
    };

    loadMixerState();
  }, [adId]);

  // Handle preview - plays all tracks from a frozen version
  const handlePreview = (versionId: VersionId) => {
    const { isPlaying, stop, playSequence } = useAudioPlaybackStore.getState();

    // If already playing, stop
    if (isPlaying) {
      stop();
      return;
    }

    // Find which stream this version belongs to and get audio URLs
    const voiceVersion = voice.data?.versionsData[versionId] as VoiceVersion | undefined;
    const musicVersion = music.data?.versionsData[versionId] as MusicVersion | undefined;
    const sfxVersion = sfx.data?.versionsData[versionId] as SfxVersion | undefined;

    if (voiceVersion) {
      // Get all voice track URLs
      const urls = voiceVersion.voiceTracks
        .map((t, i) => t.generatedUrl || voiceVersion.generatedUrls?.[i])
        .filter((url): url is string => !!url);

      if (urls.length > 0) {
        playSequence(urls, { type: "voice-all", versionId });
      }
    } else if (musicVersion?.generatedUrl) {
      playSequence([musicVersion.generatedUrl], { type: "music-generated", versionId });
    } else if (sfxVersion?.generatedUrls?.length) {
      const urls = sfxVersion.generatedUrls.filter((url): url is string => !!url);
      if (urls.length > 0) {
        playSequence(urls, { type: "sfx-preview", versionId });
      }
    }
  };

  // Header handlers
  const handleTabChange = (index: number) => {
    setSelectedTab(index);
  };

  const handleNewAd = () => {
    router.push('/');
  };

  const switchToMixTab = () => setSelectedTab(4);

  // Handle drafts created callback from BriefPanelV3
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
    const sessionId = localStorage.getItem('universal-session') || 'default-session';
    const metaRes = await fetch(`/api/ads?sessionId=${sessionId}`);
    if (metaRes.ok) {
      const data = await metaRes.json();
      const ad = data.ads.find((a: { adId: string }) => a.adId === adId);
      if (ad?.meta?.brief) {
        setBriefData(ad.meta.brief);
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

  // Type-safe draft getters
  const voiceDraft = voice.getDraft() as { id: VersionId; version: VoiceVersion } | null;
  const musicDraft = music.getDraft() as { id: VersionId; version: MusicVersion } | null;
  const sfxDraft = sfx.getDraft() as { id: VersionId; version: SfxVersion } | null;

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
      <Header
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        onNewProject={handleNewAd}
        adId={adId}
        projectName={adName}
      />

      <div className="flex-1 overflow-auto relative">
        <MatrixBackground
          isAnimating={isBriefGenerating || generatingMusic || generatingSfx}
        />
        <div className="container mx-auto px-4 py-8 relative z-10">

          {/* Brief - Tab 0 */}
          {selectedTab === 0 && (
            <BriefPanelV3
              adId={adId}
              initialBrief={briefData}
              onDraftsCreated={handleDraftsCreated}
              onGeneratingChange={setIsBriefGenerating}
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
                  isOpen={openAccordion.voices === "draft"}
                  onOpenChange={(open) => setOpenAccordion("voices", open ? "draft" : null)}
                  onPlayAll={() => voicePlayAllRef.current?.()}
                  onSendToMixer={() => {
                    voiceSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => voiceRequestChangeRef.current?.()}
                  hasTracksWithAudio={voiceDraft.version.voiceTracks.some(t => !!t.generatedUrl)}
                  onNewBlankVersion={voice.createDraft}
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
                  />
                </DraftAccordion>
              )}

              {voice.data.versions.length === 0 ? (
                <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                  <button
                    onClick={() => setSelectedTab(0)}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    Share a brief
                  </button>
                  {" or start with a "}
                  <button
                    onClick={voice.createDraft}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    blank one
                  </button>
                </div>
              ) : (
                <VersionAccordion
                  versions={voice.data.versions
                    .filter((vId) => voice.data!.versionsData[vId].status !== "draft")
                    .map((vId) => ({
                      id: vId,
                      ...(voice.data!.versionsData[vId] as VoiceVersion),
                    }))}
                  activeVersionId={voice.data.active}
                  openVersionId={openAccordion.voices !== "draft" ? openAccordion.voices : null}
                  onOpenChange={(versionId) => setOpenAccordion("voices", versionId)}
                  onPreview={handlePreview}
                  onClone={voice.clone}
                  onDelete={voice.remove}
                  onSendToMixer={(vId) => voice.sendToMixer(vId, switchToMixTab)}
                  hasAudio={(v) => {
                    const voice = v as VoiceVersion;
                    // Match backend validation: ALL tracks must have audio
                    return voice.voiceTracks.length > 0 &&
                      voice.voiceTracks.every((t, i) =>
                        !!t.generatedUrl || !!voice.generatedUrls?.[i]
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
                  isOpen={openAccordion.music === "draft"}
                  onOpenChange={(open) => setOpenAccordion("music", open ? "draft" : null)}
                  onPlayAll={() => musicPlayAllRef.current?.()}
                  onSendToMixer={() => {
                    musicSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => musicRequestChangeRef.current?.()}
                  hasTracksWithAudio={!!musicDraft.version.generatedUrl}
                  onNewBlankVersion={music.createDraft}
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
                  />
                </DraftAccordion>
              )}

              {music.data.versions.length === 0 ? (
                <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                  <button
                    onClick={() => setSelectedTab(0)}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    Share a brief
                  </button>
                  {" or start with a "}
                  <button
                    onClick={music.createDraft}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    blank one
                  </button>
                </div>
              ) : (
                <VersionAccordion
                  versions={music.data.versions
                    .filter((vId) => music.data!.versionsData[vId].status !== "draft")
                    .map((vId) => ({
                      id: vId,
                      ...(music.data!.versionsData[vId] as MusicVersion),
                    }))}
                  activeVersionId={music.data.active}
                  openVersionId={openAccordion.music !== "draft" ? openAccordion.music : null}
                  onOpenChange={(versionId) => setOpenAccordion("music", versionId)}
                  onPreview={handlePreview}
                  onClone={music.clone}
                  onDelete={music.remove}
                  onSendToMixer={(vId) => music.sendToMixer(vId, switchToMixTab)}
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
                  isOpen={openAccordion.sfx === "draft"}
                  onOpenChange={(open) => setOpenAccordion("sfx", open ? "draft" : null)}
                  onPlayAll={() => sfxPlayAllRef.current?.()}
                  onSendToMixer={() => {
                    sfxSendToMixerRef.current?.();
                    setSelectedTab(4);
                  }}
                  onRequestChange={() => sfxRequestChangeRef.current?.()}
                  hasTracksWithAudio={(sfxDraft.version.generatedUrls?.length || 0) > 0}
                  onNewBlankVersion={sfx.createDraft}
                >
                  <SfxDraftEditor
                    key={sfxDraft.id}
                    adId={adId}
                    draftVersionId={sfxDraft.id}
                    draftVersion={sfxDraft.version}
                    onUpdate={() => sfx.mutate()}
                    onPlayAllRef={sfxPlayAllRef}
                    onSendToMixerRef={sfxSendToMixerRef}
                    onRequestChangeRef={sfxRequestChangeRef}
                    onNewBlankVersion={sfx.createDraft}
                  />
                </DraftAccordion>
              )}

              {sfx.data.versions.length === 0 ? (
                <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                  <button
                    onClick={() => setSelectedTab(0)}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    Share a brief
                  </button>
                  {" or start with a "}
                  <button
                    onClick={sfx.createDraft}
                    className="text-wb-blue hover:text-blue-400 transition-colors"
                  >
                    blank one
                  </button>
                </div>
              ) : (
                <VersionAccordion
                  versions={sfx.data.versions
                    .filter((vId) => sfx.data!.versionsData[vId].status !== "draft")
                    .map((vId) => ({
                      id: vId,
                      ...(sfx.data!.versionsData[vId] as SfxVersion),
                    }))}
                  activeVersionId={sfx.data.active}
                  openVersionId={openAccordion.sfx !== "draft" ? openAccordion.sfx : null}
                  onOpenChange={(versionId) => setOpenAccordion("sfx", versionId)}
                  onPreview={handlePreview}
                  onClone={sfx.clone}
                  onDelete={sfx.remove}
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
            />
          )}

          {/* Preview - Tab 5 */}
          {selectedTab === 5 && (
            <PreviewPanel projectId={adId} />
          )}
        </div>
      </div>
    </div>
  );
}
