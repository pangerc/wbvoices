"use client";

import { SoundFxPanel } from "@/components/SoundFxPanel";
import { VersionIterationInput } from "@/components/ui";
import type { DraftState } from "@/components/ui/DraftAccordion";
import {
  sfxDraftState,
  useActiveVoicePreviews,
  useMixerOverriddenSlots,
  useSfxCues,
  useSfxGeneration,
} from "@/hooks/sfx-draft";
import { useDraftHeaderActions } from "@/hooks/use-draft-header-actions";
import { useSendToMixer } from "@/hooks/use-send-to-mixer";
import type { useStreamOperations } from "@/hooks/useStreamOperations";
import type { SfxVersion, VersionId } from "@/types/versions";
import React, { useEffect, useRef, useState } from "react";

export interface SfxDraftEditorProps {
  adId: string;
  draftVersionId: VersionId;
  draftVersion: SfxVersion;
  onUpdate: () => Promise<SfxVersion | undefined>;
  // Refs for parent to call header button actions
  onPlayAllRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onSendToMixerRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onRequestChangeRef?: React.MutableRefObject<(() => void) | null>;
  onNewBlankVersion?: () => void;
  // Voice stream data for SFX placement options (after voice X)
  voiceStream?: ReturnType<typeof useStreamOperations>;
  /** Ad duration in seconds (from brief/mixer) for slider max */
  adDuration?: number;
  /** Callback to notify parent of draft state changes (for badge rendering) */
  onDraftStateChange?: (state: DraftState) => void;
}

export function SfxDraftEditor({
  adId,
  draftVersionId,
  draftVersion,
  onUpdate,
  onPlayAllRef,
  onSendToMixerRef,
  onRequestChangeRef,
  onNewBlankVersion,
  voiceStream,
  adDuration: adDurationProp,
  onDraftStateChange,
}: SfxDraftEditorProps) {
  const adDuration = adDurationProp || 30;
  // Ref to expose VersionIterationInput's expand function
  const iterationExpandRef = useRef<(() => void) | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const {
    cues,
    urls,
    setUrls,
    save,
    flush,
    saving,
    updateCue,
    addCue,
    uploadCue,
    clearUpload,
    removeCue,
    resetCues,
  } = useSfxCues({ adId, draftVersionId, draftVersion, onUpdate });

  const { isGenerating, generatingPromptIndex, generateAll, playCue, playAll } =
    useSfxGeneration({
      adId,
      draftVersionId,
      cues,
      urls,
      setUrls,
      save,
      onUpdate,
      onStatus: setStatusMessage,
    });

  const sendToMixer = useSendToMixer({
    adId,
    stream: "sfx",
    versionId: draftVersionId,
    onUpdate,
    flush,
  });

  const voiceTrackPreviews = useActiveVoicePreviews(voiceStream);
  const { overriddenSlotIds, resetPlacement } = useMixerOverriddenSlots(adId);

  // Badge state from LOCAL state (not SWR props) for immediate feedback
  const draftState = sfxDraftState(cues, urls, isGenerating);

  useEffect(() => {
    onDraftStateChange?.(draftState);
  }, [draftState, onDraftStateChange]);

  const handleSendToMixer = async () => {
    const sent = await sendToMixer();
    setStatusMessage(sent ? "SFX sent to mixer!" : "Failed to send to mixer");
    return sent;
  };

  useDraftHeaderActions({
    onPlayAllRef,
    onSendToMixerRef,
    onRequestChangeRef,
    playAll,
    sendToMixer: handleSendToMixer,
    requestChange: () => iterationExpandRef.current?.(),
  });

  const handleResetPlacement = async (index: number) => {
    const slotId = cues[index]?.slotId;
    if (slotId) await resetPlacement(slotId);
  };

  const hasAllAudio =
    !!draftVersion.generatedUrls?.length &&
    draftVersion.generatedUrls.filter(Boolean).length >= cues.length;

  // Uploaded cues have no prompt for the AI to change; with nothing else,
  // there is nothing to ask for.
  const onlyUploads =
    cues.length > 0 && cues.every((cue) => cue.source === "upload");

  return (
    // `contents`: a hook for E2E to wait on saves, without a layout box.
    <div
      className="contents"
      data-testid="sfx-draft-editor"
      data-save-state={saving ? "saving" : "saved"}
    >
      <SoundFxPanel
        onGenerate={generateAll}
        isGenerating={isGenerating}
        statusMessage={statusMessage}
        soundFxPrompts={cues}
        onUpdatePrompt={updateCue}
        onRemovePrompt={removeCue}
        onAddPrompt={addCue}
        onUploadCue={uploadCue}
        onClearUpload={clearUpload}
        adId={adId}
        adDuration={adDuration}
        resetForm={resetCues}
        voiceTrackPreviews={voiceTrackPreviews}
        onPlayPrompt={playCue}
        generatingPromptIndex={generatingPromptIndex}
        generatedUrls={urls}
        mixerOverriddenSlotIds={overriddenSlotIds}
        onResetPlacement={handleResetPlacement}
      />
      <VersionIterationInput
        adId={adId}
        stream="sfx"
        parentVersionId={draftVersionId}
        onNewVersion={onUpdate}
        onNewBlankVersion={onNewBlankVersion}
        disabled={onlyUploads || !hasAllAudio}
        disabledReason={
          onlyUploads
            ? "Uploaded sound effects have no prompt to change"
            : "Generate all sound effects before requesting changes"
        }
        expandRef={iterationExpandRef}
      />
    </div>
  );
}
