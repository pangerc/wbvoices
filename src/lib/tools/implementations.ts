import {
  SearchVoicesParams,
  SearchVoicesResult,
  CreateVoiceDraftParams,
  CreateMusicDraftParams,
  CreateSfxDraftParams,
  ReadAdStateParams,
  SetAdTitleParams,
  SetAdTitleResult,
  DraftCreationResult,
  ReadAdStateResult,
  VoiceHistorySummary,
  ParentVersionRef,
  SlotReconciliation,
  AnchorInput,
} from "./types";
import { reconcileSlots } from "./slotReconciliation";
import { translateAnchorInput, type OrdinalRefs } from "./anchorTranslation";
import { voiceCatalogue } from "@/services/voiceCatalogueService";
import {
  synthesizeMetadata,
  voiceMatchesFilters,
} from "@/services/voiceMetadataSynthesis";
import {
  createVersion,
  listVersions,
  getVersion,
  getAllVersionsWithData,
  setAdMetadata,
  getAdMetadata,
  updateVersion,
  getActiveVersion,
  writeTagLintTelemetry,
} from "@/lib/redis/versions";
import { weaveTagsForElevenlabsTrack } from "./validation/tag-weaver";
import {
  lintVoiceTracks,
  buildWeaverRetryFeedback,
  type LintViolation,
} from "./validation/voice-tag-lint";
import { withAdLock } from "@/lib/redis/adLock";
import type {
  Language,
  Provider,
  Voice,
  VoiceTrack,
  MusicProvider,
  SoundFxPlacementIntent,
} from "@/types";
import type {
  Anchor,
  VoiceVersion,
  MusicVersion,
  SfxVersion,
  VersionId,
  StreamType,
} from "@/types/versions";
import type { KnowledgeContext } from "@/lib/knowledge/types";

/**
 * Reconcile the inherited knowledge context with what the LLM actually cast.
 *
 * The parent version's snapshot might say `{language: "en", voiceProvider:
 * "elevenlabs"}` but the iteration re-cast in Japanese OpenAI — keeping the
 * stale inheritance would make the next iteration load the wrong provider
 * module + wrong language from day one. Brief-level axes (pacing, format,
 * region) stay inherited — those aren't encoded in the tracks.
 */
function reconcileContextFromTracks(
  inherited: KnowledgeContext,
  tracks: VoiceTrack[],
): KnowledgeContext {
  const first = tracks[0]?.voice;
  if (!first) return inherited;

  const next: KnowledgeContext = { ...inherited };
  if (first.language) next.language = first.language;
  if (first.provider) next.voiceProvider = first.provider;
  if (
    first.accent &&
    first.accent !== "neutral" &&
    first.accent !== "standard"
  ) {
    next.accent = first.accent;
  }
  return next;
}

/**
 * Freeze any existing draft in a stream before creating a new one.
 * This ensures only one draft exists at a time.
 */
async function freezeExistingDraft(
  adId: string,
  streamType: StreamType,
): Promise<void> {
  const versions = await listVersions(adId, streamType);
  for (const vId of versions) {
    const version = await getVersion(adId, streamType, vId);
    if (version?.status === "draft") {
      await updateVersion(adId, streamType, vId, { status: "frozen" });
      console.log(`🧊 Froze ${streamType} draft ${vId} for ad ${adId}`);
      // No break - freeze ALL existing drafts to ensure only one draft exists
    }
  }
}

/**
 * Resolve the parent version id for a new draft.
 *
 * - explicit VersionId: use it (caller is forking a specific version).
 * - explicit null: no parent — fresh slate, fresh slot ids.
 * - undefined (default): auto-infer — the most recent frozen version in the stream,
 *   or null if none exists (first-ever draft in this stream).
 *
 * Call this AFTER `freezeExistingDraft` so the previous draft is included in the
 * "most recent frozen" lookup.
 */
async function resolveParentVersionId(
  adId: string,
  streamType: StreamType,
  explicit: ParentVersionRef,
): Promise<VersionId | null> {
  if (explicit === null) return null;
  if (typeof explicit === "string") return explicit;

  const versions = await listVersions(adId, streamType);
  for (let i = versions.length - 1; i >= 0; i--) {
    const vId = versions[i];
    const data = await getVersion(adId, streamType, vId);
    if (data?.status === "frozen") return vId;
  }
  return null;
}

/**
 * Helper to extract the parent slot id array for a given stream.
 * Returns null when there's no parent version or the stream has no slot concept here.
 */
async function loadParentSlotIds(
  adId: string,
  streamType: "voices" | "sfx",
  parentVersionId: VersionId | null,
): Promise<Array<string | undefined> | null> {
  if (!parentVersionId) return null;
  const data = await getVersion(adId, streamType, parentVersionId);
  if (!data) return null;
  if (streamType === "voices") {
    return (data as VoiceVersion).voiceTracks.map((t) => t.slotId);
  }
  // sfx
  return (data as SfxVersion).soundFxPrompts.map((p) => p.slotId);
}

/**
 * Build the OrdinalRefs lookup table used to translate LLM ordinal-form anchor
 * inputs ("voice-0", "sfx-2", "music") into slot-id-form Anchors.
 *
 * Uses currently-active stream versions for cross-stream refs (sfx-to-voice,
 * music-to-voice). Callers pass their own draft's slot ids as `overrides` so
 * intra-stream refs ("voice-0" within a new voice draft) resolve correctly.
 */
async function loadOrdinalRefs(
  adId: string,
  overrides: Partial<OrdinalRefs>,
): Promise<OrdinalRefs> {
  const refs: OrdinalRefs = { ...overrides };

  // Voice refs — for cross-stream anchors (sfx/music referencing voices).
  if (!refs.voices) {
    const activeVoiceId = await getActiveVersion(adId, "voices");
    if (activeVoiceId) {
      const voiceVersion = (await getVersion(
        adId,
        "voices",
        activeVoiceId,
      )) as VoiceVersion | null;
      if (voiceVersion) {
        refs.voices = voiceVersion.voiceTracks.map((t) => t.slotId);
      }
    }
  }

  // SFX refs — rare cross-stream use; only loaded when explicitly requested.
  if (!refs.sfx) {
    const activeSfxId = await getActiveVersion(adId, "sfx");
    if (activeSfxId) {
      const sfxVersion = (await getVersion(
        adId,
        "sfx",
        activeSfxId,
      )) as SfxVersion | null;
      if (sfxVersion) {
        refs.sfx = sfxVersion.soundFxPrompts.map((p) => p.slotId);
      }
    }
  }

  // Music refs — at most one slot id.
  if (!refs.music) {
    const activeMusicId = await getActiveVersion(adId, "music");
    if (activeMusicId) {
      const musicVersion = (await getVersion(
        adId,
        "music",
        activeMusicId,
      )) as MusicVersion | null;
      if (musicVersion?.slotId) refs.music = musicVersion.slotId;
    }
  }

  return refs;
}

/**
 * Attempt to translate an LLM-supplied AnchorInput to slot-id form. Silently
 * returns undefined when the ordinal reference can't be resolved — caller's
 * legacy fields remain the source of truth for positioning.
 */
function safeTranslateAnchor(
  input: AnchorInput | undefined,
  refs: OrdinalRefs,
): Anchor | undefined {
  if (!input) return undefined;
  const translated = translateAnchorInput(input, refs);
  if (!translated) {
    console.warn(
      `[anchor-translate] Unresolvable trackRef in anchor input: ${JSON.stringify(input)}`,
    );
    return undefined;
  }
  return translated;
}

/**
 * Stable 32-bit FNV-1a hash of a string. Used as the shuffle seed so the
 * same (adId, provider, language) tuple always produces the same voice
 * ordering — re-runs of the same ad stay reproducible, different ads get
 * different pools.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 PRNG — small, fast, seedable. Good enough for shuffling a
 * voice list; we don't need cryptographic quality here.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle with a seeded PRNG. Returns a new array.
 */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Stable two-tier sort that pushes ElevenLabs multilingual voices
 * after language-native voices in the candidate pool. Preserves the
 * seeded-shuffle ordering within each tier, so casting is still
 * deterministic per ad but the agent's top-N candidates shift toward
 * voices actually trained on the requested language.
 *
 * Counts as multilingual when the catalogue marks
 * `capabilities.isMultilingual === true` (set during ingest from
 * ElevenLabs' `verified_languages.length > 1`). For non-ElevenLabs
 * providers and ElevenLabs single-language voices, the flag is false
 * and they sort first as natives.
 */
function stableSortByMultilingual<
  T extends { voice: { capabilities?: { isMultilingual?: boolean } } },
>(items: readonly T[]): T[] {
  const natives: T[] = [];
  const multilinguals: T[] = [];
  for (const item of items) {
    if (item.voice.capabilities?.isMultilingual) {
      multilinguals.push(item);
    } else {
      natives.push(item);
    }
  }
  return natives.concat(multilinguals);
}

/**
 * Search voices from the voice catalogue.
 *
 * Shuffling: when an `adId` is present (server-injected by the executor),
 * the filtered pool is shuffled with `hash(adId + provider + language +
 * gender + accent)` before slicing. This breaks the previous "first-N from
 * provider cache" ordering that caused the LLM to gravitate to the same
 * voices across ads. Shuffles are stable per seed, so a retry on the same
 * ad surfaces the same pool (mixer reproducibility).
 *
 * Without `adId` (direct calls, tests, or legacy callers) we fall back to
 * the old deterministic slice.
 */
export async function searchVoices(
  params: SearchVoicesParams,
): Promise<SearchVoicesResult> {
  const {
    provider,
    language,
    gender,
    accent,
    count = 10,
    adId,
    age_bracket,
    energy,
    warmth,
    pace_tendency,
    use_case,
    dialect_register,
  } = params;

  // Get voices from catalogue for the specified provider
  const allVoices = await voiceCatalogue.getVoicesForProvider(
    provider as Provider,
    language as Language,
    accent,
    true, // requireApproval
  );

  // Filter by gender if specified
  const filteredByGender = gender
    ? allVoices.filter((v) => v.gender.toLowerCase() === gender.toLowerCase())
    : allVoices;

  // Structured-metadata filter. Voices with missing data on a requested axis
  // pass through — see voiceMetadataSynthesis.ts rationale.
  const semanticFilters = {
    age_bracket,
    energy,
    warmth,
    pace_tendency,
    use_case,
    dialect_register,
  };
  const anyFilter = Object.values(semanticFilters).some(Boolean);

  const withMetadata = filteredByGender.map((v) => ({
    voice: v,
    metadata: synthesizeMetadata(v),
  }));

  const filtered = anyFilter
    ? withMetadata.filter((x) =>
        voiceMatchesFilters(x.metadata, semanticFilters),
      )
    : withMetadata;

  // Seed the shuffle on the full filter tuple so changing any filter dimension
  // changes the ordering — otherwise an LLM that progressively narrows filters
  // would keep seeing the same top voices from its first (broad) search.
  const shuffled = adId
    ? seededShuffle(
        filtered,
        fnv1a32(
          [
            adId,
            provider,
            language,
            gender ?? "",
            accent ?? "",
            age_bracket ?? "",
            energy ?? "",
            warmth ?? "",
            pace_tendency ?? "",
            use_case ?? "",
            dialect_register ?? "",
          ].join("|"),
        ),
      )
    : filtered;

  // Rank language-native voices ahead of multilinguals. ElevenLabs
  // multilingual voices (Belma, Sara, etc.) get registered for every
  // language in their `verified_languages` array — same externalId, 19+
  // language slots. They genuinely speak all of them, but they speak
  // them with the creator's underlying acoustic identity, which means
  // they gravitate to the top of every language's shuffled pool and
  // become the agent's "go-to" pick. Surface natives first; the
  // multilingual voices are still in the result set, just lower.
  // Stable two-tier sort preserves the seeded shuffle order within
  // each tier so the same brief still gets the same casting.
  const ordered = stableSortByMultilingual(shuffled);

  const selected = ordered.slice(0, count);

  const enriched = selected.map(({ voice: v, metadata: m }) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    style: v.styles?.join(", "),
    description: v.personality,
    provider: v.provider,
    age_bracket: m.age_bracket,
    energy: m.energy,
    warmth: m.warmth,
    pace_tendency: m.pace_tendency,
    use_case: m.use_case,
    dialect_register: m.dialect_register,
    casting_note: m.casting_note,
  }));

  // Auto-broaden when narrow filters returned an empty pool. Returning
  // an empty result + a "try broader filters" suggestion was an open
  // invitation for the agent to burn another iteration on the same
  // search. Recover server-side: drop the semantic filters first, then
  // accent if still empty, return whatever the broader pool surfaces
  // with a `broadened_from` note so the agent can see what we relaxed.
  if (enriched.length === 0 && (anyFilter || accent || gender)) {
    const broadened: string[] = [];
    let pool = withMetadata;

    if (anyFilter) {
      broadened.push("semantic filters");
      // pool is already the un-semantic-filtered set when we reset to withMetadata
    }
    if (pool.length === 0 && accent) {
      broadened.push("accent");
      const reAll = await voiceCatalogue.getVoicesForProvider(
        provider as Provider,
        language as Language,
        undefined,
        true,
      );
      const reGender = gender
        ? reAll.filter((v) => v.gender.toLowerCase() === gender.toLowerCase())
        : reAll;
      pool = reGender.map((v) => ({
        voice: v,
        metadata: synthesizeMetadata(v),
      }));
    }
    if (pool.length === 0 && gender) {
      broadened.push("gender");
      const reAll = await voiceCatalogue.getVoicesForProvider(
        provider as Provider,
        language as Language,
        undefined,
        true,
      );
      pool = reAll.map((v) => ({ voice: v, metadata: synthesizeMetadata(v) }));
    }

    const shuffledBroad = adId
      ? seededShuffle(
          pool,
          fnv1a32([adId, provider, language, "broadened"].join("|")),
        )
      : pool;
    const orderedBroad = stableSortByMultilingual(shuffledBroad);
    const broadSelected = orderedBroad.slice(0, count);
    const broadEnriched = broadSelected.map(({ voice: v, metadata: m }) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      gender: v.gender,
      accent: v.accent,
      style: v.styles?.join(", "),
      description: v.personality,
      provider: v.provider,
      age_bracket: m.age_bracket,
      energy: m.energy,
      warmth: m.warmth,
      pace_tendency: m.pace_tendency,
      use_case: m.use_case,
      dialect_register: m.dialect_register,
      casting_note: m.casting_note,
    }));

    return {
      voices: broadEnriched,
      count: broadEnriched.length,
      broadened_from: broadened,
    };
  }

  return {
    voices: enriched,
    count: enriched.length,
  };
}

/**
 * Create voice draft in Redis.
 *
 * Wrapped in a per-ad lock so concurrent LLM calls on the same ad can't each
 * see "no draft" and then both create one — the `freezeExistingDraft` →
 * `createVersion` sequence isn't atomic on its own.
 */
export async function createVoiceDraft(
  params: CreateVoiceDraftParams,
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createVoiceDraftLocked(params));
}

async function createVoiceDraftLocked(
  params: CreateVoiceDraftParams,
): Promise<DraftCreationResult> {
  const {
    adId,
    tracks,
    parentVersionId: explicitParent,
    knowledgeContext: explicitContext,
  } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "voices");

  // Resolve parent lineage + inherit slot ids by ordinal match
  const parentVersionId = await resolveParentVersionId(
    adId,
    "voices",
    explicitParent,
  );
  const parentSlotIds = await loadParentSlotIds(
    adId,
    "voices",
    parentVersionId,
  );

  // Resolve context snapshot: explicit context wins (agent-executor injection on the
  // first version from the brief, or iteration with explicit overrides). Otherwise
  // inherit from the parent version's snapshot. Leaves undefined on fresh ads with
  // no parent and no injected context (legacy path).
  let snapshotContext = explicitContext;
  if (!snapshotContext && parentVersionId) {
    const parent = (await getVersion(
      adId,
      "voices",
      parentVersionId,
    )) as VoiceVersion | null;
    snapshotContext = parent?.knowledgeContext;
  }
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotIds,
    tracks.length,
    "voices",
    parentVersionId,
  );

  // Ordinal refs for anchor translation — voices table is this draft's own slot
  // ids (so "voice-N" ordinal refs resolve to the draft we're building).
  const ordinalRefs = await loadOrdinalRefs(adId, { voices: slotIds });

  // Resolve voice IDs to full Voice objects from catalogue. We pass the
  // provider + language hint so the resolver can fall back to externalId
  // matching when the LLM passes a bare provider-native name (common for
  // OpenAI voices like "alloy"/"nova" which are stored under synthesized
  // ids like "alloy-ja" but accept the bare name at TTS time).
  const resolvedTracks = await Promise.all(
    tracks.map(async (track, index) => {
      const catalogueVoice = await voiceCatalogue.getVoiceById(track.voiceId, {
        provider: track.provider as Provider | undefined,
        language: track.language,
      });

      // Log when lookup fails for debugging
      if (!catalogueVoice) {
        console.warn(
          `⚠️ Voice catalogue lookup failed for ID: ${track.voiceId}. Fallback: language=${track.language}, provider=${track.provider}`,
        );
      }

      // Use catalogue voice if found, otherwise fallback to minimal object
      // Map UnifiedVoice fields to Voice type
      // Note: UnifiedVoice.gender includes "neutral" but Voice.gender doesn't
      const mapGender = (
        g: "male" | "female" | "neutral",
      ): "male" | "female" | null => (g === "neutral" ? null : g);

      const voice: Voice = catalogueVoice
        ? {
            id: catalogueVoice.id,
            externalId: catalogueVoice.externalId,
            name: catalogueVoice.name,
            gender: mapGender(catalogueVoice.gender),
            language: catalogueVoice.language,
            accent: catalogueVoice.accent,
            provider: catalogueVoice.provider,
            style:
              catalogueVoice.styles?.join(", ") || catalogueVoice.personality,
            description: catalogueVoice.personality,
          }
        : {
            id: track.voiceId,
            name: track.voiceId, // Fallback if not found
            gender: null,
            // Preserve language context from LLM params
            language: track.language as Language | undefined,
            accent: track.accent,
            provider: track.provider as Voice["provider"],
          };

      const anchor = safeTranslateAnchor(track.anchor, ordinalRefs);

      return {
        slotId: slotIds[index],
        ...(anchor ? { anchor } : {}),
        voice,
        text: track.text,
        playAfter:
          track.playAfter || (index === 0 ? "start" : `track-${index - 1}`),
        overlap: track.overlap ?? 0,
        speed: 1.0,
        // Provider-specific fields
        description: track.description, // ElevenLabs baseline tone
        voiceInstructions: track.voiceInstructions, // OpenAI/Lahajati/ByteDance voice guidance
        dialectId: track.dialectId, // Lahajati Arabic dialect ID
        performanceId: track.performanceId, // Lahajati performance style ID
        emotion: track.emotion, // ByteDance TTS 2.0 emotion tag
      };
    }),
  );

  // Track-derived reconciliation: the LLM may have cast voices in a new
  // language, provider, or accent (e.g. "redo this in Japanese with OpenAI
  // voices"). The inherited snapshot from the parent version is stale for
  // those axes — update them from the actual resolved tracks so downstream
  // iteration reads the right provider module and the right language.
  // Brief-level axes (pacing, campaignFormat, region) stay inherited.
  const finalContext = snapshotContext
    ? reconcileContextFromTracks(snapshotContext, resolvedTracks)
    : undefined;

  // Stage N (pass-2 tag-weaver) + Stage L (mechanical lint) for ElevenLabs
  // voice tracks. Pass 1 wrote the script clean; this layer weaves V3
  // emotional + non-verbal tags into each line using the cast voice's
  // metadata, then validates the mechanical bare-minimums (accent tag
  // present when enforced, opening stack ≤ 8, syntax well-formed). Other
  // providers (OpenAI, Lahajati, ByteDance, Qwen, Lovo) skip both passes
  // — they have their own delivery-control mechanisms and don't speak V3
  // tags.
  const wovenTracks = await runTagWeaverPass(resolvedTracks, finalContext);
  const lintResult = await runTagLintWithRetry(
    wovenTracks,
    resolvedTracks,
    finalContext,
  );

  const voiceVersion: VoiceVersion = {
    voiceTracks: lintResult.tracks,
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
    ...(finalContext ? { knowledgeContext: finalContext } : {}),
    ...(lintResult.warnings.length
      ? { tagLintWarnings: lintResult.warnings }
      : {}),
  };

  // Create draft version in Redis
  const versionId = await createVersion(adId, "voices", voiceVersion);

  // Telemetry — fire-and-forget so a Redis hash write hiccup never blocks
  // the draft. We log on failure but otherwise don't propagate.
  void writeTagLintTelemetry(adId, versionId, lintResult.telemetry).catch(
    (err) => {
      console.warn(
        `[tag-lint] telemetry write failed for ${adId}/${versionId}:`,
        err instanceof Error ? err.message : err,
      );
    },
  );

  return slotReportedResult(adId, versionId, report);
}

/**
 * Run the Stage N pass-2 tag-weaver across resolved tracks. Only
 * ElevenLabs tracks go through the weaver — all other providers pass
 * through unchanged. Weaver calls fan out in parallel via Promise.all
 * since each line is independent; total wall-clock is the slowest call,
 * not the sum.
 */
async function runTagWeaverPass(
  tracks: VoiceTrack[],
  context: KnowledgeContext | undefined,
): Promise<VoiceTrack[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (track.voice?.provider !== "elevenlabs") return track;
      const result = await weaveTagsForElevenlabsTrack(
        track.text,
        track.voice,
        context,
      );
      console.log(
        `[tag-weaver] track=${track.slotId ?? "?"} provider=elevenlabs ok=${result.ok} latency=${result.latencyMs}ms${result.fallbackReason ? ` fallback=${result.fallbackReason}` : ""}`,
      );
      return result.ok ? { ...track, text: result.text } : track;
    }),
  );
}

interface LintRetryOutcome {
  tracks: VoiceTrack[];
  telemetry: ReturnType<typeof lintVoiceTracks>["telemetry"];
  warnings: LintViolation[];
}

/**
 * Run Stage L mechanical lint, retry the weaver once per failing track
 * with the lint complaint folded in, and accept the second attempt with
 * warnings if it still fails. Never blocks generation.
 */
async function runTagLintWithRetry(
  wovenTracks: VoiceTrack[],
  originalResolvedTracks: VoiceTrack[],
  context: KnowledgeContext | undefined,
): Promise<LintRetryOutcome> {
  const firstPass = lintVoiceTracks(
    wovenTracks.map((t) => ({ text: t.text, voice: t.voice })),
  );
  if (firstPass.ok) {
    logLintSummary(firstPass.telemetry, /*retried*/ false);
    return {
      tracks: wovenTracks,
      telemetry: firstPass.telemetry,
      warnings: [],
    };
  }

  // Group violations by track for targeted retry.
  const violationsByTrack = new Map<number, LintViolation[]>();
  for (const v of firstPass.violations) {
    const list = violationsByTrack.get(v.trackIndex) ?? [];
    list.push(v);
    violationsByTrack.set(v.trackIndex, list);
  }

  const retried = await Promise.all(
    wovenTracks.map(async (track, idx) => {
      const myViolations = violationsByTrack.get(idx);
      if (!myViolations || track.voice?.provider !== "elevenlabs") return track;
      const feedback = buildWeaverRetryFeedback(myViolations);
      const sourceText = originalResolvedTracks[idx]?.text ?? track.text;
      const result = await weaveTagsForElevenlabsTrack(
        sourceText,
        track.voice,
        context,
        { lintFeedback: feedback },
      );
      console.log(
        `[tag-weaver] retry track=${track.slotId ?? idx} ok=${result.ok} latency=${result.latencyMs}ms`,
      );
      return result.ok ? { ...track, text: result.text } : track;
    }),
  );

  const secondPass = lintVoiceTracks(
    retried.map((t) => ({ text: t.text, voice: t.voice })),
  );
  logLintSummary(secondPass.telemetry, /*retried*/ true);

  return {
    tracks: retried,
    telemetry: secondPass.telemetry,
    warnings: secondPass.violations,
  };
}

function logLintSummary(
  telemetry: ReturnType<typeof lintVoiceTracks>["telemetry"],
  retried: boolean,
): void {
  for (const e of telemetry) {
    console.log(
      `[tag-lint] track=${e.trackIndex} pass=${e.lintPassed}${retried ? " retried=true" : ""} opening=${e.openingStackSize} body=${e.bodyTags} accent=${e.accentPresent}${e.violations.length ? ` violations=${e.violations.join(",")}` : ""}`,
    );
  }
}

/**
 * Create music draft in Redis. See createVoiceDraft for the lock rationale.
 */
export async function createMusicDraft(
  params: CreateMusicDraftParams,
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createMusicDraftLocked(params));
}

async function createMusicDraftLocked(
  params: CreateMusicDraftParams,
): Promise<DraftCreationResult> {
  const {
    adId,
    prompt,
    elevenlabs,
    loudly,
    mubert,
    provider = "elevenlabs",
    duration,
    parentVersionId: explicitParent,
    anchor: anchorInput,
  } = params;

  // Always enforce a buffer between brief duration and music duration —
  // the LLM routinely produces over-budget scripts (asks for 20s, writes
  // 23s), and music shorter than the voice tracks drops out mid-line.
  // Floor is `briefDuration + 10s` regardless of what the LLM passed,
  // and at least 30s in absolute terms so very short briefs still get a
  // mixable bed. The LLM-supplied duration becomes a CEILING — when it
  // asked for longer, we honor it; when it asked for shorter, we ignore.
  const meta = await getAdMetadata(adId);
  const briefDuration = meta?.brief?.adDuration || 30;
  const minimumMusicDuration = Math.max(30, briefDuration + 10);
  const effectiveDuration = Math.max(duration ?? 0, minimumMusicDuration);
  if (duration && duration < minimumMusicDuration) {
    console.log(
      `[create_music_draft] LLM asked for ${duration}s but bumping to ${effectiveDuration}s (brief=${briefDuration}s, +10s buffer for script overrun)`,
    );
  } else if (!duration) {
    console.log(
      `[create_music_draft] Derived duration ${effectiveDuration}s from brief (ad: ${briefDuration}s)`,
    );
  }

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "music");

  // Resolve parent lineage. Music has exactly one slot per version; carry its id forward.
  const parentVersionId = await resolveParentVersionId(
    adId,
    "music",
    explicitParent,
  );
  let parentSlotId: string | undefined;
  if (parentVersionId) {
    const parent = (await getVersion(
      adId,
      "music",
      parentVersionId,
    )) as MusicVersion | null;
    parentSlotId = parent?.slotId;
  }
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotId ? [parentSlotId] : parentVersionId ? [undefined] : null,
    1,
    "music",
    parentVersionId,
  );

  // Anchor translation — music mostly references voices for ducking / swell.
  const ordinalRefs = await loadOrdinalRefs(adId, { music: slotIds[0] });
  const anchor = safeTranslateAnchor(anchorInput, ordinalRefs);

  // Use provider-specific prompts if provided, otherwise fallback to base prompt
  const musicVersion: MusicVersion = {
    slotId: slotIds[0],
    ...(anchor ? { anchor } : {}),
    musicPrompt: prompt,
    musicPrompts: {
      loudly: loudly || prompt || "",
      mubert: mubert || prompt || "",
      elevenlabs: elevenlabs || prompt || "",
    },
    provider: provider as MusicProvider,
    duration: effectiveDuration,
    generatedUrl: "", // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
  };

  const versionId = await createVersion(adId, "music", musicVersion);

  return slotReportedResult(adId, versionId, report);
}

/**
 * Create SFX draft in Redis. See createVoiceDraft for the lock rationale.
 */
export async function createSfxDraft(
  params: CreateSfxDraftParams,
): Promise<DraftCreationResult> {
  return withAdLock(params.adId, () => createSfxDraftLocked(params));
}

async function createSfxDraftLocked(
  params: CreateSfxDraftParams,
): Promise<DraftCreationResult> {
  const { adId, prompts, parentVersionId: explicitParent } = params;

  // Freeze any existing draft before creating new one
  await freezeExistingDraft(adId, "sfx");

  // Resolve parent lineage + inherit slot ids by ordinal match
  const parentVersionId = await resolveParentVersionId(
    adId,
    "sfx",
    explicitParent,
  );
  const parentSlotIds = await loadParentSlotIds(adId, "sfx", parentVersionId);
  const { assigned: slotIds, report } = reconcileSlots(
    parentSlotIds,
    prompts.length,
    "sfx",
    parentVersionId,
  );

  // Anchor translation — sfx typically references voices in the active voice version.
  const ordinalRefs = await loadOrdinalRefs(adId, { sfx: slotIds });

  const sfxVersion: SfxVersion = {
    soundFxPrompts: prompts.map((p, index) => {
      // Convert placement to proper typed format
      let placement: SoundFxPlacementIntent | undefined;
      if (p.placement) {
        if (p.placement.type === "beforeVoices") {
          placement = { type: "beforeVoices" };
        } else if (p.placement.type === "withFirstVoice") {
          placement = { type: "withFirstVoice" };
        } else if (p.placement.type === "start") {
          // Legacy: map to sequential intro
          placement = { type: "beforeVoices" };
        } else if (p.placement.type === "end") {
          placement = { type: "end" };
        } else if (
          p.placement.type === "afterVoice" &&
          p.placement.index !== undefined
        ) {
          placement = { type: "afterVoice", index: p.placement.index };
        }
      }

      const anchor = safeTranslateAnchor(p.anchor, ordinalRefs);

      return {
        slotId: slotIds[index],
        ...(anchor ? { anchor } : {}),
        description: p.description,
        placement: placement || { type: "end" },
        duration: p.duration || 3,
        // playAfter intentionally omitted - placement is the source of truth
        overlap: 0,
      };
    }),
    generatedUrls: [], // No audio generated yet for draft
    createdAt: Date.now(),
    createdBy: "llm",
    status: "draft",
    ...(parentVersionId ? { parentVersionId } : {}),
  };

  const versionId = await createVersion(adId, "sfx", sfxVersion);

  return slotReportedResult(adId, versionId, report);
}

/**
 * Small helper: attach the slot-reconciliation report to a draft result only when
 * the draft actually inherited from a parent. Fresh drafts with no parent return
 * just `{ versionId, status }` — the report in that case would only be "created"
 * entries, which callers don't need.
 *
 * Also emits a single structured log line per draft creation so orphan-drift
 * rates are visible in production logs before stage 6 ships the UI-facing
 * orphan affordance.
 */
function slotReportedResult(
  adId: string,
  versionId: VersionId,
  report: SlotReconciliation,
): DraftCreationResult {
  const inheritedFromParent =
    report.parentVersionId !== null ||
    report.preserved.length > 0 ||
    report.orphaned.length > 0;

  console.log(
    `[slot-reconciliation] adId=${adId} stream=${report.stream} versionId=${versionId} parent=${report.parentVersionId ?? "none"} preserved=${report.preserved.length} created=${report.created.length} orphaned=${report.orphaned.length}`,
  );

  return inheritedFromParent
    ? { versionId, status: "draft", reconciliation: report }
    : { versionId, status: "draft" };
}

/**
 * Read complete ad state from Redis
 * Returns FULL version data - not summaries - so LLM can see exactly what exists
 * and make informed decisions about what to preserve/modify
 */
export async function readAdState(
  params: ReadAdStateParams,
): Promise<ReadAdStateResult> {
  const { adId } = params;

  const result: ReadAdStateResult = {};

  // Helper to get latest version from a stream
  async function getLatestVersion(
    streamType: "voices" | "music" | "sfx",
  ): Promise<{
    id: VersionId;
    data: VoiceVersion | MusicVersion | SfxVersion;
  } | null> {
    const versions = await listVersions(adId, streamType);
    if (versions.length === 0) return null;

    const latestId = versions[versions.length - 1];
    const data = await getVersion(adId, streamType, latestId);

    return data ? { id: latestId, data } : null;
  }

  // Get latest voices version - return FULL data
  const voicesLatest = await getLatestVersion("voices");
  if (voicesLatest) {
    result.voices = {
      ...(voicesLatest.data as VoiceVersion),
      versionId: voicesLatest.id,
    };
  }

  // Build voice history summaries (to help LLM avoid reusing previously tried voices)
  const allVoiceVersions = await getAllVersionsWithData(adId, "voices");
  const voiceVersionEntries = Object.entries(allVoiceVersions);
  if (voiceVersionEntries.length > 1) {
    result.voiceHistory = voiceVersionEntries
      .filter(([vId]) => vId !== voicesLatest?.id) // Exclude current version
      .map(([vId, data]): VoiceHistorySummary => {
        const v = data as VoiceVersion;
        // Extract unique voice IDs and names from this version
        const uniqueVoices = new Map<string, string>();
        v.voiceTracks.forEach((t) => {
          if (t.voice?.id) {
            uniqueVoices.set(t.voice.id, t.voice.name || t.voice.id);
          }
        });
        return {
          versionId: vId,
          voiceIds: Array.from(uniqueVoices.keys()),
          voiceNames: Array.from(uniqueVoices.values()),
          requestText: v.requestText || null,
        };
      });
  }

  // Get latest music version - return FULL data
  const musicLatest = await getLatestVersion("music");
  if (musicLatest) {
    result.music = {
      ...(musicLatest.data as MusicVersion),
      versionId: musicLatest.id,
    };
  }

  // Get latest sfx version - return FULL data
  const sfxLatest = await getLatestVersion("sfx");
  if (sfxLatest) {
    result.sfx = {
      ...(sfxLatest.data as SfxVersion),
      versionId: sfxLatest.id,
    };
  }

  return result;
}

/**
 * Set a catchy creative title for the ad
 */
export async function setAdTitle(
  params: SetAdTitleParams,
): Promise<SetAdTitleResult> {
  const { adId, title } = params;

  const existing = await getAdMetadata(adId);
  if (!existing) {
    return { success: false, title: "" };
  }

  // Do not change the name of the ad if the ad already has a name
  if (existing.name && existing.name !== "") {
    return { success: true, title: existing.name };
  }

  await setAdMetadata(adId, {
    ...existing,
    name: title,
    lastModified: Date.now(),
  });

  return { success: true, title };
}
