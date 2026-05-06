import { Language } from "@/utils/language";

export type Provider = "any" | "lovo" | "elevenlabs" | "openai" | "qwen" | "bytedance" | "lahajati";

export type Pacing = "normal" | "fast";

export type { Language };

// Pronunciation Dictionary Types
export type PronunciationRuleType = 'alias' | 'phoneme';
export type PhoneticAlphabet = 'ipa' | 'cmu' | 'x-sampa';

export type PronunciationRule = {
  stringToReplace: string;
  type: PronunciationRuleType;
  alias?: string;
  phoneme?: string;
  alphabet?: PhoneticAlphabet;
};

export type PronunciationDictionary = {
  id: string;
  versionId: string;
  name: string;
  rules: PronunciationRule[];
  description?: string;
  createdAt: string;
};

export type Voice = {
  id: string;
  externalId?: string; // Bare provider-native voice id; optional for backward compat with legacy persisted tracks
  name: string;
  provider?: Provider; // Voice provider (elevenlabs, openai, lovo)
  gender: "male" | "female" | null;
  sampleUrl?: string;
  language?: Language;
  isMultilingual?: boolean;
  accent?: string;
  style?: string;
  description?: string;
  age?: string;
  use_case?: string;
};

export type VoiceTrack = {
  /**
   * Stable slot identifier that persists across regeneration.
   * Server-minted at version creation; carried forward from parent by ordinal match.
   * Anchors in a mixer version reference tracks by this id, not by array index,
   * so anchor → clip bindings survive voice/text edits and provider swaps.
   */
  slotId?: string;
  /**
   * Optional authoring-time anchor seed (stage 4). Slot-id form. When present,
   * stage 6 bootstrap uses this directly as the mixer anchor's `llm-seed`.
   * When absent, bootstrap translates legacy playAfter / overlap / isConcurrent.
   */
  anchor?: import("./versions").Anchor;
  voice: Voice | null;
  text: string;
  trackProvider?: Provider; // Override provider for this track (defaults to global selectedProvider)
  playAfter?: string;
  overlap?: number;
  isConcurrent?: boolean;
  style?: string;
  useCase?: string;
  description?: string; // ElevenLabs baseline tone (cheerful, excited, calm, etc.)
  voiceInstructions?: string; // Voice control instructions (OpenAI structured, Lahajati persona, ByteDance style direction)
  speed?: number; // Per-track speed multiplier (OpenAI: 0.25-4.0, ElevenLabs: 0.7-1.2)
  postProcessingSpeedup?: number; // Post-processing time-stretch speedup (1.0-1.6x). Provider-agnostic (WSOLA); ElevenLabs uses it alongside native speed, Qwen/Lovo/ByteDance use it as their only speed lever.
  postProcessingPitch?: number; // Post-processing pitch adjustment (0.7-1.2x, default 1.0). Provider-agnostic.
  targetDuration?: number; // Target duration in seconds (auto-calculates speedup, capped at 1.6x)
  generatedUrl?: string | null; // Generated audio URL (embedded, replaces parallel array). null = explicitly cleared (regeneration needed)
  generatedDuration?: number; // Actual duration in seconds (measured from audio, not estimated)
  // Lahajati-specific fields for Arabic dialect and performance style control
  dialectId?: number; // Lahajati dialect ID (e.g., 8 for Cairo slang)
  performanceId?: number; // Lahajati performance style ID (e.g., 1542 for automotive ad)
  // ByteDance TTS 2.0 emotion control
  emotion?: string; // ByteDance emotion tag (happy, sad, angry, excited, warm, neutral, etc.)
};

export type CampaignFormat =
  | "ad_read"
  | "dialog"
  | "testimonial"
  | "vox_pop"
  | "dramatized_scene"
  | "radio_skit";

export type MusicProvider = "loudly" | "mubert" | "elevenlabs" | "custom";

export type MusicPrompts = {
  loudly: string;
  mubert: string;
  elevenlabs: string;
  custom?: string; // Custom uploads don't use prompts, but included for type compatibility
};

export type MusicTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  provider: MusicProvider;
  playAt?: "start" | "end" | string;
  fadeIn?: number;
  fadeOut?: number;
};

export type SoundFxTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  playAfter?: string;
  overlap?: number;
};

// Sound effect placement intent - stores semantic placement that gets resolved at timeline calculation
export type SoundFxPlacementIntent =
  | { type: "beforeVoices" }  // Sequential: SFX finishes, then voices start
  | { type: "withFirstVoice" }  // Concurrent: SFX plays with first voice
  | { type: "afterVoice"; index: number }  // After voice track N (0-indexed)
  | { type: "end" }  // After all voice tracks
  | { type: "start" }  // DEPRECATED: Maps to beforeVoices for backward compatibility
  | { type: "legacy"; playAfter: string };  // Backwards compatibility with old format

export type SoundFxPrompt = {
  /**
   * Stable slot identifier — see VoiceTrack.slotId. Carried forward from the parent
   * sfx version by ordinal match at draft creation.
   */
  slotId?: string;
  /**
   * Optional authoring-time anchor seed (stage 4). Slot-id form. When present,
   * stage 6 bootstrap uses this directly as the mixer anchor's `llm-seed`.
   * When absent, bootstrap translates legacy `placement` (SoundFxPlacementIntent).
   */
  anchor?: import("./versions").Anchor;
  description: string;
  playAfter?: string;  // Legacy field for backwards compatibility
  overlap?: number;
  duration?: number;
  placement?: SoundFxPlacementIntent;  // New intent-based placement
};

export type LibraryMusicTrack = {
  projectId: string;
  projectTitle: string;
  musicPrompt: string;
  musicProvider: MusicProvider;
  musicUrl: string;
  createdAt: number;
  duration?: number;
};

// Project History Types
export type ProjectBrief = {
  clientDescription: string;
  creativeBrief: string;
  campaignFormat: CampaignFormat;
  selectedLanguage: Language;
  selectedProvider: Provider;
  selectedRegion?: string | null; // Optional for backwards compatibility
  adDuration: number;
  selectedAccent: string | null;
  selectedAiModel?: string; // DEPRECATED: V3 uses GPT-5.1 only, kept for backwards compat
  musicProvider?: MusicProvider; // Optional for backwards compatibility
  selectedCTA?: string | null; // Optional for backwards compatibility
  selectedPacing?: Pacing | null; // Optional for backwards compatibility

  // Stage-3 brief expansion. Every field optional so legacy briefs continue
  // to load. Renders into the LLM user message via buildUserMessage in the
  // generate routes.
  referenceUrls?: string[];
  forbiddenWords?: string;
  providedScript?: string;
  /** @deprecated v4 — replaced by alaric's BrandDossier projection,
   *  which now provides the canonical brand-voice context via the SF
   *  picker. Legacy briefs may carry a value; v4 surfaces it read-only
   *  in BriefPanelV4's Brand topic but never sends it to generation.
   *  Scheduled for full removal in a follow-up cleanup PR. */
  brandVoice?: string;
  /** @deprecated v4 — hosted web_search dropped during the v3.5
   *  industrialization (alaric BrandDossier replaces it for SF-backed
   *  brands). Field stays on the type so legacy briefs decode; no
   *  readers anywhere. Removal-pending. */
  enrichWithWebSearch?: boolean;

  // Alaric/SFDC integration (Stage C). All optional so existing briefs
  // continue to load.
  /** Salesforce Account Id — populated by the brief picker via alaric's
   *  /api/aca/sf-search.
   *
   *  @deprecated v2 — prefer `brand.salesforceAccountId`. Kept at the top
   *  level for backwards compatibility with v1-era briefs. New writes
   *  should set both `brand.salesforceAccountId` AND mirror to this field
   *  so legacy consumers (generate routes that read it directly) keep
   *  working. Read order everywhere is `brand.salesforceAccountId ??
   *  salesforceAccountId`. */
  salesforceAccountId?: string | null;
  /** Campaign-specific angle: "what is THIS ad asking the listener to feel
   *  or do that no other ad for this brand would?" Brand voice is the
   *  constant; the angle is the variance per spot. */
  creativeAngle?: string | null;
  /** Forward-compat schema-only field. v1 always behaves as "anchored"
   *  (the schema-level brand-voice extracts auto-inject). v2 (Stage F)
   *  uses "exploratory" to gate transcript-level retrieval and looser
   *  injection for deliberate divergent takes. No UI surface in v1. */
  varianceMode?: "anchored" | "exploratory";

  // v2 Stage H — unified Brand identity. Brand is the canonical key for
  // recents + per-brand inheritance. SF-backed in ~80% of cases (sales
  // pipeline clients) and standalone in ~20% (APAC pitch tools, prospect
  // briefs the sales team brings to the pitch). Legacy briefs without
  // `brand` keep working — backfill is lazy on next save.
  brand?: BrandRef;

  // Tone-of-voice preset (DB-backed via `suggested_tones`). `selectedTone`
  // is the preset id (or "custom" / null); `voiceInstructions` is the
  // resolved TTS-delivery prose seeded from the preset's template and
  // user-editable. Only `voiceInstructions` is sent to the LLM — the
  // preset id is UI state.
  selectedTone?: string | null;
  voiceInstructions?: string | null;

  // Creative template preset (DB-backed via `instruction_templates`, AAC-27).
  // The preset's `systemInstructions` is appended to the LLM system prompt to
  // shape script structure, pacing, music mood and SFX direction. The id is
  // persisted on the brief; the resolved instructions are fetched server-side
  // at generation time so admins can iterate on the wording without forcing
  // a brief rewrite.
  selectedTemplateId?: string | null;
};

/**
 * Unified brand identity attached to a brief.
 *
 * `name` is always set (the user-facing identity). When the brand exists
 * in Salesforce the `salesforceAccountId` + cached `salesforceAccountSnapshot`
 * are populated. Standalone brands (no SF) carry only `name`.
 *
 * The snapshot exists so `BriefPanelV3` can render the picker badge
 * synchronously on load — no "(loading…)" round-trip to alaric — and so
 * the recents endpoint can render labels without per-row alaric calls.
 */
export type BrandRef = {
  /** Canonical brand identity. Used as the recents-dedup key. */
  name: string;
  /** Salesforce Account Id when this brand has a SF counterpart. */
  salesforceAccountId?: string | null;
  /** Cached SF account label captured at pick time. Frozen — refresh
   *  comes from re-picking, not from background sync. */
  salesforceAccountSnapshot?: {
    id: string;
    name: string;
    industry: string | null;
  } | null;
};

export type ProjectMetadata = {
  id: string;
  headline: string;
  timestamp: number;
  language: Language;
  format: CampaignFormat;
  provider: Provider;
};

export type Project = {
  id: string; // UUID
  headline: string; // LLM-generated title
  timestamp: number; // Creation time
  lastModified: number; // Last update time
  brief: ProjectBrief; // Original brief settings
  voiceTracks: VoiceTrack[]; // Generated voice scripts
  musicPrompt: string; // Music generation prompt (base/fallback)
  musicPrompts?: MusicPrompts; // Provider-specific music prompts
  soundFxPrompt: SoundFxPrompt | null; // Sound effects prompt (LEGACY: single soundfx)
  soundFxPrompts?: SoundFxPrompt[]; // NEW: Array of sound effects (supports multiple)
  // Store actual generated audio URLs (now permanent with Vercel Blob)
  generatedTracks?: {
    voiceUrls: string[];
    musicUrl?: string;
    soundFxUrl?: string; // LEGACY: single soundfx URL
    soundFxUrls?: string[]; // NEW: Array of soundfx URLs matching soundFxPrompts by index
  };
  // Mixer state - positions and volumes
  mixerState?: {
    tracks: Array<{
      id: string;
      url: string;
      label: string;
      type: "voice" | "music" | "soundfx";
      duration?: number;
      volume?: number;
      startTime?: number;
    }>;
    totalDuration?: number;
  };
  // Preview fields for client sharing
  preview?: {
    brandName: string;
    slogan: string;
    destinationUrl: string;
    cta: string;
    logoUrl?: string; // Vercel blob URL
    visualUrl?: string; // Vercel blob URL
    mixedAudioUrl?: string; // Final mixed audio from mixer
  };
};
