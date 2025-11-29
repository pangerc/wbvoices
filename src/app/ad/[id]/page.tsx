"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { VersionAccordion, DraftAccordion } from "@/components/ui";
import { VoiceVersionContent } from "@/components/version-content/VoiceVersionContent";
import { MusicVersionContent } from "@/components/version-content/MusicVersionContent";
import { SfxVersionContent } from "@/components/version-content/SfxVersionContent";
import { VoiceDraftEditor } from "@/components/draft-editors/VoiceDraftEditor";
import { MusicDraftEditor } from "@/components/draft-editors/MusicDraftEditor";
import { SfxDraftEditor } from "@/components/draft-editors/SfxDraftEditor";
import { BriefPanelV3 } from "@/components/BriefPanelV3";
import { MixerPanel } from "@/components/MixerPanel";
import { useMixerStore } from "@/store/mixerStore";
import type {
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionStreamResponse,
  VersionId,
  AdMetadata,
} from "@/types/versions";
import type { ProjectBrief } from "@/types";

export default function AdWorkspace() {
  const params = useParams();
  const router = useRouter();
  const adId = params.id as string;


  // State for each stream
  const [voiceStream, setVoiceStream] =
    useState<VersionStreamResponse | null>(null);
  const [musicStream, setMusicStream] =
    useState<VersionStreamResponse | null>(null);
  const [sfxStream, setSfxStream] = useState<VersionStreamResponse | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [adName, setAdName] = useState<string>("");
  // undefined = still loading, null = no brief exists, object = brief data
  const [briefData, setBriefData] = useState<ProjectBrief | null | undefined>(undefined);

  // Header tab state (0=Brief, 1=Voice, 2=Music, 3=SFX, 4=Mix, 5=Preview)
  const [selectedTab, setSelectedTab] = useState(0);

  // Refs to expose draft editor functions for DraftAccordion header buttons
  const voicePlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const voiceSendToMixerRef = useRef<(() => void) | null>(null);
  // Note: voicePlayAllStateRef removed - state now comes from centralized audioPlaybackStore

  // Music refs
  const musicPlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const musicSendToMixerRef = useRef<(() => void) | null>(null);

  // SFX refs
  const sfxPlayAllRef = useRef<(() => Promise<void>) | null>(null);
  const sfxSendToMixerRef = useRef<(() => void) | null>(null);

  // Helper functions to get draft versions and their IDs
  const getVoiceDraft = () => {
    if (!voiceStream) return null;
    const draftId = voiceStream.versions.find(
      (vId) => voiceStream.versionsData[vId].status === "draft"
    );
    if (!draftId) return null;
    return {
      id: draftId,
      version: voiceStream.versionsData[draftId] as VoiceVersion,
    };
  };

  const getMusicDraft = () => {
    if (!musicStream) return null;
    const draftId = musicStream.versions.find(
      (vId) => musicStream.versionsData[vId].status === "draft"
    );
    if (!draftId) return null;
    return {
      id: draftId,
      version: musicStream.versionsData[draftId] as MusicVersion,
    };
  };

  const getSfxDraft = () => {
    if (!sfxStream) return null;
    const draftId = sfxStream.versions.find(
      (vId) => sfxStream.versionsData[vId].status === "draft"
    );
    if (!draftId) return null;
    return {
      id: draftId,
      version: sfxStream.versionsData[draftId] as SfxVersion,
    };
  };

  // Load ad metadata and brief
  useEffect(() => {
    const loadAdMetadata = async () => {
      try {
        // Get session ID
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
            setAdName(adId); // Fallback to ad ID
            setBriefData(null); // No brief exists for this ad
          }
        } else {
          setBriefData(null); // Failed to load, treat as no brief
        }
      } catch (error) {
        console.error("Failed to load ad metadata:", error);
        setBriefData(null); // Error loading, treat as no brief
        setAdName(adId); // Fallback to ad ID
      }
    };

    loadAdMetadata();
  }, [adId]);

  // Load version streams
  useEffect(() => {
    const loadStreams = async () => {
      setIsLoading(true);
      try {
        // Load all streams in parallel
        const [voicesRes, musicRes, sfxRes] = await Promise.all([
          fetch(`/api/ads/${adId}/voices`),
          fetch(`/api/ads/${adId}/music`),
          fetch(`/api/ads/${adId}/sfx`),
        ]);

        if (voicesRes.ok) {
          const voices = await voicesRes.json();
          setVoiceStream(voices);
        }
        if (musicRes.ok) {
          const music = await musicRes.json();
          setMusicStream(music);
        }
        if (sfxRes.ok) {
          const sfx = await sfxRes.json();
          setSfxStream(sfx);
        }
      } catch (error) {
        console.error("Failed to load version streams:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStreams();
  }, [adId]);

  // Load mixer state from Redis on mount (Issue #4 fix: persistence on reload)
  useEffect(() => {
    const loadMixerState = async () => {
      try {
        const res = await fetch(`/api/ads/${adId}/mixer`);
        if (res.ok) {
          const mixerState = await res.json();
          if (mixerState.tracks && mixerState.tracks.length > 0) {
            const { clearTracks, addTrack, setTrackVolume } = useMixerStore.getState();

            // Clear existing tracks first
            clearTracks();

            // Hydrate tracks from Redis
            mixerState.tracks.forEach((track: { id: string; url: string; label: string; type: "voice" | "music" | "soundfx"; volume?: number }) => {
              addTrack(track);
            });

            // Restore volume settings
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

  // Validation: Check if voice version can be activated
  const canActivateVoiceVersion = (version: VoiceVersion): boolean => {
    // Check if all voice tracks have generated audio
    const hasAllAudio = version.voiceTracks.every((_, index) => {
      return !!version.generatedUrls?.[index];
    });
    return hasAllAudio;
  };

  // Get activation error message for voice version
  const getVoiceActivationError = (version: VoiceVersion): string | null => {
    if (!canActivateVoiceVersion(version)) {
      const missingCount = version.voiceTracks.filter((_, index) => {
        return !version.generatedUrls?.[index];
      }).length;
      return `Cannot activate: ${missingCount} track(s) missing audio. Generate audio for all tracks first.`;
    }
    return null;
  };

  // Handle version activation (auto-rebuilds mixer)
  const handleActivateVoice = async (versionId: VersionId) => {
    // Get the version to validate
    const version = voiceStream?.versionsData[versionId] as VoiceVersion;
    if (!version) {
      console.error("Voice version not found");
      return;
    }

    // Validate before activation
    const error = getVoiceActivationError(version);
    if (error) {
      alert(error);
      return;
    }

    try {
      // 1. Activate version
      const res = await fetch(
        `/api/ads/${adId}/voices/${versionId}/activate`,
        {
          method: "POST",
        }
      );
      if (res.ok) {
        // 2. Auto-rebuild mixer
        await fetch(`/api/ads/${adId}/mixer/rebuild`, {
          method: "POST",
        });

        // 3. Reload voice stream
        const updated = await fetch(`/api/ads/${adId}/voices`);
        if (updated.ok) {
          setVoiceStream(await updated.json());
        }
      } else {
        const errorData = await res.json();
        alert(`Activation failed: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to activate voice version:", error);
      alert("Failed to activate voice version. Please try again.");
    }
  };

  const handleActivateMusic = async (versionId: VersionId) => {
    try {
      // 1. Activate version
      const res = await fetch(
        `/api/ads/${adId}/music/${versionId}/activate`,
        {
          method: "POST",
        }
      );
      if (res.ok) {
        // 2. Auto-rebuild mixer
        await fetch(`/api/ads/${adId}/mixer/rebuild`, {
          method: "POST",
        });

        // 3. Reload music stream
        const updated = await fetch(`/api/ads/${adId}/music`);
        if (updated.ok) {
          setMusicStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to activate music version:", error);
    }
  };

  const handleActivateSfx = async (versionId: VersionId) => {
    try {
      // 1. Activate version
      const res = await fetch(`/api/ads/${adId}/sfx/${versionId}/activate`, {
        method: "POST",
      });
      if (res.ok) {
        // 2. Auto-rebuild mixer
        await fetch(`/api/ads/${adId}/mixer/rebuild`, {
          method: "POST",
        });

        // 3. Reload sfx stream
        const updated = await fetch(`/api/ads/${adId}/sfx`);
        if (updated.ok) {
          setSfxStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to activate sfx version:", error);
    }
  };

  // Handle preview (just log for now)
  const handlePreview = (versionId: VersionId) => {
    console.log("Preview version:", versionId);
    // TODO: Implement preview modal or audio player
  };

  // Header handlers
  const handleTabChange = (index: number) => {
    setSelectedTab(index);
  };

  const handleNewAd = () => {
    router.push('/');
  };

  // Handle version cloning
  const handleCloneVoice = async (versionId: VersionId) => {
    try {
      const res = await fetch(`/api/ads/${adId}/voices/${versionId}/clone`, {
        method: "POST",
      });
      if (res.ok) {
        // Reload voice stream to show new cloned version
        const updated = await fetch(`/api/ads/${adId}/voices`);
        if (updated.ok) {
          setVoiceStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to clone voice version:", error);
    }
  };

  const handleCloneMusic = async (versionId: VersionId) => {
    try {
      const res = await fetch(`/api/ads/${adId}/music/${versionId}/clone`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/music`);
        if (updated.ok) {
          setMusicStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to clone music version:", error);
    }
  };

  const handleCloneSfx = async (versionId: VersionId) => {
    try {
      const res = await fetch(`/api/ads/${adId}/sfx/${versionId}/clone`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/sfx`);
        if (updated.ok) {
          setSfxStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to clone sfx version:", error);
    }
  };

  // Handle draft creation (activates existing draft first if present)
  const handleCreateVoiceDraft = async () => {
    try {
      const sessionId = localStorage.getItem('universal-session') || 'default-session';

      // If draft exists, activate it first (commits it as a version)
      const existingDraft = getVoiceDraft();
      if (existingDraft) {
        await fetch(`/api/ads/${adId}/voices/${existingDraft.id}/activate`, {
          method: "POST",
          headers: { "x-session-id": sessionId },
        });
      }

      // Create new draft
      const res = await fetch(`/api/ads/${adId}/voices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          voiceTracks: [],
          createdBy: "user",
        }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/voices`);
        if (updated.ok) {
          setVoiceStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to create voice draft:", error);
    }
  };

  const handleCreateMusicDraft = async () => {
    try {
      const sessionId = localStorage.getItem('universal-session') || 'default-session';

      // If draft exists, activate it first (commits it as a version)
      const existingDraft = getMusicDraft();
      if (existingDraft) {
        await fetch(`/api/ads/${adId}/music/${existingDraft.id}/activate`, {
          method: "POST",
          headers: { "x-session-id": sessionId },
        });
      }

      // Create new draft
      const res = await fetch(`/api/ads/${adId}/music`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          musicPrompt: "",
          musicPrompts: { loudly: "", mubert: "", elevenlabs: "" },
          duration: 30,
          provider: "loudly",
          createdBy: "user",
        }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/music`);
        if (updated.ok) {
          setMusicStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to create music draft:", error);
    }
  };

  const handleCreateSfxDraft = async () => {
    try {
      const sessionId = localStorage.getItem('universal-session') || 'default-session';

      // If draft exists, activate it first (commits it as a version)
      const existingDraft = getSfxDraft();
      if (existingDraft) {
        await fetch(`/api/ads/${adId}/sfx/${existingDraft.id}/activate`, {
          method: "POST",
          headers: { "x-session-id": sessionId },
        });
      }

      // Create new draft
      const res = await fetch(`/api/ads/${adId}/sfx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          soundFxPrompts: [],
          createdBy: "user",
        }),
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/sfx`);
        if (updated.ok) {
          setSfxStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to create sfx draft:", error);
    }
  };

  // Handle drafts created callback from BriefPanelV3
  const handleDraftsCreated = async (draftIds: {
    voices?: string;
    music?: string;
    sfx?: string;
    adName?: string;
  }) => {
    console.log("✅ Drafts created:", draftIds);

    // Update ad name if returned
    if (draftIds.adName) {
      setAdName(draftIds.adName);
    }

    // Reload brief from Redis to ensure consistency
    // (generation endpoint persists the brief)
    const sessionId = localStorage.getItem('universal-session') || 'default-session';
    const metaRes = await fetch(`/api/ads?sessionId=${sessionId}`);
    if (metaRes.ok) {
      const data = await metaRes.json();
      const ad = data.ads.find((a: { adId: string }) => a.adId === adId);
      if (ad?.meta?.brief) {
        setBriefData(ad.meta.brief);
      }
    }

    // Reload all streams to show new drafts
    const [voicesRes, musicRes, sfxRes] = await Promise.all([
      fetch(`/api/ads/${adId}/voices`),
      fetch(`/api/ads/${adId}/music`),
      fetch(`/api/ads/${adId}/sfx`),
    ]);

    if (voicesRes.ok) {
      setVoiceStream(await voicesRes.json());
    }
    if (musicRes.ok) {
      setMusicStream(await musicRes.json());
    }
    if (sfxRes.ok) {
      setSfxStream(await sfxRes.json());
    }

    // Switch to Voice tab to show new draft
    setSelectedTab(1);
  };

  // Handle version deletion
  const handleDeleteVoice = async (versionId: VersionId) => {
    if (!confirm(`Delete voice version ${versionId}?`)) return;
    try {
      const res = await fetch(`/api/ads/${adId}/voices/${versionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/voices`);
        if (updated.ok) {
          setVoiceStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to delete voice version:", error);
    }
  };

  const handleDeleteMusic = async (versionId: VersionId) => {
    if (!confirm(`Delete music version ${versionId}?`)) return;
    try {
      const res = await fetch(`/api/ads/${adId}/music/${versionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/music`);
        if (updated.ok) {
          setMusicStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to delete music version:", error);
    }
  };

  const handleDeleteSfx = async (versionId: VersionId) => {
    if (!confirm(`Delete SFX version ${versionId}?`)) return;
    try {
      const res = await fetch(`/api/ads/${adId}/sfx/${versionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = await fetch(`/api/ads/${adId}/sfx`);
        if (updated.ok) {
          setSfxStream(await updated.json());
        }
      }
    } catch (error) {
      console.error("Failed to delete SFX version:", error);
    }
  };

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

      <div className="flex-1 overflow-auto bg-black">
        <div className="container mx-auto px-4 py-8">

          {/* Brief - Tab 0 */}
          {selectedTab === 0 && (
            <BriefPanelV3
              adId={adId}
              initialBrief={briefData}
              onDraftsCreated={handleDraftsCreated}
            />
          )}

          {/* Voice Versions - Tab 1 */}
          {selectedTab === 1 && voiceStream && (
            <div>
            <div className="flex items-center justify-end gap-2 mb-4">
              <button
                onClick={handleCreateVoiceDraft}
                className="px-4 py-2 text-sm bg-wb-blue/10 text-wb-blue border border-wb-blue/30 rounded-lg hover:bg-wb-blue/20 transition-colors"
              >
                + New Version
              </button>
            </div>

            {/* Voice Draft Editor - Wrapped in Accordion */}
            {getVoiceDraft() && (
              <DraftAccordion
                title={getVoiceDraft()!.id}
                type="voice"
                versionId={getVoiceDraft()!.id}
                onPlayAll={() => {
                  if (voicePlayAllRef.current) {
                    voicePlayAllRef.current();
                  }
                }}
                onSendToMixer={() => {
                  if (voiceSendToMixerRef.current) {
                    voiceSendToMixerRef.current();
                  }
                  // Issue #3 fix: Auto-switch to Mix tab after sending to mixer
                  setSelectedTab(4);
                }}
                hasTracksWithAudio={getVoiceDraft()!.version.voiceTracks.some(t => !!t.generatedUrl)}
              >
                <VoiceDraftEditor
                  adId={adId}
                  draftVersionId={getVoiceDraft()!.id}
                  draftVersion={getVoiceDraft()!.version}
                  onUpdate={async () => {
                    const updated = await fetch(`/api/ads/${adId}/voices`);
                    if (updated.ok) {
                      setVoiceStream(await updated.json());
                    }
                  }}
                  onPlayAllRef={voicePlayAllRef}
                  onSendToMixerRef={voiceSendToMixerRef}
                />
              </DraftAccordion>
            )}

            {voiceStream.versions.length === 0 ? (
              <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                No voice versions yet. Create your first version to get started.
              </div>
            ) : (
              <VersionAccordion
                versions={voiceStream.versions
                  .filter((vId) => voiceStream.versionsData[vId].status !== "draft")
                  .map((vId) => ({
                    id: vId,
                    ...(voiceStream.versionsData[vId] as VoiceVersion),
                  }))}
                activeVersionId={voiceStream.active}
                onActivate={handleActivateVoice}
                onPreview={handlePreview}
                onClone={handleCloneVoice}
                onDelete={handleDeleteVoice}
                hasAudio={(v) =>
                  (v as VoiceVersion).voiceTracks.some(t => !!t.generatedUrl) ||
                  // Legacy support
                  !!((v as VoiceVersion).generatedUrls && (v as VoiceVersion).generatedUrls!.length > 0)
                }
                renderContent={(version, isActive) => (
                  <VoiceVersionContent
                    version={version as VoiceVersion}
                    isActive={isActive}
                  />
                )}
              />
            )}
            </div>
          )}

          {/* Music Versions - Tab 2 */}
          {selectedTab === 2 && musicStream && (
            <div>
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={handleCreateMusicDraft}
                className="px-4 py-2 text-sm bg-wb-blue/10 text-wb-blue border border-wb-blue/30 rounded-lg hover:bg-wb-blue/20 transition-colors"
              >
                + New Version
              </button>
            </div>

            {/* Music Draft Editor - Wrapped in Accordion */}
            {getMusicDraft() && (
              <DraftAccordion
                title={getMusicDraft()!.id}
                type="music"
                versionId={getMusicDraft()!.id}
                onPlayAll={() => {
                  if (musicPlayAllRef.current) {
                    musicPlayAllRef.current();
                  }
                }}
                onSendToMixer={() => {
                  if (musicSendToMixerRef.current) {
                    musicSendToMixerRef.current();
                  }
                  setSelectedTab(4); // Switch to Mix tab
                }}
                hasTracksWithAudio={!!getMusicDraft()!.version.generatedUrl}
              >
                <MusicDraftEditor
                  adId={adId}
                  draftVersionId={getMusicDraft()!.id}
                  draftVersion={getMusicDraft()!.version}
                  onUpdate={async () => {
                    const updated = await fetch(`/api/ads/${adId}/music`);
                    if (updated.ok) {
                      setMusicStream(await updated.json());
                    }
                  }}
                  onPlayAllRef={musicPlayAllRef}
                  onSendToMixerRef={musicSendToMixerRef}
                />
              </DraftAccordion>
            )}

            {musicStream.versions.length === 0 ? (
              <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                No music versions yet. Create your first version to get started.
              </div>
            ) : (
              <VersionAccordion
                versions={musicStream.versions
                  .filter((vId) => musicStream.versionsData[vId].status !== "draft")
                  .map((vId) => ({
                    id: vId,
                    ...(musicStream.versionsData[vId] as MusicVersion),
                  }))}
                activeVersionId={musicStream.active}
                onActivate={handleActivateMusic}
                onPreview={handlePreview}
                onClone={handleCloneMusic}
                onDelete={handleDeleteMusic}
                hasAudio={(v) =>
                  !!(v as MusicVersion).generatedUrl &&
                  (v as MusicVersion).generatedUrl.length > 0
                }
                renderContent={(version, isActive) => (
                  <MusicVersionContent
                    version={version as MusicVersion}
                    isActive={isActive}
                  />
                )}
              />
            )}
            </div>
          )}

          {/* Sound FX Versions - Tab 3 */}
          {selectedTab === 3 && sfxStream && (
            <div>
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={handleCreateSfxDraft}
                className="px-4 py-2 text-sm bg-wb-blue/10 text-wb-blue border border-wb-blue/30 rounded-lg hover:bg-wb-blue/20 transition-colors"
              >
                + New Version
              </button>
            </div>

            {/* SFX Draft Editor - Wrapped in Accordion */}
            {getSfxDraft() && (
              <DraftAccordion
                title={getSfxDraft()!.id}
                type="sfx"
                versionId={getSfxDraft()!.id}
                onPlayAll={() => {
                  if (sfxPlayAllRef.current) {
                    sfxPlayAllRef.current();
                  }
                }}
                onSendToMixer={() => {
                  if (sfxSendToMixerRef.current) {
                    sfxSendToMixerRef.current();
                  }
                  setSelectedTab(4); // Switch to Mix tab
                }}
                hasTracksWithAudio={(getSfxDraft()!.version.generatedUrls?.length || 0) > 0}
              >
                <SfxDraftEditor
                  adId={adId}
                  draftVersionId={getSfxDraft()!.id}
                  draftVersion={getSfxDraft()!.version}
                  onUpdate={async () => {
                    const updated = await fetch(`/api/ads/${adId}/sfx`);
                    if (updated.ok) {
                      setSfxStream(await updated.json());
                    }
                  }}
                  onPlayAllRef={sfxPlayAllRef}
                  onSendToMixerRef={sfxSendToMixerRef}
                />
              </DraftAccordion>
            )}

            {sfxStream.versions.length === 0 ? (
              <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-400">
                No sound FX versions yet. Create your first version to get
                started.
              </div>
            ) : (
              <VersionAccordion
                versions={sfxStream.versions
                  .filter((vId) => sfxStream.versionsData[vId].status !== "draft")
                  .map((vId) => ({
                    id: vId,
                    ...(sfxStream.versionsData[vId] as SfxVersion),
                  }))}
                activeVersionId={sfxStream.active}
                onActivate={handleActivateSfx}
                onPreview={handlePreview}
                onClone={handleCloneSfx}
                onDelete={handleDeleteSfx}
                hasAudio={(v) =>
                  (v as SfxVersion).generatedUrls &&
                  (v as SfxVersion).generatedUrls.length > 0
                }
                renderContent={(version, isActive) => (
                  <SfxVersionContent
                    version={version as SfxVersion}
                    isActive={isActive}
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
        </div>
      </div>
    </div>
  );
}
