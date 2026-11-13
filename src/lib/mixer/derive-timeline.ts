/**
 * Pure timeline derivation: pinned content + mixer version → where every
 * clip sits.
 *
 * This is the whole positioning path the mixer UI and the renderer see,
 * with no I/O:
 *
 *   pinned versions ──collect*──▶ MixerTrack[]
 *                   ──buildSlotStates + silentSlots──▶ SlotState[] ┐
 *   mixerVersion.anchors ──reconcileAnchors (drafts only)────────┴─▶ resolveTimeline
 *                   ──mapResolvedToCalculatedTracks──▶ calculatedTracks
 *
 * `rebuilder.ts` loads the inputs from Redis, calls `deriveTimeline`, and
 * persists the resolver cache; everything that decides a start time lives
 * here so it can be tested with plain objects.
 */

import {
  reconcileAnchors,
  slotIdForTrack,
  type PinnedVersions,
} from "@/lib/mixer/mixer-reconcile";
import {
  resolveTimeline,
  type ResolvedTimeline,
  type SlotState,
} from "@/services/timelineResolver";
import type {
  Anchor,
  CachedResolverOutput,
  ClipOverrides,
  MixerPins,
  MixerState,
  MixerTrack,
  MixerVersion,
  MusicVersion,
  SfxVersion,
  SlotId,
  VersionId,
  VoiceVersion,
} from "@/types/versions";

export interface TimelineInput {
  /** Version ids the mixer version pins — they become part of track ids. */
  pins: MixerPins;
  /** The content versions `pins` point at (slotIds already backfilled). */
  pinned: PinnedVersions;
  /** The mixer version: anchors, overrides, and (if frozen) a resolver cache. */
  mixerVersion: MixerVersion;
  /** Brief's ad duration: the resolver's over-budget horizon. */
  formatDuration?: number;
  /** Brief's language: picks the resolver's per-locale speedup cap. */
  locale?: string;
}

export interface DerivedTimeline {
  /** One entry per clip with audio, in voice → music → sfx order. */
  tracks: MixerTrack[];
  /** Resolved start/duration per track id — what the timeline renders. */
  calculatedTracks: MixerState["calculatedTracks"];
  /** Track-id keyed volumes projected from the slot-keyed overrides. */
  volumes: Record<string, number>;
  /** Raw resolver output (slot keyed, with warnings). */
  resolved: ResolvedTimeline;
  /** True when a frozen version's cached resolver output was reused. */
  usedCache: boolean;
}

/** Place every pinned clip on the timeline. */
export function deriveTimeline({
  pins,
  pinned,
  mixerVersion,
  formatDuration,
  locale,
}: TimelineInput): DerivedTimeline {
  const { voice, music, sfx } = pinned;
  // A draft's pinned streams change without a send (a voice line edited or
  // deleted in place), so its stored anchors can point at clips that are
  // gone. Reconciling here keeps every read in step with the content; a
  // frozen take keeps the anchors it was frozen with.
  const anchors =
    mixerVersion.status === "frozen"
      ? mixerVersion.anchors
      : reconcileAnchors(mixerVersion.anchors, pinned);
  const overrides = mixerVersion.overrides ?? {};

  const tracks: MixerTrack[] = [];
  if (voice && pins.voices) {
    collectVoiceTracks(voice, pins.voices, tracks, anchors, overrides);
  }
  if (music && pins.music) {
    collectMusicTrack(music, pins.music, tracks, anchors, overrides);
  }
  if (sfx && pins.sfx) {
    collectSfxTracks(sfx, pins.sfx, tracks, anchors, overrides);
  }

  // A frozen take's anchors, pins and overrides don't change, but the drafts
  // it pins can be edited in place (a line regenerated longer keeps its track
  // id). So its cached resolver output is reused only while every clip still
  // plays for as long as when it was cached (see cachedOutputMatches). Drafts
  // always resolve fresh: their anchors are reconciled on every read.
  const cache = mixerVersion.cachedResolverOutput;
  const usedCache =
    mixerVersion.status === "frozen" &&
    !!cache &&
    cachedOutputMatches(cache, tracks);
  const resolved = usedCache
    ? projectCachedOutputThroughTracks(cache!, tracks, pinned)
    : resolveTimeline({
        slots: [
          ...buildSlotStates(tracks, pinned, overrides),
          ...silentSlots(tracks, pinned),
        ],
        anchors,
        formatDuration,
        locale,
      });

  const calculatedTracks = mapResolvedToCalculatedTracks(
    resolved,
    tracks,
    pinned,
  );

  // Project per-slot overrides (the persisted form) back onto the track-id
  // keyed `volumes` map the client expects. Hydration in mixerStore uses the
  // track's own `volume` field as a fallback; passing volumes explicitly keeps
  // sliders correct even across re-renders where MixerPanel drops local state.
  const volumes = deriveVolumesByTrackId(tracks, overrides, pinned);
  for (const track of tracks) {
    const v = volumes[track.id];
    if (typeof v === "number") track.volume = v;
  }

  return { tracks, calculatedTracks, volumes, resolved, usedCache };
}

// ============ Resolver adapter ============

/**
 * Build `SlotState[]` — the resolver's input shape — from the mixer panel's
 * track list plus pinned stream versions. Each track maps to exactly one
 * slot; slot ids come from the content versions, trim comes from mixer
 * overrides.
 */
function buildSlotStates(
  tracks: MixerTrack[],
  pinned: PinnedVersions,
  overrides: Record<SlotId, ClipOverrides>,
): SlotState[] {
  const slots: SlotState[] = [];
  for (const track of tracks) {
    const slotId = slotOf(track, pinned);
    if (!slotId) continue; // Tracks without slot ids can't be resolved; skipped.
    slots.push({
      slotId,
      type: track.type,
      sourceDuration: track.duration ?? 0,
      trim: overrides[slotId]?.trim,
    });
  }
  return slots;
}

/**
 * Zero-length resolver slots for the pinned clips without audio yet: a line
 * whose text changed, a cue not generated. They aren't rendered, but what is
 * anchored to them still resolves, so a line without audio holds its place
 * in the sequence instead of sending everything after it to 0s.
 */
function silentSlots(
  tracks: MixerTrack[],
  pinned: PinnedVersions,
): SlotState[] {
  const audible = new Set(tracks.map((track) => slotOf(track, pinned)));
  const silent = (slotId: SlotId | undefined, type: SlotState["type"]) =>
    slotId && !audible.has(slotId) ? [{ slotId, type, sourceDuration: 0 }] : [];

  return [
    ...(pinned.voice?.voiceTracks ?? []).flatMap((t) =>
      silent(t.slotId, "voice"),
    ),
    ...(pinned.sfx?.soundFxPrompts ?? []).flatMap((p) =>
      silent(p.slotId, "soundfx"),
    ),
    ...silent(pinned.music?.slotId, "music"),
  ];
}

/**
 * Map resolver output back to the track-id-keyed `calculatedTracks` shape the
 * MixerPanel consumes today. Orphan slots (resolver returned nothing) are
 * silently dropped — they're already warned upstream via `resolved.warnings`.
 */
function mapResolvedToCalculatedTracks(
  resolved: ResolvedTimeline,
  tracks: MixerTrack[],
  pinned: PinnedVersions,
): MixerState["calculatedTracks"] {
  const bySlot = new Map(resolved.tracks.map((t) => [t.slotId, t]));
  const out: MixerState["calculatedTracks"] = [];
  for (const track of tracks) {
    const slotId = slotOf(track, pinned);
    if (!slotId) continue;
    const r = bySlot.get(slotId);
    if (!r) continue;
    out.push({
      id: track.id,
      startTime: r.startTime,
      duration: r.duration,
      type: track.type,
    });
  }
  return out;
}

/**
 * Decide whether a cached resolver output is still usable: the same tracks
 * (a strict multiset match on ids — the earlier cache-collapse bug left
 * every entry sharing one id), each still as long as when it was cached. A
 * take pins drafts that are edited in place, so a line regenerated longer
 * keeps its track id; positions cached before that would leave the clips
 * after it where they were.
 */
function cachedOutputMatches(
  cache: CachedResolverOutput,
  tracks: MixerTrack[],
): boolean {
  if (cache.calculatedTracks.length !== tracks.length) return false;

  const cachedById = new Map(cache.calculatedTracks.map((ct) => [ct.id, ct]));
  if (cachedById.size !== tracks.length) return false;

  return tracks.every((track) => {
    const cached = cachedById.get(track.id);
    return !!cached && Math.abs(cached.duration - playedDuration(track)) < 1e-3;
  });
}

/** How long a track plays: its trim window, else its full length. */
function playedDuration(track: MixerTrack): number {
  const trim = track.trim;
  if (trim && trim.end > trim.start) return trim.end - trim.start;
  return Math.max(0, track.duration ?? 0);
}

/**
 * Reconstruct a `ResolvedTimeline` from the cached flat shape so the rest
 * of the derive path can be uniform. `warnings` and `voiceActiveIntervals`
 * are left empty because the cache is the post-resolution view.
 */
function projectCachedOutputThroughTracks(
  cache: CachedResolverOutput,
  tracks: MixerTrack[],
  pinned: PinnedVersions,
): ResolvedTimeline {
  const bySlot: ResolvedTimeline["tracks"] = [];
  for (const ct of cache.calculatedTracks) {
    const track = tracks.find((t) => t.id === ct.id);
    if (!track) continue;
    const slotId = slotOf(track, pinned);
    if (!slotId) continue;
    bySlot.push({
      slotId,
      type: ct.type,
      startTime: ct.startTime,
      duration: ct.duration,
      resolvedFrom: null,
    });
  }
  return {
    tracks: bySlot,
    totalDuration: cache.totalDuration,
    warnings: [],
    voiceActiveIntervals: bySlot
      .filter((t) => t.type === "voice")
      .map((t) => ({ start: t.startTime, end: t.startTime + t.duration }))
      .sort((a, b) => a.start - b.start),
  };
}

/**
 * Rehydrate the track-id-keyed volumes map the MixerPanel consumes from the
 * slot-id-keyed overrides the mixer version persists.
 */
function deriveVolumesByTrackId(
  tracks: MixerTrack[],
  overrides: Record<string, { volume?: number }>,
  pinned: PinnedVersions,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const track of tracks) {
    const slotId = slotOf(track, pinned);
    if (!slotId) continue;
    const v = overrides[slotId]?.volume;
    if (typeof v === "number") map[track.id] = v;
  }
  return map;
}

function slotOf(track: MixerTrack, pinned: PinnedVersions): SlotId | null {
  return slotIdForTrack(track, pinned.voice, pinned.music, pinned.sfx);
}

/**
 * Extract the referenced slot id from an anchor, or undefined if the
 * anchor is absolute / missing. Powers the client's cycle-prevention
 * check in `anchorFromDrop`.
 */
function refSlotFromAnchor(anchor?: Anchor): SlotId | undefined {
  if (!anchor) return undefined;
  if (anchor.kind === "absolute") return undefined;
  return anchor.slotId;
}

// ============ Track collection ============

function collectVoiceTracks(
  voiceVersion: VoiceVersion,
  voiceVersionId: VersionId,
  tracks: MixerTrack[],
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>,
): void {
  const hasAudio =
    voiceVersion.voiceTracks.some((t) => !!t.generatedUrl) ||
    (voiceVersion.generatedUrls && voiceVersion.generatedUrls.length > 0);
  if (!hasAudio) return;

  voiceVersion.voiceTracks.forEach((voiceTrack, index) => {
    const url = voiceTrack.generatedUrl || voiceVersion.generatedUrls?.[index];
    if (!url) return;

    tracks.push({
      id: `voice-${voiceVersionId}-${index}`,
      slotId: voiceTrack.slotId,
      anchorOrigin: voiceTrack.slotId
        ? anchors[voiceTrack.slotId]?.origin
        : undefined,
      integratedLufs: voiceVersion.integratedLufs?.[index] ?? undefined,
      anchorRefSlotId: voiceTrack.slotId
        ? refSlotFromAnchor(anchors[voiceTrack.slotId]?.anchor)
        : undefined,
      trim: voiceTrack.slotId ? overrides[voiceTrack.slotId]?.trim : undefined,
      url,
      type: "voice",
      label: voiceTrack.voice?.name || `Voice ${index + 1}`,
      duration:
        voiceTrack.generatedDuration ?? estimateVoiceDuration(voiceTrack.text),
      playAfter: voiceTrack.playAfter,
      overlap: voiceTrack.overlap,
      isConcurrent: voiceTrack.isConcurrent,
      metadata: {
        voiceId: voiceTrack.voice?.id,
        voiceProvider: voiceTrack.trackProvider || voiceTrack.voice?.provider,
        scriptText: voiceTrack.text,
      },
    });
  });
}

function collectMusicTrack(
  musicVersion: MusicVersion,
  musicVersionId: VersionId,
  tracks: MixerTrack[],
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>,
): void {
  if (!musicVersion.generatedUrl) return;

  let label: string;
  if (musicVersion.provider === "custom") {
    label = musicVersion.musicPrompt || "Custom track";
  } else {
    const providerLabel =
      musicVersion.provider.charAt(0).toUpperCase() +
      musicVersion.provider.slice(1);
    const promptPreview = musicVersion.musicPrompt
      ? ` - ${musicVersion.musicPrompt.substring(0, 25)}${musicVersion.musicPrompt.length > 25 ? "..." : ""}`
      : "";
    label = `${providerLabel}${promptPreview}`;
  }

  tracks.push({
    id: `music-${musicVersionId}`,
    slotId: musicVersion.slotId,
    anchorOrigin: musicVersion.slotId
      ? anchors[musicVersion.slotId]?.origin
      : undefined,
    integratedLufs: musicVersion.integratedLufs ?? undefined,
    anchorRefSlotId: musicVersion.slotId
      ? refSlotFromAnchor(anchors[musicVersion.slotId]?.anchor)
      : undefined,
    trim: musicVersion.slotId
      ? overrides[musicVersion.slotId]?.trim
      : undefined,
    url: musicVersion.generatedUrl,
    type: "music",
    label,
    duration: musicVersion.duration,
    metadata: {
      promptText: musicVersion.musicPrompt,
      source: musicVersion.provider,
    },
  });
}

function collectSfxTracks(
  sfxVersion: SfxVersion,
  sfxVersionId: VersionId,
  tracks: MixerTrack[],
  anchors: MixerVersion["anchors"],
  overrides: Record<SlotId, ClipOverrides>,
): void {
  if (sfxVersion.generatedUrls.length === 0) return;

  sfxVersion.soundFxPrompts.forEach((sfxPrompt, index) => {
    const url = sfxVersion.generatedUrls[index];
    if (!url) return;

    tracks.push({
      id: `sfx-${sfxVersionId}-${index}`,
      slotId: sfxPrompt.slotId,
      anchorOrigin: sfxPrompt.slotId
        ? anchors[sfxPrompt.slotId]?.origin
        : undefined,
      integratedLufs: sfxVersion.integratedLufs?.[index] ?? undefined,
      anchorRefSlotId: sfxPrompt.slotId
        ? refSlotFromAnchor(anchors[sfxPrompt.slotId]?.anchor)
        : undefined,
      trim: sfxPrompt.slotId ? overrides[sfxPrompt.slotId]?.trim : undefined,
      url,
      type: "soundfx",
      label: sfxPrompt.description.substring(0, 50),
      duration: sfxPrompt.duration,
      playAfter: sfxPrompt.playAfter,
      overlap: sfxPrompt.overlap,
      metadata: {
        promptText: sfxPrompt.description,
        originalDuration: sfxPrompt.duration,
        placementIntent: sfxPrompt.placement,
      },
    });
  });
}

/**
 * Word-count heuristic fallback. Applies only to legacy voice versions that
 * lack a measured `generatedDuration`. The backfill script is the primary
 * cure; this survives for stragglers that never get backfilled.
 */
function estimateVoiceDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5;
  const estimatedDuration = words / wordsPerSecond;
  return Math.max(1, estimatedDuration + 1);
}
