import type { VoiceVersion, MusicVersion, SfxVersion, VersionId, StreamType } from "@/types/versions";
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
  }>;
  count: number;
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
