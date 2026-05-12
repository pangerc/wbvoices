import type { KnowledgeContext } from "@/lib/knowledge/types";
import type {
  AgeBracket,
  DialectRegister,
  EnergyLevel,
  PaceTendency,
  UseCaseTag,
  WarmthLevel,
} from "@/services/voiceMetadataSynthesis";
import type {
  MusicVersion,
  SfxVersion,
  StreamType,
  VersionId,
  VoiceVersion,
} from "@/types/versions";
import type { AnchorInput } from "./anchorTranslation";

export type { AnchorInput };

// Core tool call types (OpenAI-compatible)
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string; // JSON string
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Tool implementation parameter types
export interface SearchVoicesParams {
  provider: "elevenlabs" | "openai" | "lovo";
  language: string;
  gender?: "male" | "female";
  accent?: string;
  count?: number;
  /**
   * Server-injected ad id. Not part of the LLM tool schema — the executor
   * injects it from the agent context so searchVoices can seed a stable,
   * per-ad shuffle over the candidate pool. Same ad re-runs get the same
   * voice set; different ads get different sets. Without a seed the pool is
   * sliced deterministically in provider-cache order, which is the root
   * cause of the "same voices keep appearing" complaint.
   */
  adId?: string;

  // Semantic filter args — LLM-visible. Closed enums only. Resolved against
  // the synthesized structured metadata (see voiceMetadataSynthesis.ts) so
  // filters work uniformly across all providers, including those with thin
  // native metadata. Missing values on a voice do not exclude it.
  age_bracket?: AgeBracket;
  energy?: EnergyLevel;
  warmth?: WarmthLevel;
  pace_tendency?: PaceTendency;
  use_case?: UseCaseTag;
  dialect_register?: DialectRegister;
}

/**
 * Parent-version reference for draft creation.
 * - Omitted (undefined): server auto-infers from the stream's latest frozen version.
 *   Use this when the LLM is iterating on the natural lineage.
 * - Explicit VersionId: force lineage from a specific version (e.g. forking an older take).
 * - Explicit null: start fresh, no parent. All slots get new UUIDs.
 */
export type ParentVersionRef = VersionId | null | undefined;

export interface CreateVoiceDraftParams {
  adId: string;
  parentVersionId?: ParentVersionRef;
  /**
   * KnowledgeContext snapshot to pin on the new voice version. Not part of
   * the LLM tool schema — injected server-side by the agent executor from
   * either the initial brief (first version) or the parent version's
   * inherited context plus optional overrides (iteration).
   */
  knowledgeContext?: KnowledgeContext;
  tracks: Array<{
    voiceId: string;
    text: string;
    /**
     * Optional ordinal-form anchor seed (stage 4). If provided, takes precedence
     * over legacy playAfter/overlap. Translated to slot-id form at persistence.
     */
    anchor?: AnchorInput;
    playAfter?: string;
    overlap?: number;
    description?: string; // ElevenLabs baseline tone
    voiceInstructions?: string; // OpenAI voice guidance
    dialectId?: number; // Lahajati Arabic dialect ID
    performanceId?: number; // Lahajati performance style ID
    emotion?: string; // ByteDance TTS 2.0 emotion tag
    // Preserve language context when voice catalogue lookup fails
    language?: string;
    accent?: string;
    provider?: string;
  }>;
}

export interface CreateMusicDraftParams {
  adId: string;
  parentVersionId?: ParentVersionRef;
  /** Optional positioning anchor (stage 4). Default: `absolute(0)`. */
  anchor?: AnchorInput;
  prompt: string;
  elevenlabs?: string; // Detailed instrumental (no artist names)
  loudly?: string; // Detailed with artist references
  mubert?: string; // 8-12 word vibe storytelling
  provider?: "loudly" | "mubert" | "elevenlabs";
  duration?: number;
}

export interface CreateSfxDraftParams {
  adId: string;
  parentVersionId?: ParentVersionRef;
  prompts: Array<{
    description: string;
    /**
     * Optional ordinal-form anchor seed (stage 4). If provided, takes precedence
     * over legacy `placement` intent. Translated at persistence.
     */
    anchor?: AnchorInput;
    placement?: { type: string; index?: number };
    duration?: number;
  }>;
}

/**
 * Report describing how slot identities evolved from a parent version to a new draft.
 * Consumed by the mixer so anchor → slot bindings can be evaluated for orphaning
 * (removed slots) and for default-positioning of newly-added slots.
 */
export interface SlotReconciliation {
  stream: StreamType;
  parentVersionId: VersionId | null;
  /** Slots that carried forward from parent by ordinal match. */
  preserved: Array<{ slotId: string; ordinalIndex: number }>;
  /** Slots that have no parent counterpart (LLM added tracks). Fresh UUIDs. */
  created: Array<{ slotId: string; ordinalIndex: number }>;
  /** Slots present in parent but absent from new draft (LLM removed tracks). */
  orphaned: Array<{ slotId: string; ordinalIndex: number }>;
}

export interface ReadAdStateParams {
  adId: string;
}

export interface SetAdTitleParams {
  adId: string;
  title: string;
}

export interface SetAdTitleResult {
  success: boolean;
  title: string;
}

// Lightweight summary of voices used in a version (for history tracking)
export interface VoiceHistorySummary {
  versionId: string;
  voiceIds: string[];
  voiceNames: string[];
  requestText: string | null;
}

// ReadAdStateResult returns FULL Redis data - no summaries, no lossy abstraction
// The LLM sees exactly what's in Redis so it can make informed decisions
export interface ReadAdStateResult {
  /** Full voice version data if exists */
  voices?: VoiceVersion & { versionId: string };
  /** History of voices used in previous versions (to avoid duplicates) */
  voiceHistory?: VoiceHistorySummary[];
  /** Full music version data if exists */
  music?: MusicVersion & { versionId: string };
  /** Full SFX version data if exists */
  sfx?: SfxVersion & { versionId: string };
}

// Tool result types
export interface SearchVoicesResult {
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
    accent?: string;
    style?: string;
    /**
     * Human-curated personality description from the Neon `voice_descriptions`
     * table (e.g. "Middle-aged french man, serious intonation. Great for
     * Commercials." or "Reflects a neutral Middle Eastern accent with clear
     * articulation."). The casting agent reads this to discriminate between
     * candidates that pass the structural filters — without it, two voices
     * with identical accent/gender/age look interchangeable even when their
     * acoustic identity is wildly different.
     */
    description?: string;
    provider?: string;
    // Synthesized structured metadata — uniform across all providers. Any
    // of these may be undefined when the source data didn't carry the
    // signal; the LLM should read `casting_note` for the vibe glue.
    age_bracket?: AgeBracket;
    energy?: EnergyLevel;
    warmth?: WarmthLevel;
    pace_tendency?: PaceTendency;
    use_case?: UseCaseTag;
    dialect_register?: DialectRegister;
    /**
     * One-liner casting note: "when to cast this voice", distilled from
     * the structured axes above and any provider-native personality text.
     * The vibe-glue discriminator between candidates that passed the filter.
     */
    casting_note: string;
  }>;
  count: number;
  /**
   * Present only when the catalogue auto-broadened the search because the
   * caller's filters returned an empty pool. Lists the dimensions that
   * were dropped, in the order they were dropped (semantic filters →
   * accent → gender). The agent treats these voices as still valid for
   * casting and does NOT need to re-search.
   */
  broadened_from?: string[];
}

export interface DraftCreationResult {
  versionId: string;
  status: "draft";
  /**
   * Present when the draft inherits slot identities from a parent version
   * (via explicit parentVersionId or auto-inference from latest frozen).
   * Absent on truly fresh creations (no parent).
   */
  reconciliation?: SlotReconciliation;
}
