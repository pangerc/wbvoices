# Version 3.5: Creative Pipeline Rewrite

**Status:** Active (post-merge revision)
**Last Updated:** April 29, 2026
**Continues from:** [version3-1.md](./version3-1.md) (agentic tool-calling baseline)

---

## Highlights for stakeholders

End-user / sales-rep / manager-facing changes since the V3 baseline. Implementation detail lives in the rest of the doc; this section is for non-engineers.

The headline shift in this window is the **mixer**. V3 ACA was a "generate the script, listen, regenerate if you don't like it" tool — the rep had no granular control over the final mix. V3.5 turns it into an arrangement workspace: takes, draggable timeline, edge trimming, per-clip volume and fades, live loudness metering, and a preview-and-export path that respects every edit. Most of what's below is mixer-side capability.

**Mixer / production (the bulk of the v3.5 capability uplift)**

- **Versioned mixer takes.** Each ad now carries a stream of mixer arrangements alongside the voice/music/SFX streams. "Start a new take" forks the current arrangement into a draft you can edit; freezing a take preserves it as an immutable snapshot you can return to. The takes dropdown shows every frozen take with its label and creation time. Lets reps experiment without losing the version they liked.
- **Draggable timeline (anchor-graph backed).** Voice and SFX clips can be repositioned by drag-and-drop. The arrangement is stored as a graph of relationships ("voice 2 starts after voice 1 ends + 200ms"; "SFX 1 plays simultaneously with voice 1") rather than absolute timestamps — so when the rep regenerates a voice line that turns out longer, the rest of the mix automatically shifts to accommodate. Drag-to-reposition translates the user's intent into a new graph anchor; mid-arrangement insertion / reordering / removal all preserve the rest of the mix.
- **Edge trimming.** Drag a clip's right edge inward to trim the tail; the waveform redraws cropped to the playback window in real time. Trim is honored everywhere downstream — preview playback uses the trimmed window, the rendered export uses the trimmed window. No more "I trimmed it visually but the export still has the long version" surprise.
- **Per-clip volume + fades.** Each clip has independent gain (dB trim around unity, -12 to +6), fade-in, and fade-out controls on top of the mandatory zero-cross micro-fade. Mute and solo are live during preview playback.
- **Stem loudness normalization.** Voice / music / SFX stems all normalize to a consistent integrated loudness target (BS.1770). User-set per-clip volume operates in dB around that unity reference, so a +3 dB on the voice track means "3 dB louder than the music bed" no matter which provider generated either stem. Solves the chronic "ElevenLabs voices come out way hotter than Lahajati" mismatch.
- **Live LUFS meter during preview.** Real-time integrated loudness reading during preview playback (BS.1770), so the rep can confirm the mix sits at platform-spec target before exporting.
- **Click-to-seek + playhead scrubbing.** The timeline is clickable and the playhead is draggable — standard DAW-like navigation, no more restart-from-zero on every preview.
- **Format-duration horizon.** The timeline visually clamps to the brief's `adDuration` (30s / 60s) with a soft warning when content runs over. Drops + insertions past the horizon get blocked at drag time. Catches over-budget mixes before export.
- **Pure server-side resolver.** Timeline math (where each clip starts, how long the mix is, how clips align across regenerations) is computed by a deterministic resolver on the server, not by ad-hoc client-side code. Same input always produces the same output — and the resolver runs identically for the preview UI and the rendered export, so what the rep hears in preview is what comes out of the export.
- **Reset-to-seed.** "Reset arrangement" reverts to the LLM's originally-suggested anchor graph (the seed produced when the script was first generated). Lets the rep rip out manual edits without losing the AI-cast starting point.
- **Take management UX.** "Save take" / "Switch to take 2" / per-take label editing — explicit affordances rather than a hidden version history.

**For sales reps using ACA (brief panel + brand grounding)**

- **Salesforce-grounded briefs.** Picking an SF account from the brand picker auto-pulls the brand's commercial relationship, creative posture, audience signals, and policy constraints (taboo words, mandatory legal) into the LLM prompt — no manual copy-paste from intelligence reports. Greenfield "type the brand name" path stays available when no SF match exists.
- **Market-driven defaults (86 markets from alaric).** Pick the market up front; the panel defaults the language to the market's primary language, filters the brand picker to SF accounts in that market, and gives the agent locale context for native-sounding scripts.
- **Cleaner brief panel (V4 three-topic restructure).** Brand & Market / Creative / Language & Voice. Three primary fields exposed (creative brief, ad format, tone of voice); everything else collapsed by default.
- **Ad duplication.** One-click clone of an existing ad — voices, music, SFX, mixer arrangement, and rendered audio assets all copy across. Ready to tweak as a variant.

**For creative quality**

- **Six campaign formats** in the UI (single, dialogue, testimonial, vox-pop, dramatized scene, radio skit) — was 2. Each gets format-specific casting + script-structure guidance.
- **Two-pass ElevenLabs tag weaving.** Pass 1 writes clean prose; pass 2 inserts V3 audio tags using cast voice metadata. Mechanical lint catches accent-tag misses and opening-stack runaway. Tag-clustering failures fixed.
- **Voice casting variety.** Semantic search filters (energy / warmth / pacing / use-case / dialect-register) + ad-id-seeded shuffle. "Same five voices in every ad" complaint addressed.
- **Per-track provider conversion.** Swap a single voice line between providers without regenerating the whole script.

**For admins**

- **Tone-of-voice admin panel** at `/admin/tone-of-voice` for managing the preset library used by the brief panel. AI-generated "voice instructions" suggestion to seed prosody descriptions when adding a new tone.

---

## Overview

V3.5 is a substantial rewrite of the creative pipeline on top of V3's agentic baseline. The fundamental loop (LLM uses tools → drafts in Redis → mixer assembles) didn't change. Everything inside it did.

Seven workstreams shipped in the initial v3.5 window, layered roughly in this order:

1. **Voice casting fixes** — per-version `KnowledgeContext` snapshots, semantic search filters (age / energy / warmth / pace / use-case / dialect-register), `adId`-seeded shuffle, voice-description surfacing, multilingual deprioritization. The "same voices keep appearing in every ad" complaint went from chronic to addressed.
2. **GPT-5.5 migration** — model bump from gpt-5 to gpt-5.5 across the codebase. Reasoning effort kept at `medium` for the agent (per user pushback against `low`); verbosity at `low` for tool-call-heavy responses.
3. **Creative prompting system rewrite** — system prompt rebuilt around a "senior creative director" persona with three success criteria; six campaign formats (`ad_read` / `dialog` / `testimonial` / `vox_pop` / `dramatized_scene` / `radio_skit`) with format-specific casting + structure guidance; brief expansion fields (tone-of-voice, brand voice, reference URLs, forbidden words, provided-script verbatim mode, creative angle); knowledge modules per voice provider with conditional sections (fast-pacing override, accent guidance).
4. **Two-pass ElevenLabs tag-weaving** — pass 1 (the agent) writes clean script; pass 2 (a focused tag-weaver) inserts V3 audio tags using cast voice metadata; mechanical lint catches accent-tag misses + opening-stack runaway. Replaces the monolithic "agent juggles dialogue craft + brand voice + voice casting + tag placement" model that was producing tag-clustering failures.
5. **Per-track provider conversion** — single voice line can swap providers without re-generating the whole script. New `/api/ai/convert-voice-track` endpoint translates voice-control fields between provider grammars (OpenAI structured `Voice Affect / Tone / Pacing / …` ↔ Lahajati Arabic persona ↔ ByteDance free-text style ↔ ElevenLabs `description` baseline). Cogwheel iteration entry-point now available for ByteDance + Qwen tracks.
6. **Loose alaric integration** — secure HMAC-signed endpoint surface so ACA pulls live Salesforce identity + alaric's enriched brand intelligence into the brief without rebuilding either system. Shipped in stages: A–E (HMAC + 3 endpoints + URL-type-aware extraction), H–J (unified Brand picker + Recents + per-brand inheritance + async enrichment trigger), K–N (the tag-weaving fix above — same window, parallel workstream), P–S (Spotify-only filter + form reorganization + richer profile projection), U–Y (BrandDossier rewrite + Stage R chrome amputation + web search disentangled + flat form).

Cross-cutting fixes shipped along the way: brief PATCH idempotent (lazy ad creation, no more 404 spam), Spotify-filter auto-fallback, music duration floor at brief+10s, NextAuth split for Edge-safe middleware, Smart Speed for Qwen.

After v3.5 was committed but before it shipped to prod, two parallel workstreams from teammates landed on `main`:

7. **Sergiu's tone-of-voice admin pipeline** — DB-backed `suggested_tones` table (Drizzle migration `0002`), admin CRUD UI at `/admin/tone-of-voice`, `ToneSelector` component for the brief panel, public read-only `/api/tone-of-voice` endpoint, AI-generated voice-instructions assistant. Replaces v3.5's naive 11-tag `ToneOfVoiceTag` enum with a richer admin-managed preset library — adopted as canonical.
8. **Alexandru's ad-duplication feature (AAC-18)** — `/api/ads/[id]/duplicate` route + `DuplicateAdPopup` component. The original implementation predated v3.5's mixer-stream redesign and called the legacy `getMixerState` / `updateMixerState` helpers; rewritten on the v3.5 side to clone the four versioned streams (voices / music / sfx / mixer) via `cloneVersion` + per-stream `getActiveVersionData`, with `@vercel/blob` `copy()` for `mixedAudioUrl` + preview blobs so the duplicate is independent of the source ad.

The reconciliation of the above with v3.5 — plus a deliberate brief-panel restructure — produced the **V4 brief panel** (three topics: Brand & Market / Creative / Language & Voice) that ships in this revision. Detailed in the [Post-v3.5 reconciliation — BriefPanelV4 + team merges](#post-v35-reconciliation--briefpanelv4--team-merges) section.

The mixer-side work that shipped in the v3.5 window is its own substantial redesign — see [Mixer redesign — version stream architecture](#mixer-redesign--version-stream-architecture) below.

---

## Architectural deltas

### Brief generation flow with v3.5 enrichment (post-merge / V4)

```
User Brief (BriefPanelV4 — 3 topics)
    │   Brand & Market   : BrandPicker, MarketPicker, dossier badge
    │   Creative         : brief, format, tone (exposed) + 6 collapsibles
    │   Language & Voice : language, region, accent (single row)
    ↓
GET /api/markets   ── alaric proxy, 86-market list (cached at HTTP layer)
POST /api/brand-context { kind: "search" | "sf-account" | "greenfield" | "spotify-ad-manager" }
                 ── single discriminated endpoint folding sf-search +
                    brand recents + dossier resolve. Implicit-on-save:
                    picking an SF brand fetches the dossier & shows it.
    ↓
PATCH /api/ads/{id}/brief  ← lazy-creates ad on first keystroke
    ↓
POST /api/ai/generate-stream
    ↓
prefetchBriefEnrichments() runs in parallel:
  ├── alaric.getSfClient(sfAccountId)  →  BrandDossier (5 slots)
  └── alaric.fetchContent(referenceUrl) × N  →  per-URL extracts
    ↓
renderEnrichmentSections() projects into the user message:
  ├── ## Brand Dossier — {name}
  │     ### Commercial relationship  (T12M revenue, posture, pipeline)
  │     ### Creative posture         (pitch_angles, value_prop, sales_briefing)
  │     ### Competitive read         (gaps, longest_campaign, agency)
  │     ### Audience signals         (ages, locations, publishers, reach)
  │     ### Policy & constraints     (industry taxonomy, mandatory legal, taboo)
  └── ## Reference Page Content (per URL, type-aware extract)
    ↓
runAgentLoop()  →  search_voices + create_voice_draft + … as before
    ↓
createVoiceDraft() runs Stage N (tag-weaver) + Stage L (lint) per ElevenLabs track
    ↓
Voice/music/SFX versions persisted; mixer rebuilds (sister thread)
```

The v3 hosted `web_search` path is gone — alaric's BrandDossier is strictly richer than what hosted search was producing for SF-backed brands. Standalone-brand fallback (web search as poor-man's alaric) is held for v4 Stage W.

The brand picker no longer uses two separate endpoints (`/api/sf-accounts/search` + `/api/brands/recent`). Both fold into `/api/brand-context` with a discriminated `kind`. The legacy endpoints are deleted.

---

## Data model changes

> **Industrialization note.** Every field added in this window is OPTIONAL on its TypeScript type and on the persisted Redis JSON. Every legacy brief, voice version, and ad metadata blob from V3 still decodes without migration. The Redis key namespace (`ad:{adId}:…`) is unchanged. Backwards-compat guarantees per shape are called out explicitly below; an explicit "Breaking changes" subsection summarizes the (small) list at the end.

### `ProjectBrief` (`src/types/index.ts`)

The brief is persisted in `AdMetadata.brief` under `ad:{adId}:meta` as a JSON blob. Read shape is `Partial<ProjectBrief>` — every field is optional and every reader must handle missing fields.

**Added** in this window:

| Field | Shape | Persistence | Reader compat |
|-------|-------|-------------|---------------|
| `brand` | `BrandRef` (see below) | Stored when set | New readers prefer `brand.*`; legacy readers fall back to top-level `salesforceAccountId`. |
| `salesforceAccountId` | `string \| null` | Mirrored at top level when `brand.salesforceAccountId` is set | Kept top-level for v1 reader back-compat. New code reads `brand.salesforceAccountId ?? salesforceAccountId`. |
| `creativeAngle` | `string` | Stored when non-empty | Soft warning when SF/URLs populated but angle empty; never blocks generation. Demoted into a Creative-topic collapsible in V4 (was exposed mid-revision; user override). |
| `varianceMode` | `"anchored" \| "exploratory"` | Reserved field, not yet written by UI | Forward-compat. Stage F (transcript-level retrieval) will gate on this. |
| `selectedTone` | `string \| null` | Stored when set | UUID-or-title pointer into the admin-managed `suggested_tones` table (Sergiu's pipeline). Resolves to a `voiceInstructions` template; the LLM only sees `voiceInstructions`, never the preset id. Replaces v3.5's pre-merge `ToneOfVoiceTag[]` enum (which never shipped to prod). |
| `voiceInstructions` | `string \| null` | Stored when non-empty | TTS-delivery prose. Auto-seeded from the picked tone preset's template; user-editable. Threaded into per-track `VoiceTrack.voiceInstructions` via the generate routes. |
| `referenceUrls` | `string[]` | Stored when length > 0 | Per-URL alaric fetch + URL-type detection at prefetch time; type union is `homepage \| product \| press_release \| reference_ad \| unknown`. Behind a Creative-topic collapsible in V4. |
| `forbiddenWords` | `string` | Stored when non-empty | Free-text comma/newline list; renders into `## Avoid` prompt block. Behind a collapsible in V4. |
| `providedScript` | `string` | Stored when non-empty | Use-verbatim mode — agent only writes acting/music/SFX around it. Surfaced via the "I have the script" tab on Creative topic; brief save carries both fields so toggling preserves edits. |
| `selectedCTA` | `string` | Stored | One of 22 canonical tokens + `none`. Behind a collapsible in V4. |
| `campaignFormat` | `CampaignFormat` | Extended enum | Was `ad_read \| dialog \| testimonial`; now includes `vox_pop \| dramatized_scene \| radio_skit`. Surfaced as a 6-option `GlassyListbox` in V4 (was a 2-button toggle in BriefPanelBase — UI lagged the prompt). |

**Repurposed** (same type, semantic shift):

| Field | Old meaning | New meaning |
|-------|-------------|-------------|
| `selectedRegion` | Voice-region taxonomy code (e.g. `"us-east"`) — filtered the voice catalogue. | Alaric alpha-2 market code (e.g. `"SI"`, `"DE"`). Drives SF search filter, language defaults, dossier territory grounding. Legacy non-alpha-2 values render with a `(legacy)` suffix in the picker; re-picking promotes to a real alpha-2. The legacy "voice region depends on language" coupling is gone — picking a market no longer wipes itself when language changes. |

**Deprecated** (still on the type, still decoded, ignored by writers):

| Field | Why deprecated | Compat policy |
|-------|----------------|---------------|
| `enrichWithWebSearch` | Hosted-tool web search dropped in v4 Stage X; alaric BrandDossier replaces for SF-backed brands. | Zero live readers. Generate routes don't read it; brief-enrichment doesn't branch on it. Field stays on the type as `@deprecated removal-pending` for legacy decode only. |
| `salesforceAccountId` (top-level) | Superseded by `brand.salesforceAccountId`. | Stays at top level; new writes mirror both. Generate routes read `brand.salesforceAccountId ?? salesforceAccountId`. |
| `brandVoice` | Replaced by alaric's `BrandDossier` projection (commercial / creative / audience / policy slots) which feeds the LLM richer brand context than free-text. | Field stays on the type as `@deprecated`. BriefPanelV4 surfaces legacy values in a read-only `<details>` block at the top of the Brand topic so users can SEE what was there but not edit. Generate routes don't read the field — no `## Brand Voice` prompt section anymore. Scheduled for full removal in a follow-up cleanup PR. |
| `toneOfVoice` (`ToneOfVoiceTag[]`) | Pre-merge v3.5 internal addition (11-value closed enum chip multi-select). Replaced by Sergiu's `selectedTone` + `voiceInstructions` pipeline before either shape reached prod. | Type and field removed from `ProjectBrief`. Knowledge-context plumbing removed. Any prod brief that somehow carried the field decodes via JSON parse without crashing — readers silently ignore. No migration. |

**Removed:** `ToneOfVoiceTag` union type and `ProjectBrief.toneOfVoice` field. The naive multi-select tag enum from the v3.5 prompting rewrite was replaced wholesale by Sergiu's admin-managed preset pipeline during the post-v3.5 merge.

### New shape: `BrandRef`

```ts
brand?: {
  name: string;                                       // always set when brand is non-null
  salesforceAccountId?: string | null;                // present in SF-backed case (~80%)
  salesforceAccountSnapshot?: {
    id: string;
    name: string;
    industry: string | null;
  };  // cached so the badge renders synchronously after page reload
};
```

`brand.name` is the canonical recents-key (case-insensitive trim). Two SF-backed ads for "Coca-Cola DACH" + "coca cola dach" dedupe in the recents row.

### `VoiceTrack` (`src/types/index.ts`)

The voice track shape gained provider-specific control fields. All optional — legacy tracks decode unchanged.

| Field | Provider scope | Purpose |
|-------|----------------|---------|
| `description` | ElevenLabs | Baseline tone token (`cheerful \| happy \| excited \| energetic \| dynamic \| calm \| gentle \| soothing \| serious \| professional \| authoritative \| empathetic \| warm \| fast_read \| slow_read`). REQUIRED on every ElevenLabs track per the v3.5 prompt. |
| `voiceInstructions` | OpenAI / Lahajati / ByteDance | Provider-specific voice control. OpenAI: structured `Voice Affect / Tone / Pacing / Emotion / Emphasis / Pronunciation / Pauses` blob. Lahajati: Arabic persona text. ByteDance: free-text style. |
| `dialectId` | Lahajati only | Numeric dialect ID (e.g. 7 for Cairo, 8 for Alexandria). |
| `performanceId` | Lahajati only | Numeric performance style ID (e.g. 1542 for automotive ad). |
| `emotion` | ByteDance only | Closed enum: `happy \| sad \| angry \| excited \| warm \| neutral \| fear \| surprised \| coldness \| affectionate \| chat \| ASMR \| authoritative`. |
| `speed` | All | Per-track speed multiplier (OpenAI 0.25–4.0, ElevenLabs 0.7–1.2). |
| `postProcessingSpeedup` | All | Provider-agnostic WSOLA time-stretch (1.0–1.6x). ElevenLabs uses alongside native speed; Qwen / Lovo / ByteDance use as their only speed lever. |
| `postProcessingPitch` | All | Provider-agnostic pitch adjustment (0.7–1.2x, default 1.0). |
| `targetDuration` | All | Target duration in seconds; auto-calculates `postProcessingSpeedup` capped at 1.6x. |
| `generatedDuration` | All | Actual measured duration after generation (via `music-metadata`). Drives mixer timeline calculation. |

`voiceInstructions` is provider-polymorphic by design. The `/api/ai/convert-voice-track` endpoint translates between provider grammars when the user swaps providers on a single track.

### `VoiceVersion` (`src/types/versions.ts`)

Stored at `ad:{adId}:voices:v:{versionId}`. Two new optional fields:

```ts
interface VoiceVersion {
  // existing fields unchanged: voiceTracks, generatedUrls, createdAt, createdBy,
  // status, promptContext, parentVersionId, requestText, integratedLufs

  /** Snapshot of the KnowledgeContext that produced this version. Pins
   *  pacing / accent / provider / format so future iterations inherit the
   *  same creative direction. Legacy versions before v3.5 have this
   *  undefined — readers must handle that case. */
  knowledgeContext?: KnowledgeContext;

  /** Stage L mechanical-lint warnings carried with the version when the
   *  Stage N tag-weaver retry still left a violation in place. Empty /
   *  absent when the draft cleared lint. */
  tagLintWarnings?: Array<{
    trackIndex: number;
    rule: "missing_accent_tag" | "opening_stack_oversize" | "malformed_tag_syntax";
    message: string;
    castVoiceAccent?: string;
    requiredTag?: string;
    hint?: string;
  }>;
}
```

`KnowledgeContext` shape (read by per-provider knowledge modules):

```ts
interface KnowledgeContext {
  pacing?: "normal" | "fast";
  accent?: string;
  region?: string;
  language?: string;
  voiceProvider?: string;
  campaignFormat?: CampaignFormat;
  toneOfVoice?: string[];
  brandVoice?: string;
  hasProvidedScript?: boolean;
}
```

**Reader compat:** versions written before v3.5 have neither `knowledgeContext` nor `tagLintWarnings`. Iteration code MUST tolerate `parent.knowledgeContext === undefined` (falls back to brief-level KnowledgeContext rebuild). Mixer + scripter UI MUST tolerate `tagLintWarnings === undefined`.

### Closed enums for semantic search filters (`src/lib/tools/types.ts`)

`search_voices` exposes six structured-metadata filters. Each is a closed string enum visible to the LLM via the tool schema. Adding new values is a non-breaking change for the tool definition (LLM ignores unknown values); REMOVING values is breaking.

```ts
type AgeBracket = "young" | "middle_aged" | "senior";
type EnergyLevel = "low" | "mid" | "high";
type WarmthLevel = "cool" | "neutral" | "warm";
type PaceTendency = "slow" | "medium" | "fast";
type UseCaseTag = "advertisement" | "narration" | "social_media" | "audiobook" | "characters" | "informative_educational" | "conversational";
type DialectRegister = "formal" | "conversational" | "street" | "regional";
```

Resolved against synthesized metadata via `voiceMatchesFilters` in `src/services/voiceMetadataSynthesis.ts` — voices missing data on a requested axis pass through (don't get falsely excluded).

### `SearchVoicesResult` (`src/lib/tools/types.ts`)

LLM-visible result shape from `search_voices`:

```ts
interface SearchVoicesResult {
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: string;
    accent?: string;
    style?: string;          // Lovo styles only (was previously `style || personality` until v3.5 split)
    description?: string;    // NEW v3.5 — Neon voice_descriptions, surfaced for casting discriminator
    provider?: string;
    age_bracket?: AgeBracket;
    energy?: EnergyLevel;
    warmth?: WarmthLevel;
    pace_tendency?: PaceTendency;
    use_case?: UseCaseTag;
    dialect_register?: DialectRegister;
    casting_note: string;    // NEW v3.5 — synthesized vibe glue
  }>;
  count: number;
  /** Present when the catalogue auto-broadened the search because the
   *  caller's filters returned an empty pool. Lists the dimensions
   *  dropped (semantic filters → accent → gender). The agent treats
   *  these voices as still valid for casting and does NOT need to
   *  re-search. */
  broadened_from?: string[];  // NEW v3.5
}
```

**Wire compat:** the new fields (`description`, `casting_note`, semantic axes, `broadened_from`) are additive. Old result consumers ignore them.

### New shape: `BrandDossier` (alaric `account-lookup.ts`, mirrored in ACA `alaric-client.ts`)

Five-slot projection of EVERYTHING alaric knows about a brand. The shape is fully optional throughout — every slot, every field within slots, is independently `T | undefined`. Empty slots render as omitted prompt sections (no theatrical empties).

```ts
interface BrandDossier {
  identity: {
    name: string;                       // always present
    sfAccountId?: string;
    domain?: string;
    market?: string;
    reportingTerritory?: string;
    legalEntity?: string;
    territoryDivergent?: boolean;       // reporting != billing country
  };
  commercial: {
    isOnboardedClient?: boolean;
    isActivelySpending?: boolean;
    trailing12MonthRevenue?: number;
    lastCloseWonDate?: string | null;
    revenueByPlatform?: Record<string, number>;
    revenueTimeline?: Array<{
      quarter: string;                  // "2026Q1" format
      total: number;
      perPlatform?: Record<string, number>;
    }>;
    openPipeline?: Array<{
      name?: string;
      amount?: number;
      stage?: string;
      closeDate?: string;
      product?: string;
    }>;
    leadType?: string;                  // alaric prospects classifier output
    creativePosture?: "active" | "dormant_onboarded" | "lapsed" | "prospect";
  };
  creative: {
    pitchAngles?: string[];
    valueProposition?: string;
    whatTheyreAdvertising?: string[];
    messagingThemes?: string[];
    salesBriefing?: string;
    tonalAxes?: BrandTonalAxes;         // { energy?, pace?, vocabRegister?, humorTolerance? }
    creativeStyleNotes?: string[];
    perPlatform?: Array<{
      platform: "meta" | "google" | "tiktok" | "msads";
      pitchAngles?: string[];
      valueProposition?: string;
      messagingThemes?: string[];
      activeAdCount?: number;
      longestCampaignDays?: number;
    }>;
  };
  competitive: {
    competitiveGaps?: string[];
    longestCampaignDays?: number;
    agencyManaged?: boolean;
    agencyName?: string;
    crossSellGap?: string;
  };
  audience: {
    targetAges?: string[];
    targetLocations?: string[];
    publisherPlatforms?: Array<{
      name: string;
      activeAdCount?: number;
      reachLast30d?: number;
    }>;
    euTotalReach?: number;
    primaryLanguages?: string[];
  };
  policy: {
    industryGroup?: string;
    industrySubCategory?: string;
    industryCode?: string;              // canonical taxonomy code (alaric Phase 28)
    adsPolicyRelevant?: boolean;
    mandatoryLegal?: string[];
    tabooWords?: string[];
  };
  meta: {
    state: "rich" | "thin" | "empty";
    lastEnrichedAt?: number;            // Unix ms
    reportTypesPresent: string[];       // e.g. ["meta_advertising_activity", "intelligence_synthesis"]
  };
}
```

**Pulled from** (alaric DB):
- SF Account fields (`Name`, `Description`, `Industry`, `BillingCountry`)
- alaric `companies.signals` (Phase 27/28: `isOnboardedClient`, `isActivelySpending`, `trailing12MonthRevenue`, `revenueByPlatform`, `revenueTimeline`, `pipeline`, `sfReportingCountry`, `sfReportingCountryCode`, `sfBillingCountry`, `sfManagingEntity`, `clientPlatforms`, `lastCloseWonDate`)
- alaric `intelligence_reports` rows where `is_current = true` — every type, no cost-bounding (`meta_advertising_activity`, `tiktok_advertising_activity`, `google_advertising_activity`, `ms_advertising_activity`, `web_presence`, `intelligence_synthesis`, `organic_social_activity`, `company_intelligence`)
- alaric `company_industries` join → canonical 119-category taxonomy with `ads_policy_relevant` flag

**Computed projection rules:**
- `commercial.creativePosture` derived from `(isOnboardedClient × isActivelySpending × lastCloseWonDate)` with 18-month-recency cutoff for lapsed-vs-dormant.
- `competitive.longestCampaignDays` = `max` across all per-platform reports.
- `creative.pitchAngles[]` = deduplicated union across per-platform `tactical_brief.pitch_angles`.
- `creative.valueProposition` = cross-platform `intelligence_synthesis.profile.value_proposition` wins; falls back to first per-platform `tactical_brief.value_proposition`.
- `creative.salesBriefing` = cross-platform synthesis when present, else first per-platform `tactical_brief.sales_briefing`.

**Wire compat:** mirror type lives in `wb-voices/src/lib/alaric-client.ts`; canonical lives in `alaric/src/lib/salesforce/account-lookup.ts`. Adding new fields to slots is additive (mirror lags one deploy, then catches up). REMOVING fields requires both apps to deploy the change in lockstep.

### `SfClientBundle` (alaric → ACA wire shape)

The full response from `GET /api/aca/sf-client?accountId=…`:

```ts
interface SfClientBundle {
  account: SfAccountFull;                  // SF Account record (Name/Industry/Description/BillingCountry/Status__c/Website)
  intelligence: BrandVoiceExtract | null;  // @deprecated v4 — kept for back-compat
  intelligenceAge: number | null;          // seconds since the report was generated
  alaricProfile: AlaricCompanyProfile | null;  // @deprecated v4 — superseded by dossier
  dossier: BrandDossier | null;            // v4 — the load-bearing field, null when alaric has no companies row
}
```

**Wire compat:** `intelligence` + `alaricProfile` are still emitted by alaric on every response. Old ACA callers reading them keep working. New ACA callers prefer `dossier`. `renderEnrichmentSections` falls back to the legacy fields ONLY when `dossier === null` (i.e. alaric has no `companies` row at all — orphan SF account).

### Voice catalogue: descriptions surfaced at search time

`voiceCatalogueService.getVoicesForProvider()` calls `enrichWithDescriptions()` automatically before returning. Pulls Neon `voice_descriptions.description` into the voice's `personality` field. Without this, `search_voices` returned `description=undefined` and the agent had no way to discriminate "Sara — Premium Humanlike Arabic Voice" from "Hugo from Paris — Middle-aged french man" when both appeared in a French search. The Neon table has 249 voice descriptions today.

**Performance:** one bulk Neon read per `getVoicesForProvider` call, joined by `voice_key = "{provider}:{externalId}"`. Sub-100ms in our cardinality. Caller path: `searchVoices → getVoicesForProvider → enrichWithDescriptions`.

### Voice catalogue: multilingual voices deprioritized in language searches

ElevenLabs multilingual voices (`Belma`, `Sara`, etc.) get registered for every language in their `verified_languages` array — same `externalId`, 19+ language slots. They genuinely speak all of them but with the creator's underlying acoustic identity, gravitating to the top of every shuffled pool.

`searchVoices` applies `stableSortByMultilingual()` AFTER the seeded shuffle: voices with `capabilities.isMultilingual === false` come first, multilinguals after, ordering preserved within each tier. Roger / Hugo / native voices float to the top of French searches; Belma is still findable, just lower.

The flag was already populated at ingest time (`isMultilingual: voice.verified_languages.length > 1` in `voiceProviderService`); v3.5 just consumes it. No catalogue rebuild required.

### Redis keys

**No key namespace changes.** All v3 keys (`ad:{adId}:meta`, `ad:{adId}:{stream}:versions`, `ad:{adId}:{stream}:active`, `ad:{adId}:{stream}:v:{versionId}`, `ad:{adId}:{stream}:counter`, `ad:{adId}:mixer`, `ad:{adId}:preview`, `ad:{adId}:conversation`, `session:{sessionId}:ads`, `voice_tower`, `voice_data_tower`, `counts_tower`, `ads:by_user:{ownerEmail}`, `ads:all`) are unchanged.

**Added:**

```
tag-lint:metrics:{adId}:{versionId}  →  hash {
  adId, versionId, writtenAt, trackCount,
  track:0: {trackIndex, openingStackSize, bodyTags, totalTags, accentPresent, lintPassed, violations}
  track:1: ...
}  TTL: 30 days (auto-evict)
```

Per-track tag distribution metrics. Body-tag and total-tag counts are MEASURED but NOT enforced — they're the signal for A/B testing the Stage N tag-weaver over time. Read-only telemetry; nothing in the runtime path depends on it. Safe to wipe.

**Removed:**

- `ad:{adId}:enrichment-cache` — Stage R user-explicit prefetch cache. Created in v3, deleted in v4 Stage U after the architecture was ruled wrong-shaped. The dossier path fetches fresh on every generation. Never went to prod customers; only briefly visible in dev. No migration needed; stale keys auto-evict on the 24h TTL set by the now-deleted writer.

### HMAC contract (alaric ↔ ACA wire)

Service-to-service auth between ACA and alaric uses HMAC over `(timestamp + method + path + sha256(body))` with `consumer_id: "aca"` binding and a 60s replay window.

**v3 migration:** the previous `x-aca-*` header scheme was migrated to canonical `x-aleph-*` headers per the alaric team's convention. Both schemes are accepted on alaric's verifier during a transition window (legacy header path is the fallback when the canonical path fails).

**Header set** (request, signed):
```
x-aleph-consumer: "aca"
x-aleph-timestamp: <unix_seconds>
x-aleph-signature: <hex_hmac_sha256>
```

**Compat policy:** alaric MUST keep accepting both `x-aca-*` and `x-aleph-*` until both apps are confirmed deployed with v4. After that, the legacy `x-aca-*` path can be retired in alaric (one extra deploy).

**Shared secret:** `ACA_ALARIC_SHARED_SECRET` env var set on BOTH apps with the same value. Rotation = `vercel env add` on both projects + simultaneous redeploy.

### `/api/aca/*` endpoint surface (additive)

Public contract for the ACA → alaric service-to-service surface. All HMAC-verified. All additive — none of these existed in V3 baseline.

| Route | Method | Body / Query | Returns |
|-------|--------|--------------|---------|
| `/api/aca/fetch-content` | POST | `{ url: string, policy?: PolicyName }` | `FetchResult` (alaric tiered fetch result minus `attempts` audit trail) |
| `/api/aca/sf-search` | GET | `?q=<query>&limit=<n>&clientPlatforms=<csv>&market=<alpha-2>` | `SfAccountSearchHit[]` (id, name, website, industry). `market` filter (alpha-2) added post-v3.5 — composes with `clientPlatforms` (intersect, both ANDed in SOQL). Validation: `^[A-Za-z]{2}$`; non-alpha-2 values 400. |
| `/api/aca/sf-client` | GET | `?accountId=<sfId>` | `SfClientBundle` (see above) |
| `/api/aca/enrich-company-async` | POST | `{ accountId: string }` | `202 { status: "enqueued" \| "in_progress" \| "noop_fresh" \| "noop_no_company" \| "noop_no_domain" \| "dispatch_failed", jobId? }` |
| `/api/aca/markets` | GET | `?platform=<spotify\|...>` (optional) | `{ markets: MarketRow[]; totalCount: number; generatedAt: string }`. 86 alpha-2 markets with `{ code, name, region, aliases[], tld, platformCoverage{}, language: { code, name, script, commerceVocabulary[], legalDescriptors[] } }`. Cache-Control headers (`max-age=60, s-maxage=300, swr=300`) on alaric side. When `platform` is set, drops markets where the platform is `unsupported`; `empty` markets stay (campaigns can still run there). |

**Compat policy:** new fields on response shapes are additive (mirror types in ACA may lag; legacy response shapes still validate). Removing fields requires lockstep deploy.

### Breaking changes (the small list)

For an industrialization team checking which deploys must be coordinated:

| Change | Impact | Coordination |
|--------|--------|--------------|
| HMAC header scheme migrated `x-aca-*` → `x-aleph-*` | ACA → alaric service-to-service requests | alaric accepts both during transition. Once both apps run v4, legacy can be retired (one extra alaric deploy). |
| `ProjectBrief.enrichWithWebSearch` ignored | Generate routes no longer honor the toggle | None — field still decodes; agent just doesn't see the directive anymore. UI control gone. |
| Hosted `web_search` removed from agent loop | Agent can no longer call OpenAI's hosted web_search mid-iteration | None — replaced by alaric BrandDossier for SF brands; standalone-brand fallback held for v4 Stage W. |
| Two-pass tag-weaver runs inside `createVoiceDraft` | Each ElevenLabs voice draft generation triggers N additional OpenAI calls (one per track, pass 2) | Cost: ~1 extra `gpt-5.5` call per ElevenLabs track. Falls back gracefully on error (uses pass-1 text). Set `TAG_WEAVER_MODEL=<other>` env var to override. |
| `ad:{adId}:enrichment-cache` Redis key removed | None for prod — never went to real customers | Stale dev keys auto-evict on 24h TTL. |
| `enableWebSearch` adapter request flag, `webSearchCallCount` adapter response field, `web_search_start` SSE event removed | Internal types only — no external consumers | None. |
| `salesforceAccountId` (top-level) marked `@deprecated` | Still emitted, still read | New writers mirror both `brand.salesforceAccountId` AND top-level. Eventual cleanup is a future stage. |
| `ProjectBrief.toneOfVoice` (`ToneOfVoiceTag[]`) removed in post-v3.5 merge | None for prod — never shipped. Local-only v3.5 internal field replaced by Sergiu's `selectedTone` + `voiceInstructions`. | If any prod brief somehow carried the field, JSON.parse silently ignores. Knowledge-context plumbing also removed; tag-weaver no longer reads it. |
| `ProjectBrief.brandVoice` no longer in form, no longer read by generate routes | Free-text "brand archetype" field retired in favour of alaric `BrandDossier` projection | Field stays on type as `@deprecated` for legacy decode. BriefPanelV4 surfaces legacy values in a read-only `<details>` block. Removal-pending. |
| `selectedRegion` semantic shift (voice-region taxonomy → alaric alpha-2) | Brief panel writes alpha-2 codes; generate routes still pass it through unchanged | Legacy non-alpha-2 values render with `(legacy)` suffix in MarketPicker; re-pick promotes. SF-search now accepts `?market=<alpha-2>` filter. |
| `/api/sf-accounts/search` + `/api/brands/recent` deleted | Folded into `/api/brand-context` discriminated-union route | Both endpoints had zero clientside callers in the merged tree (BriefPanelV3 was deleted in the same commit). No external consumers. |
| Mixer `getMixerState` / `updateMixerState` Redis helpers deleted | Mixer is a versioned stream now (`ad:{adId}:mixer:v:{versionId}`) | The legacy single-blob `ad:{adId}:mixer` key is no longer written; readers consume the active mixer version via `getActiveVersionData(adId, "mixer")`. Alexandru's pre-merge ad-duplication route was rewritten to clone the four versioned streams uniformly. |

**Not breaking** (additive, safe to deploy independently):
- New ProjectBrief fields (`brand`, `creativeAngle`, `varianceMode`, `referenceUrls`, `forbiddenWords`, `providedScript`, `selectedCTA`, `selectedTone`, `voiceInstructions`, `campaignFormat` enum extension) — every reader handles undefined.
- `VoiceVersion.knowledgeContext` and `tagLintWarnings` — both optional.
- `VoiceTrack` provider-specific fields (`dialectId`, `performanceId`, `emotion`, `description`, `voiceInstructions`, post-processing fields) — all optional.
- `BrandDossier` shape — every slot + every field optional.
- `SearchVoicesResult.description` / `casting_note` / semantic axes / `broadened_from` — additive.
- `tag-lint:metrics:*` Redis hash — read-only telemetry.

### Migration / rollout notes

- **No DB migrations required** on the ACA side. All shape changes are additive at the JSON level.
- **No alaric DB migrations required** for the v3.5 surface. Alaric's own Phase 27 + 28 schema changes (industries table seeding, signals field expansion) are documented in alaric's `docs/architecture.md` and predate v3.5.
- **Voice catalogue rebuild not required.** The multilingual flag is read from existing `capabilities.isMultilingual` field (was already populated at ingest); descriptions are read from the existing `voice_descriptions` Neon table via runtime overlay.
- **Half-deployed states are tolerable** for the wire shapes (ACA ↔ alaric): the canonical v4 path uses `dossier`, the legacy path falls through to `intelligence + alaricProfile`. Either ACA or alaric can deploy first. The HMAC migration is the only contract that needs lockstep (both apps need each other's secret + header parsing).
- **Rolling back v4 → v3** at the application level is safe: legacy fields are still emitted, legacy headers still accepted on alaric. The deleted Redis keys won't be re-populated but no reader expects them in v3 baseline.

---

## v3.5 stage history (chronological)

### Voice casting overhaul (Stages 1–4)

The product had a chronic "every ad cast the same handful of voices" problem. Diagnosis traced it to two compounding issues: deterministic provider-cache ordering meant `search_voices` returned the same top-N voices for every brief with the same filter shape; and the agent loop wasn't honoring per-version creative-direction context (an iteration "redo this in Japanese with OpenAI voices" lost the original brief's pacing / format / accent intent because no snapshot was carried forward).

- **Stage 1 — Per-version `KnowledgeContext` snapshots.** Every voice version stores the `KnowledgeContext` (pacing, accent, region, language, voiceProvider, campaignFormat, toneOfVoice, brandVoice, hasProvidedScript) that produced it. Iterations inherit by default; explicit context wins on first generation from the brief. The `reconcileContextFromTracks` helper updates inherited language / provider / accent from the actually-cast voices when the LLM iterates with new providers ("redo in Japanese OpenAI"). Snapshot lives on `VoiceVersion.knowledgeContext` in Redis. ElevenLabs prompt module reads it to emit the right pacing / accent guidance per iteration.
- **Stage 2 — Semantic search filters.** `search_voices` accepts six structured-metadata filters (`age_bracket`, `energy`, `warmth`, `pace_tendency`, `use_case`, `dialect_register`), enforced uniformly across all providers via `synthesizeMetadata` (closes the gap between providers with thin native metadata vs. ElevenLabs's rich `labels.*`). Voices missing data on a requested axis pass through (no false elimination). Tool definitions exposed to the agent so it can narrow by casting intent: "playful young female with mid energy" maps to filters, not free-text.
- **Stage 3 — Synthesized metadata layer.** New `voiceMetadataSynthesis.ts` projects every provider's native fields into the same six structured axes + a one-line `casting_note` ("when to cast this voice"). The `casting_note` is the vibe-glue discriminator the agent reads when multiple voices pass the structural filter. Used by `voiceMatchesFilters` for the runtime filter, and by `search_voices` to enrich each result.
- **Stage 4 — `adId`-seeded shuffle.** `searchVoices` shuffles the filtered pool with `fnv1a32(adId + provider + language + gender + accent + age_bracket + energy + warmth + pace_tendency + use_case + dialect_register)` as the seed before slicing the top-N. Same ad re-runs get the same casting (mixer reproducibility); different ads get different sets. Seed includes every filter dimension so progressive narrowing changes the ordering — otherwise an LLM that starts broad and narrows would keep seeing the same top voices.

### Per-track provider conversion + cogwheel parity

The cogwheel on `ScripterPanel` (per-track iteration entry point) previously only fired for ElevenLabs / OpenAI / Lovo voices — Lahajati, ByteDance, Qwen tracks had no path to "redo this single line with different provider." Workflow: open a 3-voice dialog, decide one Spanish voice should be Lovo not OpenAI, want to swap that single line without re-generating the whole script.

- **`/api/ai/convert-voice-track`** (new) — POST endpoint takes `{fromProvider, toProvider, text, voiceInstructions, dialectId, performanceId, emotion}`, returns `{text, voiceInstructions, dialectId?, performanceId?, emotion?}`. Translates voice-control fields between provider grammars: OpenAI structured `Voice Affect / Tone / Pacing / Emotion / Emphasis / Pronunciation / Pauses` ↔ Lahajati Arabic persona text ↔ ByteDance free-text style + emotion enum ↔ ElevenLabs baseline-tone token. Same-provider short-circuit returns input unchanged. Sanity-checks provider-specific fields (e.g. ByteDance emotion enum membership) so we never persist garbage.
- **Cogwheel availability** — extended to all six providers. `VoiceInstructionsDialog` got an Arabic persona placeholder + Lahajati `dialectId` / `performanceId` controls + ByteDance emotion picker.

### GPT-5.5 migration

Model bump from `gpt-5` to `gpt-5.5` across the codebase. Two callsites: the agent loop (`OpenAIAdapter.invoke` in `tool-calling/adapters/`) and the per-track conversion endpoint (`/api/ai/convert-voice-track`). Both use the Responses API.

Knobs settled after experimentation:
- **Reasoning effort: `medium`.** Initial proposal was `low` for the first generation (cheaper, faster). User pushed back: *"the agent needs to consider full input from BriefPanelV3 including thinking about the brand voice"* — kept at `medium`.
- **Output verbosity: `low`.** The agent loop produces tool calls, not long prose. GPT-5.5's migration guide recommends `low` for concise responses; tool preambles (the 1-sentence reasoning before each call from the system prompt) are independent of `text.verbosity` and still emitted.
- **`previous_response_id` continuity.** Same as v3 — chain-of-thought retained across iterations via the response ID, not by manually echoing assistant items.
- **24-hour prompt caching.** Built-in.

The hosted `web_search` tool was wired during this window (Stage 4 of the brief expansion), then deleted in v4 Stage X after the alaric BrandDossier replaced it for SF-backed brands.

### Creative prompting system rewrite

The previous system prompt was process-first ("FOLLOW EXACTLY: 1. read state, 2. search voices, 3. don't call the same tool twice in a row, …"). With GPT-5.5 that produced overthinking — the model burned reasoning tokens on process compliance instead of creative variance. Rewritten outcome-first.

- **Senior creative director persona** (`getBaseSystemPrompt` in `src/lib/knowledge/builder.ts`). "You write for the ear, not the page. You assume the listener can skip in three seconds and you earn attention with specifics, not adjectives." Three success criteria for "what good looks like": first sentence makes the listener pause; one specific detail makes the ad memorable; CTA is the natural conclusion of a small story.
- **Six campaign formats with structural guidance.** `ad_read` / `dialog` / `testimonial` / `vox_pop` / `dramatized_scene` / `radio_skit`. Each format gets a casting hint + structure recipe in the system prompt. Dialog: "two voices in natural conversation, contrasting but complementary, search twice once per voice." Testimonial: "single voice as a real customer, first-person, falsifiable details, don't open with the brand name." Vox pop: "2–4 voices, one sentence each, different ages/accents, like street interviews." Dramatized scene: "small scene, characters in a situation, the product is the punchline."
- **Working pattern** — explicit numbered steps for new ads ("read_ad_state once, search_voices at most twice per voice slot, then emit `create_voice_draft` + `create_music_draft` + `create_sfx_draft` together in a SINGLE tool-call batch followed by `set_ad_title`"). Tightened in v3 after the over-search regression.
- **Output rules** — "Use the tools to create drafts. Don't return JSON in your reply. Per-provider script + acting-instruction syntax follows the provider-specific module below — that's load-bearing, not optional."

### Brief expansion fields

The brief panel grew substantially during this window (before the alaric integration came on top). Fields added to `ProjectBrief`:

| Field | Render path | Notes |
|-------|-------------|-------|
| `toneOfVoice` | `## Brand register` chips → injected into `KnowledgeContext` for ElevenLabs module | 11 canonical tags (warm / urgent / playful / authoritative / conversational / earnest / sardonic / tender / confident / intimate / irreverent). Multi-select. Distinct from per-voice acting tone — this is brand-level. |
| `brandVoice` | `## Brand voice (free-text)` block in user message | One-paragraph archetype. Examples: "underdog with quiet confidence — never claims authority, earns it through specifics" / "luxury brand told from the artisan's perspective, not the marketing team's". |
| `referenceUrls` | `## Reference Page Content` block per URL (URL-type aware extract) | Alaric's tiered fetch cascade scrapes; URL-type detection runs per URL. Was originally rendered into prompt verbatim in v3 stage 3; the alaric fetch wiring landed in stage A–E. |
| `forbiddenWords` | `## Avoid these words / phrases` block | Regulatory / brand / cliché bans. Pre-fillable from alaric `policy.tabooWords` when present. |
| `providedScript` | `## Provided Script (USE VERBATIM)` block | Use-verbatim mode — agent only writes acting instructions / music / SFX around it. Doesn't translate, paraphrase, or edit. |
| `creativeAngle` | `## Creative angle (THIS spot only)` block | The variance — what makes this ad different from every other ad for this brand. Brand voice = constant; angle = variance. Soft warning when alaric/SF or `referenceUrls` are populated but `creativeAngle` is empty (the brand-anchored output loses per-spot edge). |
| `selectedCTA` | One of 22 canonical tokens | apply-now / book-now / shop-now / etc. + `none`. |
| `campaignFormat` | extended to 6 values | See above. |
| `varianceMode` | reserved | `"anchored" \| "exploratory"`. Forward-compat field for Stage F (transcript-level retrieval, opt-in). Not yet UI-surfaced. |

Each field has a corresponding section helper in `buildUserMessage` in both `/api/ai/generate/route.ts` and `/api/ai/generate-stream/route.ts`.

### Streaming SSE generate endpoint

`/api/ai/generate-stream` (new alongside the legacy non-streaming `/api/ai/generate`). Same agent loop, same prefetch, same prompt assembly — but switches from `responses.create` to `responses.stream` and forwards model events to the client over SSE. UI renders tokens / tool calls / draft completions as they arrive. Wall-clock latency unchanged; the perceived-latency win is the user not staring at silence for 30+ seconds.

Event vocabulary (`StreamUpdateEvent` union in the route file): `llm-thinking`, `model-text-delta`, `model-tool-call-start`, `model-tool-call-args-delta`, `drafts-created`, `voice-generating`, `voice-ready`, `voice-failed`, `mixer-rebuilt`, `done`. The `model-web-search-start` event lived here briefly in v3 stage 4 then got removed in v4 Stage X.

### Lahajati + Smart Speed + draft persistence fixes

Three smaller cuts shipped in this window:
- **Lahajati provider polish.** `LahajatiVoiceProvider` got dynamic dialect fetching, 339 Arabic voices + 116 dialects cached in Redis, accent → dialect_id mapping (e.g. "المصرية" → "egyptian" → dialect 7), `input_mode: "1"` for custom Arabic role instructions. Knowledge module had a stuck-state where TTS preview failed for newly-cast Lahajati voices — fixed by ensuring the provider config flows through the cogwheel iteration path.
- **Smart Speed for Qwen + ByteDance + Lovo.** Generalized the post-processing time-stretch (`postProcessingSpeedup`, WSOLA) so providers without native speed control get the same lever. ElevenLabs uses both native + post-processing; Qwen / Lovo / ByteDance use only post-processing.
- **"Request a change" survives focus loss.** The iteration entry-point textarea on `ScripterPanel` lost typed content if the user blurred away (e.g. switched tabs to read a reference URL). Now drafts to local state until explicit cancel/submit.

### NextAuth split (Edge-safe middleware)

`src/auth.ts` split into `auth.ts` + `auth.config.ts` per NextAuth v5's split-config pattern. The base config (`auth.config.ts`) is Edge-safe (no Node-only imports, no DB callbacks); the full config (`auth.ts`) imports the Drizzle adapter + DB-backed callbacks. Middleware (`src/middleware.ts`, soon to be renamed `proxy.ts` per Next.js 16 deprecation) imports `auth.config.ts` only — keeps the Edge runtime green. Triggered by a 401 incident: stale JWT cookies couldn't decrypt after the refactor; users had to clear cookies and re-sign-in.

### Two-pass ElevenLabs tag-weaving (Stages K / L / M / N)

**Symptom:** every emotional tag clustering at the start of voice lines, no body weave, no accent tag despite cast voice carrying parisian metadata. Architecture fix, not a prompt patch.

- **Stage K — Cast-voice-derived accent.** Lint and weaver read accent from each track's cast voice (`track.voice.accent` via `accent-policy.ts`), not from `brief.selectedAccent`. Cast voice wins over brief request. Canonical form: `[strong french accent]` (matches ElevenLabs docs).
- **Stage L — Mechanical-only lint** (`src/lib/tools/validation/voice-tag-lint.ts`). Three rules: accent presence (when cast voice has enforced accent), opening stack ≤ 8 tags, syntax well-formed. Body-weave placement is creative judgment, NOT linted — that was the wrong architecture. Pure function, 15 unit tests pinning the rules.
- **Stage M — Pass-1 prompt simplified** (`src/lib/knowledge/modules/elevenlabs-voice.ts`). The agent's pass-1 prompt no longer carries the full Layer-1/Layer-2 tag teaching. Hides the existence of pass 2 entirely (the previous "you write the script, pass 2 weaves tags" framing made the agent over-coordinate and over-search). The agent just writes clean prose; tags appear in the persisted track text via the post-processor.
- **Stage N — Focused pass-2 tag-weaver** (`src/lib/tools/validation/tag-weaver.ts`). Runs per ElevenLabs track in parallel inside `createVoiceDraft`, after voice resolution and before Redis write. Small focused prompt: clean line + cast voice metadata + 4 ElevenLabs canonical examples + accent/pacing rules. `gpt-5.5` with `reasoning.effort: "low"`, 15s deadline. Sanity floor: rejects output diverging >25% in alphabetic length. Falls back to pass-1 text on any error.

### Loose alaric integration (Stages A–E + H–J + P–S + U–Y)

Two sibling Next.js apps, one dev. Alaric has a battle-tested tiered fetch cascade (T0 direct → T1 Jina → T3 Puppeteer) and a Salesforce OAuth client; ACA shouldn't rebuild either.

**Auth (Stage A — `src/lib/aca-auth.ts` on alaric, `src/lib/alaric-client.ts` on ACA).** HMAC over canonical `(timestamp + method + path + sha256(body))` with `consumer_id: "aca"` binding and a 60s replay window. Single shared secret `ACA_ALARIC_SHARED_SECRET` on both apps. Migrated in v3 from a legacy `x-aca-*` header scheme to canonical `x-aleph-*` headers per the alaric team's convention.

**Endpoint surface on alaric** (under `/api/aca/*`, all HMAC-verified):
- `POST /api/aca/fetch-content` — wraps `fetchContent(url, { policy })`.
- `GET /api/aca/sf-search` — Salesforce Account name-prefix search. v3 Stage P added `?clientPlatforms=spotify` filter (joins alaric `companies.signals.clientPlatforms` first, then bounds SOQL by `Id IN (…)`). Excludes accounts with `!Blocked` name prefix at the SOQL level.
- `GET /api/aca/sf-client?accountId=…` — bundled Account + intelligence + alaric profile + (v4) BrandDossier in one shot.
- `POST /api/aca/enrich-company-async` — fire-and-forget enrichment trigger (Stage J). Returns 202 with `status: "enqueued" | "in_progress" | "noop_fresh" | "noop_no_company" | "noop_no_domain" | "dispatch_failed"`. Idempotency guard via alaric's `getActiveEnrichmentJob`; staleness window 48h.

**Brief enrichment pipeline** (`src/lib/brief-enrichment.ts`):
- `prefetchBriefEnrichments({ adId, salesforceAccountId, referenceUrls })` — fans out SF lookup + per-URL fetches in parallel, capped at a 12s wall-clock deadline. Anything slow gets dropped silently with a structured log line — alaric being unreachable should never block generation.
- URL-type detection: `homepage` → tagline + lede (1200 chars); `press_release` → lede + headline (2000 chars); `product` → full readable (4000 chars); `reference_ad` → excluded by default (regression-to-the-mean trap held for Stage F).
- `renderEnrichmentSections(prefetched)` — produces the `## Brand Dossier — {name}` block (v4) or legacy `## Client (from Salesforce)` + `## Brand Voice — extracted` blocks (when dossier is null) + `## Reference Page Content`. Empty slots omitted.

**Stage J — async enrichment trigger.** When alaric returns `intelligence: null` for an SF-backed brand, ACA fires `triggerEnrichCompany(accountId)` and forgets. Alaric's job system runs the 5-minute multi-platform orchestration in the background. Next brief for the same client gets warm cache. Sync wait UI is held for v4 Stage W.

**Stage P — Spotify-clients-only picker default.** Brand picker defaults to surfacing only SF accounts that alaric has tagged with `clientPlatforms ∋ "spotify"`. Empty results auto-fall-through to unfiltered (Red Bull / Heineken-style global brands not yet tagged Spotify in alaric still surface) with an inline notice "No Spotify match — showing all Salesforce accounts". Manual toggle still available.

### Brief panel UX (Stages H + I + Q + Y + collapsibles back)

- **Stage H — unified Brand picker + Recents row.** Replaces the old SF-only picker. Single picker handles SF-backed brands (~80% case) + standalone brands (APAC pitch tools, prospects). Recents row above the picker derived from `ads:by_user:{ownerEmail}` (no new persistence layer — recents come from existing ad history).
- **Stage I — per-brand brief inheritance.** Picking a Recent or known brand pre-fills inheritable fields from the most recent brief for that brand: `toneOfVoice`, `brandVoice`, `selectedLanguage`, `selectedRegion`, `selectedAccent`, `forbiddenWords`. NOT inheritable (per user direction): `selectedProvider`, `selectedPacing`, `campaignFormat` — kept per-spot for A/B testing. Silent auto-fill on empty briefs; inline "Use last settings for {brand}?" amber banner when brief has content (never silently overwrites work).
- **Stage Q + Y — three flat collapsibles.** Replaced the single "Advanced creative direction" expander with three sibling collapsibles: **Brand & market** (picker + Recents + Stage I prompt), **Creative brief** (creativeAngle + toneOfVoice chips + brandVoice), **References** (referenceUrls + forbiddenWords + providedScript). No emojis (per user feedback — `feedback_no_emojis_in_ui` memory codifies the rule). No "(N set)" pills. Title + 1-line blurb + chevron.

### v4 chrome amputation (Stages U + V + X)

Stage R in v3 had shipped an explicit "Enrich brief" button + result-card panel as the answer to "no black-box enrichment." On real client testing (Heineken Bulgaria, SF-backed but no alaric profile), the result card rendered: *"Salesforce + alaric / Heineken Bulgaria"* — the brand name, again. Empty success theater. User feedback was sharp: *"you ran enrichment but displayed nothing? what is the point of doing it, then?"* + *"why are there two 'enrich' actions, one in pane 1 and the other in pane 2?"* + *"NO EMOJIS IN UI!!!"*.

Audio-ads-creative-expert agent diagnosed it: two surfaces doing one job, badly. v4 collapsed them.

- **Stage U — Stage R chrome deleted.** Two routes (`/api/ai/enrich-brief`, `/api/ads/[id]/enrichment-cache`) deleted entirely. `BriefEnrichmentCacheRecord`, `getEnrichmentCache`, `setEnrichmentCache` stripped from `redis/versions.ts`. `BriefEnrichmentPanel`, `SourceCard`, `formatCacheAge`, `renderSfSummary`, `formatRevenueCompact`, `truncate`, `EnrichmentCachePayload`, `EnrichmentInputsSnapshot`, four `enrichment*` state hooks, `handleEnrichBrief`, `redactEnrichmentCache`, hydration `useEffect`, `enrichmentStale`, `canEnrich`, `computeEnrichmentInputsHash`, `runOneShotWebSearch`, `renderEnrichmentSectionsFromCache`, `renderWebSearchSection`, `extractResponseText`, the OpenAI client + import, `WEB_SEARCH_DEADLINE_MS`, the cache-first reads in both generate routes, all three emoji `icon` props on `BriefSectionHeader` — all gone. ~2 files deleted + ~370 lines stripped from `BriefPanelV3.tsx`.
- **Stage V — BrandDossier projection** (the load-bearing replacement). See Data Model section above. Server-side `getCompanyFromSalesforce` extended to fetch all current `intelligence_reports` rows + project them via `projectBrandDossier()` into the 5-slot shape. ACA `renderBrandDossier()` produces a single multi-section prompt block. NO cost-bounding — every report row is folded in.
- **Stage X — web search disentangled.** Legacy `enrichWithWebSearch` toggle deleted. Hosted-tool `web_search` path stripped from `OpenAIAdapter`. `enableWebSearch`, `webSearchBudget`, `webSearchCallCount`, `web_search_start` SSE event, `webSearchCallCount` adapter response field — all removed. ~80 lines stripped across 7 files. The replacement for SF-backed brands is the BrandDossier (strictly richer than what hosted search produced); standalone-brand fallback is held for Stage W.

---

## Post-v3.5 reconciliation — BriefPanelV4 + team merges

After v3.5 was committed locally on `mixer-version-stream` but before it shipped, two parallel workstreams from teammates landed on `bitbucket/main`. Reconciling those plus a deliberate brief-panel restructure produced what currently runs at `mixer.alephcreative.cloud`.

### Sergiu's tone-of-voice admin pipeline (adopted as canonical)

Pre-merge, v3.5 had its own tone-of-voice surface: an 11-value closed enum (`ToneOfVoiceTag`) rendered as a chip multi-select, framed as "brand register / tone of voice." Comma-joined into a `## Brand register` bullet in the prompt.

Sergiu independently shipped a different mental model on `main`:
- DB-backed `suggested_tones` table (Drizzle migration `0002_add_suggested_tones`): `{ id uuid, title, description, voice_instructions, is_active, timestamps }`. Five seeded presets (Professional / Energetic / Warm / Authoritative / Sarcastic).
- Admin CRUD at `/admin/tone-of-voice` (list / new / edit / delete) gated by the `admin` role middleware, with an "Generate instructions with AI" button calling `gpt-5.4` to draft prosody-focused voice instructions for a given title + description.
- Public read-only `GET /api/tone-of-voice` (active-only, sorted newest first) consumed by the brief panel.
- Service: `src/services/suggestedTonesService.ts` with full CRUD via Drizzle.
- `ToneSelector` UI primitive: Headless UI `Listbox` single-select dropdown.
- Brief shape: `selectedTone?: string | null` (preset id) + `voiceInstructions?: string | null` (resolved prose).

The two pipelines were orthogonal mental models — multi-select tags ("how the BRAND should feel") vs. single preset → resolved prosody string ("how the line is read"). The user picked **Sergiu's pipeline as canonical**, dropping our naive enum entirely.

What landed in this revision:
- `ToneOfVoiceTag` union type + `ProjectBrief.toneOfVoice` field deleted (zero prod readers — never shipped).
- `KnowledgeContext.toneOfVoice` plumbing removed; `tag-weaver` brief-line composer no longer references it.
- All of Sergiu's files adopted verbatim: admin pages, admin API routes, public API route, service, `ToneSelector`, `Switch`, `ConfirmDialog` UI primitives, the `useToneOfVoice` hook (`src/hooks/useToneOfVoice.ts`).
- `selectedTone` and `voiceInstructions` plumbed through V4 → generate routes → per-track `VoiceTrack.voiceInstructions`. The LLM only ever sees the resolved `voiceInstructions` string; the preset id is UI state only.
- Template-seeding behaviour preserved: picking a preset auto-fills `voiceInstructions` from the template, but only if the user hasn't edited the textarea (ref-based "last-applied" tracking).

### Alexandru's ad-duplication feature (AAC-18, rewritten for v3.5 mixer streams)

Alexandru shipped `/api/ads/[id]/duplicate` + a `DuplicateAdPopup` component on `main`. The original implementation predated v3.5's mixer redesign:
- Read mixer state via `getMixerState(adId)` (single Redis blob `ad:{adId}:mixer`)
- Wrote it to the duplicate via `updateMixerState(newAdId, mixerState)`
- Cloned voice/music/sfx via `getActiveVersionData` + `createVersion` (per-stream, three streams)
- Rewrote `mixedAudioUrl` blob via `@vercel/blob` `copy()` so the duplicate is independent

In v3.5, `getMixerState` / `updateMixerState` are **deleted** — the mixer is a versioned stream (`ad:{adId}:mixer:v:{versionId}` + active pointer), and `MixerVersion` carries the entire arrangement (anchors, pins, overrides, cachedResolverOutput, mixedAudioUrl). Alexandru's route would not compile against v3.5 as-shipped.

The route was rewritten in this revision to clone all four streams uniformly:
- `getActiveVersionData(adId, stream)` for each of `["voices", "music", "sfx", "mixer"]`
- `mixer.mixedAudioUrl` rewritten via `@vercel/blob` `copy()` to a new blob path under `newAdId/...` (preview logo + visual the same way)
- `createVersion(newAdId, stream, data)` for each of the four streams
- `setActiveVersion(newAdId, stream, versionId)` to mark them as the active take
- `setAdMetadata` + `saveConversation` + `setPreviewData` for the surrounding context
- `ads:by_user:{email}` and `ads:all` Redis lists updated so the duplicate appears in the user's history

Slot ids carry forward unchanged from the source's content versions, so the cloned mixer's anchor graph stays valid against the cloned content streams (anchor → slotId references resolve correctly without remapping).

### BriefPanelV4 — three-topic restructure

Alexandru also shipped a refactor of the brief panel: extracted `BriefPanelBase` (the basic-fields renderer) from the v3.5 monolithic `BriefPanelV3`, plus a thin `BriefPanelV3` wrapper that delegated to it. Worth reusing.

Rather than mechanically port v3.5's enrichments back into the V3-style monolith, this revision restructured the panel into **three explicit topics**:

```
BriefPanelV4 (orchestrator: useState + Redis save + alaric implicit-on-save)
├── BrandTopic
│   Row: market (1/3) | brand picker (2/3 col-span)
│         + DossierSummary inline under brand (implicit-on-save fetch)
│         + read-only legacy <details> for ads with brandVoice populated
├── CreativeTopic
│   Heading row: h2 + subtitle (left) | tabbar (right)
│       Tabbar: "Brief the agent" / "I have the script"
│   Exposed row: brief | format (6-option listbox) | tone of voice
│   Collapsibles row 1: angle | instructions | references
│   Collapsibles row 2: forbidden | pacing | CTA
│   Bottom: duration slider full-width
└── LanguageTopic
    Heading row: h2 + subtitle (left) | provider button + Voice Manager link (right)
    Single row: language | voice region | accent (1/3 each)
```

Decisions worth carrying forward:
- **Three primary fields exposed** (creative brief, ad format, tone of voice). Everything else collapsed.
- **Custom script via tabbar, not collapsible.** Mirrors the music panel's mode-toggle idiom (`GlassTabBar` / `GlassTab` from `@/components/ui`). When in script mode, brief/angle/collapsibles all hide; brief save still includes both fields so toggling preserves edits.
- **Pacing / CTA / Tone collapsibles carry a badge** showing the current value (`Normal` / `Fast`, the matched CTA label, the matched tone preset title). User sees state without expanding.
- **Default pacing is `"fast"` for new briefs** (most Spotify spots run hot). `??` semantics preserve explicit `null` from existing briefs where the user picked Normal.
- **Tab order**: small affordance toggles ("Show all" markets, "Spotify only" brands) carry `tabIndex={-1}` so Tab cycles primary inputs only.
- **`BriefPanelBase` retained for `DuplicateAdPopup`.** Full atomization deferred — V4 uses glass primitives directly inside topic shells; Base remains a monolithic form that DuplicateAdPopup consumes verbatim.
- **`BriefPanelV3.tsx` deleted.** Single brief-panel surface in the codebase post-merge.

Field placement reflects the user's exposure decisions during multiple iterations of feedback. Earlier drafts had creativeAngle exposed (audio-expert pushback for brand-anchoring ladder); the user later overrode that and demoted angle into the collapsibles row. Documented as a known decision-point in case the regression surfaces and we need to re-promote.

### Alaric markets endpoint integration

Alaric shipped `GET /api/aca/markets` (canonical 86-market mapping) during this window — a long-requested capability. ACA consumes it through:

- **`getMarkets({ platform? })`** in `src/lib/alaric-client.ts` — typed wrapper over `signedFetch`. Returns `MarketsResponse` with `markets: MarketRow[]`. Each market carries `{ code (alpha-2), name, region, aliases[], tld, platformCoverage{}, language: { code, name, script, commerceVocabulary[], legalDescriptors[] } }`.
- **`GET /api/markets`** (`src/app/api/markets/route.ts`) — thin proxy that signs the alaric call. Defaults `?platform=spotify`; `?showAll=true` escape hatch. Mirrors alaric's `Cache-Control` headers (`max-age=60, s-maxage=300, swr=300`) — no in-memory cache layer needed.
- **`MarketPicker`** subeditor — searchable `GlassyCombobox` (typeable filter against name + alpha-2 + alaric's `aliases[]` so `slovenian` / `slovenija` / `SI` all match Slovenia).
- **Market grounds the brand picker** — `marketAlpha2` flows into `/api/brand-context { kind: "search", marketAlpha2 }` → forwarded to alaric's `/api/aca/sf-search?market=SI`. SF search returns only accounts in that market. Composes (intersect) with `clientPlatforms` filter.
- **Market grounds language defaults** — picking a market sets `selectedLanguage` to `market.language.code` IFF the user hasn't already picked a language (don't clobber).
- **Legacy non-alpha-2 values gracefully degrade.** Pre-v4 `selectedRegion` values that don't match `^[A-Za-z]{2}$` skip the alaric filter (would 400) and render with a `(legacy)` suffix in the picker. Re-picking promotes to a real alpha-2.

`commerceVocabulary` and `legalDescriptors` ride along on every market record but are not yet plumbed into the LLM prompt — held as a "stretch" follow-up for a future revision (idiomatic native-language commerce verbs in scripts without the rep deciding "comprar" vs "compra" vs "comprá").

### `/api/brand-context` — single endpoint for brand picker lookups

Replaced two separate endpoints (`/api/sf-accounts/search` and `/api/brands/recent`) with one discriminated-union route. Both legacy endpoints **deleted**.

```ts
// POST /api/brand-context
type BrandContextRequest =
  | { kind: "sf-account"; accountId: string; marketAlpha2?: string }
  | { kind: "search"; query: string; marketAlpha2?: string; clientPlatforms?: string[]; limit?: number }
  | { kind: "greenfield"; marketAlpha2?: string; limit?: number }
  | { kind: "spotify-ad-manager"; campaignId: string; marketAlpha2?: string };  // 501 today

type BrandContextResponse = {
  brand: BrandRef | null;
  candidates?: SfAccountSearchResult[];   // for kind: "search"
  recents?: BrandRef[];                   // for kind: "greenfield"
  dossier: BrandDossier | null;           // for kind: "sf-account"
  market: MarketRow | null;
  enrichmentSummary?: { slotCount: number; lastEnrichedAt?: number };
};
```

- **`sf-account`** — picker resolves a picked SF account; returns `BrandRef` + `BrandDossier` (same shape `prefetchBriefEnrichments` embeds into the LLM message; **single source of truth** — UI badge and prompt embed read identical projection) + `enrichmentSummary` for the dossier badge.
- **`search`** — SOQL-LIKE search; default `clientPlatforms: ["spotify"]` (pass `[]` to bypass for greenfield workflows). `marketAlpha2` filter (validated `^[A-Za-z]{2}$`; non-alpha-2 silently dropped to avoid alaric 400s on legacy `selectedRegion` values).
- **`greenfield`** — derives the user's recent brands by aggregating `AdMetadata.brief.brand` across `ads:by_user:{email}` (deduped by case-insensitive `brand.name`).
- **`spotify-ad-manager`** — sealed-enum reservation. Returns `501` today; schema reserved so SAM ingestion can land without repainting the contract. `BrandRef.spotifyAdManagerSnapshot` slot reserved as a JSDoc-commented future field.

Implicit-on-save: `BriefPanelV4` posts `{ kind: "sf-account", accountId }` on brand pick and renders `DossierSummary` ("Dossier loaded — N slots, last enriched X ago") inline under the brand badge. **No manual "Enrich" button** — v3 Stage R lesson (manual enrich = empty success theater).

### Auth: Edge-safe NextAuth split

`src/auth.config.ts` split out from `src/auth.ts` so middleware can `NextAuth(authConfig)` without dragging the Drizzle adapter + Resend provider into Edge runtime. Edge bundle is JWT-decode-only.

- `auth.config.ts` — Edge-safe: Google provider gating, signIn callback (domain allowlist), session strategy. No DB adapter.
- `auth.ts` — Node runtime: extends `authConfig` with `DrizzleAdapter` + `Resend` (magic link) provider + DB-touching `jwt` / `session` callbacks. Imported by route handlers + server helpers.
- `middleware.ts` — uses the Edge-safe config; returns `401 JSON` for unauthenticated `/api/*` calls (was `302` to sign-in HTML, which broke fetch-based clients on JSON.parse).

Magic-link is the only auth path today. Google OAuth is gated by `process.env.GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET` and currently unconfigured.

For preview-domain deploys (e.g. `mixer.alephcreative.cloud` aliased to the `mixer-version-stream` branch): `AUTH_URL` must be branch-scoped on Vercel Preview env, NOT environment-blanket-scoped, otherwise the apex-valued Production entry can shadow. `AUTH_TRUST_HOST=true` set on both Production and Preview.

### Files added / deleted in this revision

**Added:**
- `src/components/BriefPanelV4.tsx`
- `src/components/brief-topics/{BrandTopic,CreativeTopic,LanguageTopic,CollapsibleSection}.tsx`
- `src/components/brief-topics/subeditors/{BrandPickerSubeditor,MarketPicker,DossierSummary,VoiceInstructionsSubeditor,ReferenceUrlsSubeditor,ForbiddenWordsSubeditor,CustomScriptSubeditor}.tsx`
- `src/app/api/brand-context/route.ts` + `__tests__/route.test.ts`
- `src/app/api/markets/route.ts` + `__tests__/route.test.ts`
- `src/app/api/ads/[id]/duplicate/route.ts` (Alexandru's, rewritten for v3.5 mixer streams)
- `src/components/DuplicateAdPopup.tsx` (Alexandru's, adopted verbatim)
- `src/hooks/useToneOfVoice.ts` (Sergiu's)
- `src/services/suggestedTonesService.ts` (Sergiu's)
- `src/app/admin/tone-of-voice/{page,new/page,[id]/edit/page}.tsx` (Sergiu's)
- `src/app/api/admin/tone-of-voice/{route,[id]/route,generate-instructions/route}.ts` (Sergiu's)
- `src/app/api/tone-of-voice/route.ts` (Sergiu's, public read endpoint)
- `src/components/admin/{ToneOfVoiceForm,ToneOfVoiceList}.tsx` (Sergiu's)
- `src/components/ui/{ToneSelector,Switch,ConfirmDialog}.tsx` (Sergiu's)
- `drizzle/migrations/0002_add_suggested_tones.sql` (Sergiu's)

**Deleted:**
- `src/components/BriefPanelV3.tsx`
- `src/app/api/sf-accounts/search/route.ts`
- `src/app/api/brands/recent/route.ts`
- v3.5 internal: `ToneOfVoiceTag` union, `ProjectBrief.toneOfVoice` field, `KnowledgeContext.toneOfVoice`, `tag-weaver` brief-line `tone=` segment

**Modified (notable):**
- `src/lib/alaric-client.ts` — added `getMarkets`, `MarketRow`, `MarketsResponse`, `PlatformCoverage`, `MarketLanguage` types; `searchSfAccounts` accepts `market?: string` opt
- `src/lib/redis/versions.ts` — `getActiveVersionData` uses `VersionFor<T>` so `mixer` stream type-checks; legacy `getMixerState` / `updateMixerState` deleted
- `src/types/index.ts` — `selectedTone` + `voiceInstructions` added; `brandVoice` + `enrichWithWebSearch` marked `@deprecated`; `ToneOfVoiceTag` removed
- `src/app/api/ai/generate{,/-stream}/route.ts` — drop `brandVoice` injection + `enrichWithWebSearch` reads + `toneOfVoice` plumbing; preserve `voiceInstructions` threading to per-track output

---

## Mixer redesign — version stream architecture

The mixer started v3.5 as the v3 architecture's last under-engineered surface — a single mutable Redis blob, ephemeral track IDs, fixed-phase legacy calculator, no concept of variants, no edit affordances. By the close of the window it is its own first-class version stream parallel to voices/music/sfx, with a stable slot-ID identity model, a five-primitive anchor graph that survives regeneration, a pure server-side resolver, and an editable timeline UI that reads back into the same arrangement model.

### Response to mixer-v3-concept.md

The December 2025 design doc (`docs/mixer-v3-concept.md`) correctly named the symptoms — 4+ recalculations per track add, ephemeral IDs that broke on regeneration, mid-timeline sfx overlaying the next voice, no foundation for manual editing — and proposed a path: semantic IDs (`voice-1` stable across regen), Command Pattern, 100ms `CommandBatcher`, Pure Calculator, `TimelineController` orchestration layer, hybrid persistence with `timelineState.version >= 2`.

What shipped is the same architectural intent with five substantive corrections:

| Mixer-V3 proposal | What v3.5 actually shipped | Why the change |
|-------------------|----------------------------|----------------|
| Semantic IDs (`voice-1`, `sfx-1`, `music-1`) baked into track IDs | **Slot IDs** minted server-side per stream version, decoupled from any user-facing label, stable across regeneration via ordinal-match copy through `parentVersionId` | The "semantic" framing conflated identity (slot) with order (ordinal) and produced a brittle string format. Slot IDs are opaque, mintable on slot inserts mid-stream, and survive ordinal reshuffles. |
| Client-side `CommandBatcher` (100ms window) | **No batcher.** The server is the calculator; the client is a renderer. | Once the client stops recalculating, there is nothing for a batcher to batch. Drag preview is local UI state in Zustand; drop is a single PATCH. |
| `playAfter` strings on tracks (one relationship type) | **Five-primitive anchor vocabulary** — `absolute` / `relativeTo` / `simultaneousWith` / `atFraction` / `anchorChain` — with `layout: "overlay" \| "push"` and `origin: "llm-seed" \| "user-edit" \| "system-default"` provenance | `playAfter` can't represent the cases that broke v3 (sfx halfway through a voice; sfx that should push later voices; co-starting concurrent voices). Five primitives compose to all of them without escape hatches. |
| `timelineState.version >= 2` flag on the project blob, in-place hybrid | **Mixer becomes its own version stream** at `ad:{id}:mixer:versions / :active / :v:{versionId}`, parallel to voices/music/sfx | Variants (Mandarin, dialog cast, pacing) are mixer versions, not parallel project blobs. The single-blob hybrid had no model for "same content, different arrangement." |
| Batch migration script for legacy projects | **Lazy-on-read bootstrap** with a `withAdLock` primitive — first read of a legacy ad materializes `mixer:v1` in place, deletes the legacy `ad:{id}:mixer` blob, and never re-bootstraps | Most legacy ads are sales-pitch artifacts that never get reopened. Batch migration touches them all; lazy bootstrap touches zero unless someone needs to. |

What was kept verbatim:
- The cascade diagnosis (audio loads → `setAudioDuration` → `calculateTimings` → re-render → `calculateTimings` → save callback → `calculateTimings` …) — fixed by stage 1.
- The dependency-sort fix for mid-timeline sfx — implemented as Kahn topological sort + DFS cycle detection in the pure resolver.
- The hybrid-persistence principle that legacy reads never break — implemented via the lazy-bootstrap path and the legacy-blob fallback in `useMixerData`.
- The "pure timeline calculator" idea — fully implemented as `src/services/timelineResolver.ts`.

What was rejected outright:
- **Feature flag** (`ENABLE_MIXER_V3`). The proposal hedged on dual systems coexisting indefinitely. Once the resolver shipped, the legacy calculator was retired immediately — both systems running side-by-side is its own bug source.
- **Phase 4 / Phase 5 deferred enhancements** treated as post-V3 stretch (drag-and-drop, undo/redo, multi-select, snapping, validation, grouping, templates, event sourcing). v3.5 ships drag and trim today; undo/redo is a stage-9-or-later item rather than "future enhancement."
- **`generatedTracks` mirroring** for legacy-system reads. The legacy calculator is gone; mirroring would have kept it on life support.

### Stage map

The redesign shipped on the `mixer-version-stream` branch in nine stages. Stages 2 / 3 / 4 / 5 are independent foundation; 6 depends on all of them; 7 depends on 6; 8 depends on 6 + 7. Stage 1 went first as the prerequisite reactivity cure.

| Stage | Title | Behavior shipped |
|-------|-------|------------------|
| 1 | Reactivity cure + duration backfill | Deleted `calculateTimings`, `setAudioDuration`, `audioDurations`, `saveCallback` from `mixerStore`. Rewrote the six `loadedmetadata` callsites in `MixerPanel` to be observers, not triggers. Backfilled `generatedDuration` on legacy voice versions so the resolver doesn't fall back to the word-count heuristic. Mandatory ~8ms micro-fades on every clip edge in `audio-mixer.ts`. |
| 2 | Slot IDs + `parentVersionId` plumbing | Added `slotId` to `VoiceTrack`, `SoundFxPrompt.variants[]`, `MusicVersion`. `create_voice_draft` / `create_music_draft` / `create_sfx_draft` accept optional `parentVersionId`. `reconcileSlots()` ordinal-match copies slot IDs forward when track count is unchanged; mints fresh IDs when the LLM inserts/removes slots; emits a slot-reconciliation report so the mixer draft can flag orphaned anchors. |
| 3 | Pure `TimelineResolver` | New `src/services/timelineResolver.ts` is a pure function `(tracks, anchors, pins, overrides, format) → { calculatedTracks, totalDuration, diagnostics }`. Kahn topological sort + DFS cycle detection over the anchor graph. Push-extension registry: when a `layout: "push"` clip resolves, downstream clips referencing the same source slot shift forward. Per-locale `autoSpeedupCap` (en/es/de 1.15, pl 1.12, ar/zh 1.08, ja/ko 1.10) drives the duration-squeeze release valve. Disclaimer-flagged voices are non-stretchable + force music to ≤ −30 dB during the disclaimer window. Fixture tests cover intro sfx, mid-timeline sfx with push, concurrent voices, cycle rejection, locale speedup caps, orphan handling. |
| 4 | Unified anchor seeds at the LLM tool surface | `create_voice_draft` / `create_music_draft` / `create_sfx_draft` accept a normalized `anchor` field (the same five primitives, ordinal-addressed). Legacy `playAfter` / `overlap` / `isConcurrent` / `SoundFxPlacementIntent` inputs are auto-translated by stream-side seed translators; readers never see the legacy shape. |
| 5 | `withAdLock` atomic primitive | New `src/lib/redis/adLock.ts` — Redis `SET NX EX` for acquisition, Lua CAS-delete for release. Used by every freeze endpoint to atomically swap `(stream active pointer + mixer draft pin)`, by stage-6 lazy bootstrap to prevent two-tab races, and by `/mixer/new-take` for freeze-fork-activate. |
| 6 | Mixer version stream + lazy bootstrap | New Redis keys `ad:{id}:mixer:versions / :active / :v:{versionId} / :counter`. CRUD endpoints (`/mixer`, `/mixer/freeze`, `/mixer/{versionId}/activate`, `/mixer/new-take`, `/mixer/remove-stream`, `/mixer/rebuild`) all guarded by `withAdLock`. **No batch migration.** First read of a mixer-less ad runs `bootstrapLegacyMixer(adId)`: loads the ad's current voice/music/sfx active versions, derives `llm-seed` anchors via `anchorFromVoiceTrack` / `anchorFromSoundFxPrompt` / `anchorFromMusicVersion`, mints `mixer:v1` (frozen + active), deletes the legacy `ad:{id}:mixer` blob. Idempotent on second read; truly-empty ads skip bootstrap entirely. |
| 7 | Resolver swap in `rebuildMixer` | `rebuilder.ts` becomes `load → resolve → write`: load the active mixer version + pinned stream versions, run the pure resolver, project to the response shape `MixerTrack[]`, write the resolver cache. Frozen mixer versions cache resolver output on the version blob; drafts resolve fresh on every read. `LegacyTimelineCalculator` retired. Cache-collapse bug fixed (slot-ID → `MixerTrack` map, not stream-type prefix match — see Bugfixes). |
| 8a | Drag + drop with anchor materialization | `TimelineTrack` is draggable. `src/services/anchorFromDrop.ts` materializes the drop into one of the five primitives by proximity (near edge → `relativeTo`; within span → `simultaneousWith` or `atFraction`; past last clip → `absolute`; opt/alt → force `absolute`). Cycle detection via `existingRefs` walked at drop time. PATCH `/mixer` accepts `anchorUpdates: Record<SlotId, AnchorEntry \| null>` (null = re-derive seed). Origin stamped `user-edit`. |
| 8b | Trim — voice head/tail, music tail, sfx tail | Pointer-down threshold 4 px to enter drag, 8 px edge zone to enter trim mode. Drag ribbon edges to write `ClipOverrides.trim = { start, end }`. Resolver clips playback window; `audio-mixer.ts` honors trim via `source.start(when, sourceOffset, playDuration)`; renderer applies mandatory micro-fades on trimmed edges. Live waveform crop matches committed window. |
| 8c | Soft-elastic format horizon | Format duration drawn as a dashed guide; past it red shading; canvas extends to `max(totalDuration, formatDuration ?? 0, 1)` so a 12 s ad never shrinks the canvas under a 15 s format. Drag into the warning zone is allowed but visually flagged. |
| 8d | Polish — kebab menu, takes selector, scrubbing, LUFS meter | Volume slider moved into per-track 3-dots kebab menu (right-click + external trigger). Click the dB readout to reset to 0. Takes dropdown in the timeline header with "Start a new take" action. Click-to-seek + drag scrubbing on the timeline (bails on interactive elements). New `LoudnessMeter` component reads the preview audio element via Web Audio with K-weighting biquad approximation, rAF-driven update at 60 fps. Reset-to-seed in the kebab menu reverts a single anchor's `user-edit` back to its `llm-seed` provenance. |

Stage 9 (variant UX + A/B preview slot, labeled forking, mute/solo) is held — see "Held for stage 9" below. The data model supports it today; only the UI is unbuilt.

### Data model

The mixer's own version stream lives at:

```
ad:{adId}:mixer:versions     →  CSV of version IDs in creation order
ad:{adId}:mixer:active       →  the version ID currently driving preview / export
ad:{adId}:mixer:counter      →  monotonic int for new version IDs
ad:{adId}:mixer:v:{vid}      →  MixerVersion JSON blob
```

`MixerVersion`:

```ts
interface MixerVersion {
  anchors: Record<SlotId, AnchorEntry>;
  pins: MixerPins;                          // { voices, music, sfx } — VersionId per stream
  overrides?: Record<SlotId, ClipOverrides>;

  createdAt: number;
  createdBy: CreatedBy;                     // "llm" | "user" | "system"
  status: VersionStatus;                    // "draft" | "frozen"

  parentVersionId?: VersionId;              // for forks (variants)
  requestText?: string;
  label?: string;                           // user-supplied for variants

  cachedResolverOutput?: CachedResolverOutput;  // frozen versions only
  mixedAudioUrl?: string;                       // last rendered preview blob URL
}
```

`AnchorEntry`:

```ts
interface AnchorEntry {
  anchor: Anchor;                       // discriminated union of 5 primitives
  layout?: AnchorLayout;                // "overlay" (default) | "push"
  origin: AnchorOrigin;                 // "llm-seed" | "user-edit" | "system-default"
}

type Anchor =
  | { kind: "absolute"; t: number }
  | { kind: "relativeTo"; slotId: SlotId; edge: "start" | "end"; offset?: number }
  | { kind: "simultaneousWith"; slotId: SlotId;
      alignment: "startAtStart" | "endAtEnd" | "centerAtCenter"; offset?: number }
  | { kind: "atFraction"; slotId: SlotId; fraction: number };
```

`ClipOverrides` (per-slot, lives on the mixer version, NOT on the stream version):

```ts
interface ClipOverrides {
  trim?: { start: number; end: number };  // playback window, seconds from blob start/end
  gainDb?: number;                        // static per-clip gain
  fadeIn?: number;                        // over-and-above the mandatory micro-fade
  fadeOut?: number;
  volume?: number;                        // dB trim around unity (-12..+6)
}
```

The `volume` field name was kept for persisted-data readability across the v3 → v3.5 cutover, but its semantic changed when stem normalization was introduced — it's a dB trim around unity now, not a 0..1 linear multiplier. Legacy 0..1 values render as small positive trims (e.g. 0.7 reads as +0.7 dB) until the user touches the slider — bounded-wrong rather than catastrophically wrong.

Stream-version additions (additive, optional, every legacy version still decodes):

| Type | Field | Purpose |
|------|-------|---------|
| `VoiceTrack` | `slotId?: SlotId` | Server-minted on first persistence; carried by ordinal-match copy on regeneration. |
| `VoiceTrack` | `autoSpeedupCap?: number` | Per-locale ceiling for the resolver's duration-squeeze release valve. |
| `VoiceVersion` | `integratedLufs?: Array<number \| null>` | Per-track measured LUFS; surfaced to the mixer for dB-domain volume math. |
| `SoundFxPrompt.variants[]` | `slotId?: SlotId` | Same as voice. |
| `SfxVersion` | `integratedLufs?: Array<number \| null>` | Per-variant. |
| `MusicVersion` | `slotId?: SlotId` | Always one slot per music version; still server-minted. |
| `MusicVersion` | `integratedLufs?: number` | Single value. |

`StreamType` was split:

```ts
export type ContentStreamType = "voices" | "music" | "sfx";
export type StreamType = ContentStreamType | "mixer";
```

`ContentStreamType` is the stream-version generic constraint (mixer is not a "content" stream — it carries arrangement, not generated media); `StreamType` is the broader union used by Redis-key helpers.

`MixerVersionSummary` (lightweight list shape for the takes dropdown):

```ts
interface MixerVersionSummary {
  id: VersionId;
  status: VersionStatus;
  createdAt: number;
  createdBy: CreatedBy;
  label?: string;
  parentVersionId?: VersionId;
}
```

`MixerState` (response shape from `GET /api/ads/{id}/mixer`) extended with:

```ts
{
  // existing: tracks, totalDuration, activeVersionId per content stream
  formatDuration?: number;             // brief.adDuration mirror, drives soft horizon
  mixerActiveVersionId: VersionId;
  mixerActiveVersionStatus: VersionStatus;
  mixerVersions: MixerVersionSummary[];
  mixedAudioUrl?: string;              // current take's preview blob
}
```

`MixerTrack` (per-track response projection) gained `slotId`, `anchorOrigin`, `anchorRefSlotId` (for hover-relationship dimming in the UI), `trim`, and `integratedLufs`.

### Anchor graph mechanics

The five primitives compose to express every timing relationship the LLM, the resolver, or the user has needed:

- **`absolute(t)`** — escape hatch. Used by intro sfx (translated to `absolute(0)` from a `playAfter: "start"` legacy seed) and by user-dragged drops past the last clip.
- **`relativeTo(slot, edge, offset)`** — most common. "Voice 2 starts 100 ms after voice 1 ends" → `relativeTo(voice-1-slot, "end", 0.1)`. Negative offset = overlap.
- **`simultaneousWith(slot, alignment, offset)`** — for co-starting voices, button-effect sfx that align to a clip's end/center, ducks that align music to voice envelopes. `alignment` is `startAtStart | endAtEnd | centerAtCenter`.
- **`atFraction(slot, f)`** — survives ±20% duration changes on the source slot. The LLM uses it for "sfx around 80% of voice 2"; cue-word-on-word would compile to this.
- **`anchorChain`** modifier (groupings, deferred to stage 9 for UI surface) — moves a positioned cluster as a unit. The chain head is positioned by one of the four primitives; members are anchored to the head.

Two layout modes:

- **`overlay`** (default) — the clip overlaps whatever shares its time window. Used for sfx stingers, bed ambience, ducked music.
- **`push`** — subsequent clips anchored to the same reference (or downstream of this clip in the dep graph) shift forward by this clip's duration. This is what sfx "after voice N" actually wants — the legacy fixed-phase calculator broke it; dependency sort fixes it.

Three provenance origins:

- **`llm-seed`** — set by the LLM at draft creation. Replaced wholesale on stream regeneration unless the user has touched it.
- **`user-edit`** — set when the user drags the clip. Wins over LLM seeds on regeneration except when an `absolute(t)` user-edit lands outside the new stream's containing context (resolver flags rather than silently strands).
- **`system-default`** — set by the resolver when an anchor is missing or orphaned (e.g. a slot was removed but other clips still anchored to it). `relativeTo(prev, "end", 0)` with `push` is the default fallback.

The resolver evaluates the anchor graph in three passes:

1. **Topological sort** (Kahn's) over the slot-ID dependency edges. Cycle detection via DFS — cycles are rejected at write time, but the resolver also re-checks because graph mutations can race.
2. **Position computation** — each slot resolves to `actualStartTime + actualDuration` based on its anchor, the resolved positions of its referents, and any trim override. Concurrent voices share start time; `simultaneousWith.endAtEnd` aligns end times by walking duration backward.
3. **Push-extension registry** — when a `push`-layout clip resolves, downstream clips (referring to the same source slot, or transitively downstream) shift forward.

The resolver also runs the **release-valve cascade** when total duration exceeds format duration:

1. Shrink inter-voice gaps to ~100 ms floor (free).
2. Trim music tail via `trim.end` override (free — listener doesn't perceive 2 s shaved off an outro fade).
3. Apply `postProcessingSpeedup` to `stretchable` voices, capped per locale (`autoSpeedupCap`). Always costs naturalness.
4. Flag `OverBudgetWarning` for creative review. Never silently truncates voice.

Under budget: pad gaps to ~500 ms, then extend music fade-in. Never trailing silence.

### Version stream lifecycle

**One mixer draft per ad at a time.** Drafts are long-lived workspaces; not auto-frozen on stream regenerations.

**Preview-and-playback contract:** anywhere the ad plays (mixer preview, export, main preview surface), the audio source is `mixer draft if exists, else mixer active version`. This preserves the "regenerate voice, hear new mix immediately" ergonomic — without it, silent mixer drafts would break the iteration flow.

**Creating a draft.** First-ever ad generation creates `mixer:v1` (frozen + active); no draft exists. A draft materializes lazily on the first user action that mutates arrangement: first drag, first scripter/music/sfx send. The draft forks from the active mixer version; anchor graph + overrides + pins copied verbatim.

**Stream updates while a draft is open.** New stream versions get frozen in their own stream as usual; the draft's corresponding pin swaps to the new version ID atomically (`withAdLock`). The anchor graph is not rewritten — slot-ID reconciliation handles slot-count drift, and `user-edit` anchors carry forward. Trim overrides are validated against the new pin's duration on swap; if `trim.end > newDuration` they clamp and a flag goes on the draft metadata.

**Freezing a draft — "Start a new take."** The header dropdown's `Start a new take` action is freeze-if-draft + fork-into-new-draft + activate, all under one lock. From the user's POV: the current version becomes a saved take, a fresh editable copy takes its place. Mental model is cleaner than the prior "save take" framing because the user is starting work on a new arrangement, not committing the old one.

**Forking for a variant.** Selecting any frozen take in the dropdown activates it; iterating from it forks a new draft. Stage 9 will add explicit "Fork as labeled variant" with a label field.

**Activating a frozen take.** Sets `mixer:active` to the chosen version ID. Pins on that version are the source of truth for what plays. Stream-level `voices:active` / `music:active` / `sfx:active` become editor ergonomics — they indicate which version the scripter / music / sfx panels are currently iterating, not what the ad sounds like.

**Orphan handling.** A draft referencing a deleted stream version keeps the orphan flag; the resolver positions affected slots at last-known absolute time + UI flag.

### UI architecture

The mixer surface is a single `MixerPanel` with these sub-components:

- **`TimelineTrack`** — one per slot. Draggable ribbon. Three edit affordances:
  - **Drag the body** to reposition (4 px threshold to enter drag).
  - **Drag an edge** (8 px zone) to trim. Voice head/tail, music tail, sfx tail. The drag preview crops the waveform live so the user sees what the trimmed clip will sound like.
  - **Right-click or 3-dots external trigger** to open the kebab menu — volume slider (dB trim, range −12..+6, 0.5 step), click the dB readout to reset to 0, "Reset to seed" reverts the slot's anchor back to `llm-seed`.
- **Timeline header** — playhead time, takes dropdown (`Start a new take` + frozen-version list), play button, `LoudnessMeter`.
- **Format horizon overlay** — dashed guide at `brief.adDuration`; red shading past it; canvas extends to `max(totalDuration, formatDuration, 1)`.
- **Hover relationships** — when hovering a clip with an `anchorRefSlotId`, the referenced clip glows; other clips dim with a `bg-black/50` overlay then a half-glow gradient. Yellow halo on orphaned/fragile anchors is held for stage 9.
- **Waveform per clip** — SVG path inside each ribbon. Voice waveforms tint warm (`rgba(255,220,180,0.18)`); music/sfx use neutral white (`rgba(255,255,255,0.22)`). Title fades on hover so the waveform shows.
- **Click-to-seek + drag scrubbing** — clicking the timeline canvas seeks the playhead; dragging scrubs. Bails on interactive elements via `closest("button, input, select, textarea, a, [role='button'], [role='menuitem'], [data-no-timeline-scrub]")` so the kebab menu, volume slider, and takes dropdown stay clickable. (This bail rule is load-bearing — without it the timeline `pointerdown` capture stole click events from the external 3-dots trigger that sits past the ribbon's right edge.)

Drag-and-drop materialization rules (`src/services/anchorFromDrop.ts`):

| Drop location | Materialized anchor |
|---------------|---------------------|
| Within ~100 ms of a clip edge | `relativeTo(slotId, edge, offset)` |
| Within a clip's time span, near start/center/end | `simultaneousWith(slotId, alignment, offset)` |
| Within a clip's time span, mid-region | `atFraction(slotId, f)` |
| Past the last clip's end | `absolute(t)` |
| With opt/alt held | `absolute(t)` (force) |

Cycle detection at drop time walks `existingRefs` (slot → ancestor slots) — if the proposed reference would close a loop, the drop is rejected with a UI shake.

### Loudness pipeline

Three integration points:

**1. Stem normalization to per-type LUFS targets** (`src/utils/audio-mixer.ts`):

```ts
const STEM_TARGET_LUFS = {
  voice:   -16,
  music:   -23,
  soundfx: -20,
} as const;
```

Every stem is normalized to its type's target before being placed on the timeline:

```
gainDb = (targetLufs − integratedLufs) + userTrimDb
```

Where `integratedLufs` is the per-stem measurement (BS.1770-4 via `calculateLUFS` in `audio-processing.ts`), surfaced from the stream version when available, or measured lazily on first render via `measureLufsLazy(buffer, url)` with a module-level cache. `userTrimDb` is the user's volume-slider dB trim around unity.

This replaces the v3 hardcoded `getDefaultGainForType` (1.0 / 0.25 / 0.7 linear multipliers) — the previous gimmick where music defaulted to 25% of voice was a hack to compensate for raw stem loudness. With per-type normalization, "0 dB trim" means broadcast-balanced, not "raw stem at full level." A user dragging the slider to +3 dB on music gets +3 dB above broadcast balance, not "+3 dB above 25% of arbitrary."

Per-stem gain is clamped to `[−36 dB, +12 dB]` so a corrupt LUFS measurement can't blow speakers. Explicit zero `gainDb` under −36 is treated as silence (mute affordance).

**2. Live LUFS meter** (`src/components/LoudnessMeter.tsx`):

Web Audio graph attached to the preview audio element:

```
MediaElementSource
  → high-pass biquad (38 Hz, K-weighting stage 1)
  → high-shelf biquad (1500 Hz, +4 dB, K-weighting stage 2)
  → AnalyserNode
  → destination
```

The K-weighting filter chain is a biquad approximation of BS.1770's pre-filter (the spec mandates IIR high-pass + IIR shelf; AudioParam-tunable biquads land within ~0.5 LU at typical content levels). The rAF loop reads time-domain samples from the analyser, computes mean-square of the K-weighted signal, converts to LUFS:

```
lufs = −0.691 + 10 · log10(meanSquare + 1e−10)
```

Visual: floor −30 LUFS, target −14 LUFS (Spotify streaming standard), soft ceiling −9 LUFS. Three color stops — green (under target), amber (near target), red (over). Peak hold for 1500 ms. Headroom readout: "3.5 dB under" / "on target" / "1.2 dB over". Fixed `w-[88px] text-right` readout column to prevent layout jitter as the number flips between widths. Inline RGB colors (`#34d399` / `#fbbf24` / `#f87171`) rather than dynamically-selected Tailwind classes to survive Tailwind v4's purge. No CSS transition on the fill width — rAF at 60 fps is smooth enough, and a transition was making the bar lag the readout.

**3. Final BS.1770 normalization on render** (`audio-mixer.ts:344`):

```ts
const normalizedBuffer = normalizeToSpotifySpec(renderedBuffer);
```

`normalizeToSpotifySpec` in `audio-processing.ts` measures integrated LUFS on the rendered mix, applies a single global gain to hit the target, then clips the true peak ceiling. Current targets: −16 LUFS / −2 dBTP. The plan called for −14 LUFS / −1 dBTP (Spotify's actual delivery spec); the −16 / −2 target is preserved for headroom on AAC encode and revisited when delivery loudness becomes a measured complaint.

**4. Mandatory micro-fades.** 5–10 ms fades on every clip edge — voice, music, sfx, all stems, all trim boundaries. Prevents DC-offset clicks and mid-phrase truncation pops. Required by BS.1770 conformance because click transients pump the integrated measurement.

### Resolved decisions worth carrying forward (mixer)

- **The server is the calculator; the client is a renderer.** Once this rule was real, the client-side cascade went away on its own. No `CommandBatcher`, no command history, no orchestration layer needed in the client.
- **Mixer is its own version stream, parallel to voices/music/sfx.** Variants are mixer versions, not parallel project blobs. The single-blob hybrid had no model for "same content, different arrangement" and would have grown awkward keyed-map shapes for multilingual + dialog cast + pacing variants.
- **Frozen mixer versions pin specific stream version IDs.** Reproducibility guarantee — opening the same frozen take a year from now produces the same mix. Drafts swap pins atomically when streams regenerate.
- **One mixer draft per ad.** Drafts are workspaces; takes are saved arrangements. "Start a new take" is freeze-fork-activate, not "save current state." User mental model is cleaner.
- **Lazy-on-read bootstrap, not batch migration.** Most ads are sales-pitch artifacts opened once. Touching every ad to add a versioning pointer for ads that nobody will reopen is wasted work and a foot-gun.
- **Atomic primitive (`withAdLock`) is shared infrastructure.** Every freeze endpoint, every pin-swap, every bootstrap goes through the same Redis lock. Two-tab races were a real bug (concurrent `Start a new take` + `Generate music` could produce a draft pinned to a half-frozen state); the lock is non-negotiable.
- **Anchors with provenance, not strings.** `playAfter: "voice-2"` had one bit of information; `AnchorEntry` carries five. The cost is type-system overhead; the benefit is correctly-behaving regeneration without bespoke "did the user touch this" tracking elsewhere.
- **Per-stem LUFS normalization, not linear multipliers.** Stem types live in different acoustic territories; normalizing to per-type targets means user volume controls operate on a calibrated baseline. The previous music-defaults-to-0.25-of-voice gimmick is gone.

### Key files (mixer)

| Area | File |
|------|------|
| **Mixer version types** | `src/types/versions.ts` — `MixerVersion`, `Anchor`, `AnchorEntry`, `AnchorOrigin`, `AnchorLayout`, `DurationPolicy`, `ClipOverrides`, `MixerPins`, `CachedResolverOutput`, `SlotId`, `ContentStreamType`/`StreamType` split |
| **Pure resolver** | `src/services/timelineResolver.ts` (NEW) — Kahn topo sort, DFS cycle detection, push-extension, per-locale speedup caps, release-valve cascade |
| **Anchor materialization** | `src/services/anchorFromDrop.ts` (NEW) — proximity rules, cycle detection via `existingRefs` |
| **Mixer rebuilder** | `src/lib/mixer/rebuilder.ts` — `deriveMixerState`, `ensureMixerDraftWithCurrentPins`, `applyMixerPatch`, `writeResolverCache`, `cachedOutputMatches` |
| **Lazy bootstrap** | `src/lib/mixer/bootstrap.ts` (NEW) — `bootstrapLegacyMixer`, slot-ID backfill, `anchorFromVoiceTrack` / `anchorFromSoundFxPrompt` / `anchorFromMusicVersion` translators |
| **Atomic primitive** | `src/lib/redis/adLock.ts` (NEW) — `withAdLock` (Redis SET NX EX + Lua CAS-delete release) |
| **Redis adapter** | `src/lib/redis/versions.ts` — `mixer` stream type, slot-ID helpers, mixer version CRUD |
| **Slot reconciliation** | `src/lib/tools/implementations.ts` — `reconcileSlots`, `parentVersionId` plumbing in create-voice/music/sfx draft tools |
| **Mixer state hook** | `src/hooks/useMixerData.ts` — SWR; routes by active mixer version |
| **Mixer panel** | `src/components/MixerPanel.tsx` — stripped to UI-only state, format horizon, takes dropdown, LUFS meter, scrub, kebab interaction |
| **Timeline track** | `src/components/TimelineTrack.tsx` — drag, trim, kebab menu, waveform, hover relationships |
| **LUFS meter** | `src/components/LoudnessMeter.tsx` (NEW) — K-weighted Web Audio meter, peak hold |
| **Mixer store** | `src/store/mixerStore.ts` — UI-only Zustand: selection, hover, drag preview, playback cursor |
| **Audio render** | `src/utils/audio-mixer.ts` — stem normalization (`STEM_TARGET_LUFS`), `measureLufsLazy`, trim-aware `source.start(when, sourceOffset, playDuration)`, micro-fades, final BS.1770 pass |
| **LUFS / true peak** | `src/utils/audio-processing.ts` — `calculateLUFS`, `calculateTruePeak`, `normalizeToSpotifySpec` |
| **Mixer API surface** | `src/app/api/ads/[id]/mixer/route.ts` (PATCH for `anchorUpdates` / `trimUpdates` / `volumes` / `mixedAudioUrl`), `/mixer/freeze`, `/mixer/{versionId}/activate`, `/mixer/new-take`, `/mixer/remove-stream`, `/mixer/rebuild` |

Retired:
- `src/services/legacyTimelineCalculator.ts` — fixed-phase calculator, removed in stage 7. (File still present in the working tree pending final cleanup; no live callers.)
- `mixerStore.calculateTimings` / `setAudioDuration` / `audioDurations` / `saveCallback` — removed in stage 1.
- Legacy `ad:{adId}:mixer` Redis blob — deleted lazily on bootstrap.

### Bugfixes (mixer)

| Symptom | Root cause | Fix |
|---------|------------|-----|
| Resolver cache collapsed all slots of a stream type onto the first track of that type | `slotMatchesResolvedTrack` returned true for any track of a given stream type — every cached track inherited the first track's id | Slot-id → `MixerTrack` map for write; stricter `cachedOutputMatches` multiset check auto-invalidates legacy bad caches (commit `c33904c`) |
| Trim drag didn't change audible playback or render output | `source.start(when)` was called without offset/duration arguments — Web Audio played the full untrimmed buffer | Pass `(when, sourceOffset, playDuration)` derived from `ClipOverrides.trim` |
| Live waveform stretched across the original duration after trim | Waveform drew the full buffer regardless of trim window | Crop to committed trim window in `TimelineTrack` waveform path (commit `d8992ab`) |
| Playhead drifted past the last track on long ads | Playback position used `audio.duration` as denominator instead of the canvas-extended `displayDuration` | Use `displayDuration = max(totalDuration, formatDuration ?? 0, 1)` |
| Volume drawer kebab menu unresponsive after timeline scrub work | Timeline `pointerdown` capture stole the click event from the external 3-dots trigger | Bail on interactive elements via `closest("button, input, …, [data-no-timeline-scrub]")` |
| Stage-6 bootstrap force-froze active stream drafts, stealing draft editability from freshly-generated ads | Bootstrap treated all unfrozen drafts as in-flight | Removed force-freeze; rely on `freezeExistingDraft` lazy-on-iteration pattern |
| LUFS bar visually empty at −19.5 LUFS | `transition-[width] duration-75` made the fill chase rapidly-changing momentary values while the readout updated instantly | Removed CSS transition; rAF at 60 fps is smooth enough |
| LUFS bar wouldn't visually update / numbers jittered | Dynamically-selected Tailwind classes (`bg-emerald-400` etc.) potentially purged in v4; readout text widths shifted layout | Inline RGB colors; fixed-width `w-[88px] text-right` readout column; minimum fill `max(6px, ${fillPct}%)` |

### Held for stage 9 (next step)

- **A/B preview slot.** Two mixer versions loadable into the panel simultaneously; instant toggle (spacebar or A/B keys). Sales-pitch load-bearing — flipping between Mandarin and English variants without reload latency.
- **Labeled forking.** Explicit "Fork as variant" with a label field; the takes dropdown groups variants by label.
- **Mute / solo per track.** Trivial UI; deferred until A/B lands so it can hook into the same playback graph.
- **Server-side LUFS measurement at stem generation.** Today every preview render runs `measureLufsLazy` on first decode and caches in-process. Pushing the measurement to the voice/music/sfx generator (write `integratedLufs` back to the stream version on freeze) eliminates the cold-render delay.
- **Live LUFS persistence.** When the meter measures a stem the user hasn't played before, PATCH it back to the stream version so future preview cold-loads start with the value already in hand.
- **Head trim** for non-voice clips (left-edge drag). Sfx and music currently trim only from the right.
- **Yellow halo on fragile / orphaned anchors.** Data model supports it; UI affordance unbuilt.
- **`get_mixer_state` LLM read-only tool.** Output shape needs deliberate design (ordinals only vs hybrid with slot IDs and provenance) before adding.
- **Multi-clip selection + group move.** Anchor chain supports it; UI doesn't.
- **Undo / redo.** Mixer version stream provides coarse history (each frozen take is a checkpoint); fine-grained undo within a draft is a follow-up.
- **Loudness target update to −14 LUFS / −1 dBTP** to match Spotify's actual delivery spec, contingent on AAC-encode-headroom validation.

---

## Bugfixes worth recording

| Symptom | Root cause | Fix |
|---------|------------|-----|
| `Sara – Premium Humanlike Arabic Voice` cast for French dialog | Voice description not in `search_voices` results — agent had no signal to discriminate | `getVoicesForProvider` now calls `enrichWithDescriptions` (Neon `voice_descriptions` join). `description` field added to `SearchVoicesResult` shape. Agent prompt explicitly tells it to read name + description before casting. |
| `Belma` defaulting in every language search | Multilingual voices registered for every language in `verified_languages`, gravitating to top of every shuffled pool | `stableSortByMultilingual` after the seeded shuffle pushes `capabilities.isMultilingual` voices below natives. |
| Music too short for over-budget script (20s ad → 23s voices, 20s music) | `createMusicDraft` honored LLM-supplied `duration` verbatim | Hard floor enforced: `effectiveDuration = max(duration, briefDuration + 10s, 30s)`. LLM duration becomes a ceiling. |
| Brief PATCH 404 spam during fresh-ad flow | Endpoint required ad row to exist; client autosaved on each keystroke | PATCH made idempotent via `ensureAdExists` — lazy-creates the ad row on first save. Pre-Generate brief content now persists from keystroke 1. |
| `!Blocked` Salesforce accounts polluting picker | Sales team uses `!Blocked …` name prefix for sanctions / do-not-contact | SOQL `NOT LIKE '!Blocked%'` + post-filter regex `/^\s*!\s*blocked\b/i`. |
| Spotify-only picker false negatives on global brands (Red Bull, Heineken) | Brand exists in SF but not yet tagged `clientPlatforms ∋ "spotify"` in alaric | Auto-fallback: when Spotify-filtered returns zero, retry unfiltered inline. Inline notice "No Spotify match — showing all Salesforce accounts". |
| Voices over-searched + agent never committed drafts | Tool description `definitions.ts:153-154` still said "include [emotional tags] inline" while pass-1 prompt said don't | Architecture-strategist diagnosis. Tool description rewritten to "clean prose, no inline bracket tags". |
| Failing French dialog with `[mood][mood]` opening-stack-only | Tag placement was the lowest-priority concern the agent dropped when overloaded | Two-pass split (Stages K / L / M / N). |

---

## Resolved decisions worth carrying forward

- **No black-box enrichment.** User explicit framing: *"i don't like the blackbox stuff."* Anything the agent will see at generation time should be visible to the user before clicking Generate, OR derive from explicit user input. Codified in `feedback_no_black_box_enrichment` memory.
- **No emojis in rendered UI.** Use heroicons or text-only. Code comments / planning docs / agent prompts are fine — emoji ban is a UI-rendering rule. Codified in `feedback_no_emojis_in_ui` memory.
- **Cost-unbounded alaric reads.** No token-budget cost-bounding when projecting alaric reports. Bring everything; GPT-5.5 prompt caching handles the repeat-seeing-of-large-blocks efficiently. Per user direction in v4: *"why is alaric cost bound? bring everything from a rich alaric profile."*
- **Music duration floor at brief+10s.** LLM is treated as a ceiling, not the source of truth — over-budget scripts are common and music should always cover.
- **Multilingual voices always exist; rank natives first.** Don't filter multilinguals out (they're useful when no native exists), just deprioritize.

---

## Key files (delta from v3-1)

| Area | New / Changed |
|------|---------------|
| **Brand identity** | `src/types/index.ts` — `BrandRef`, `ProjectBrief` extensions, `selectedTone` + `voiceInstructions` post-merge, `ToneOfVoiceTag` REMOVED, `brandVoice` + `enrichWithWebSearch` `@deprecated` |
| **Brief panel V4** | `src/components/BriefPanelV4.tsx` — orchestrator (replaces deleted `BriefPanelV3.tsx`); 3-topic shells in `src/components/brief-topics/{BrandTopic,CreativeTopic,LanguageTopic}.tsx`; subeditors in `src/components/brief-topics/subeditors/*.tsx` |
| **Brief panel base** | `src/components/BriefPanelBase.tsx` — Alexandru's monolithic form, retained for `DuplicateAdPopup` |
| **alaric client** | `src/lib/alaric-client.ts` — HMAC signer, type mirrors (BrandDossier, SfClientBundle, AlaricFetchResult, MarketRow, MarketLanguage); `searchSfAccounts` market filter; `getMarkets` |
| **Brief enrichment** | `src/lib/brief-enrichment.ts` — prefetchBriefEnrichments, renderEnrichmentSections, renderBrandDossier, URL type detection |
| **Brand context** | `src/app/api/brand-context/route.ts` (NEW) — discriminated `kind`: `sf-account` / `search` / `greenfield` / `spotify-ad-manager`. Replaces deleted `/api/sf-accounts/search` + `/api/brands/recent`. |
| **Markets proxy** | `src/app/api/markets/route.ts` (NEW) — `getMarkets` proxy with `?showAll=true` escape hatch |
| **Tone-of-voice (Sergiu)** | `src/services/suggestedTonesService.ts`, `src/app/api/tone-of-voice/route.ts`, `src/app/api/admin/tone-of-voice/**`, `src/app/admin/tone-of-voice/**`, `src/components/admin/{ToneOfVoiceForm,ToneOfVoiceList}.tsx`, `src/components/ui/{ToneSelector,Switch,ConfirmDialog}.tsx`, `src/hooks/useToneOfVoice.ts`, `drizzle/migrations/0002_add_suggested_tones.sql` |
| **Ad duplication** | `src/app/api/ads/[id]/duplicate/route.ts` (Alexandru, rewritten for v3.5 mixer streams), `src/components/DuplicateAdPopup.tsx` |
| **Brief PATCH** | `src/app/api/ads/[id]/brief/route.ts` — idempotent lazy-create via ensureAdExists |
| **Generate routes** | `src/app/api/ai/generate/route.ts` + `generate-stream/route.ts` — prefetch + dossier injection, web_search path removed, `brandVoice` + `toneOfVoice` plumbing dropped, `voiceInstructions` threading kept |
| **Tag weaver** | `src/lib/tools/validation/tag-weaver.ts` (NEW) — per-track ElevenLabs tag insertion |
| **Tag lint** | `src/lib/tools/validation/voice-tag-lint.ts` (NEW) — three mechanical rules + telemetry |
| **Accent policy** | `src/lib/tools/validation/accent-policy.ts` (NEW) — resolveAccentForLint + canonical [strong X accent] form |
| **Voice catalogue** | `src/services/voiceCatalogueService.ts` — enrichWithDescriptions called in getVoicesForProvider |
| **search_voices** | `src/lib/tools/implementations.ts` — multilingual deprioritization, auto-broaden on narrow filter, description in result shape |
| **Music duration** | `src/lib/tools/implementations.ts` — brief+10s floor in createMusicDraftLocked |
| **ElevenLabs prompt** | `src/lib/knowledge/modules/elevenlabs-voice.ts` — pass-1 simplified, pass-2 hidden from agent |
| **Knowledge builder** | `src/lib/knowledge/builder.ts` — webSearchDirective stripped, search_voices guidance tightened |
| **OpenAI adapter** | `src/lib/tool-calling/adapters/OpenAIAdapter.ts` — hosted web_search path removed |
| **Agent executor** | `src/lib/tool-calling/AgentExecutor.ts` — webSearchBudget removed, max-iterations diagnostic added |
| **Tool definitions** | `src/lib/tools/definitions.ts` — text param: "clean prose, no inline bracket tags" |
| **Versions** | `src/lib/redis/versions.ts` — writeTagLintTelemetry; enrichment-cache helpers REMOVED; legacy `getMixerState`/`updateMixerState` REMOVED; `getActiveVersionData` uses `VersionFor<T>` for mixer stream support |
| **Auth** | `src/auth.config.ts` (NEW) — Edge-safe split; `src/auth.ts` extends with Drizzle + Resend; `src/middleware.ts` uses Edge-safe config, returns 401 JSON for `/api/*` |

**alaric-side (sister project) — modified:**

| Area | Changes |
|------|---------|
| `src/lib/aca-auth.ts` | HMAC verification middleware, x-aleph-* canonical headers, consumer_id binding |
| `src/lib/salesforce/account-lookup.ts` | `searchSfAccountsByName` (Spotify-platform filter, !Blocked exclusion), `getCompanyFromSalesforce` (BrandDossier projection from all current intelligence_reports rows + companies.signals + canonical industry taxonomy join) |
| `src/app/api/aca/fetch-content/route.ts` | Tiered fetch passthrough |
| `src/app/api/aca/sf-search/route.ts` | clientPlatforms query param |
| `src/app/api/aca/sf-client/route.ts` | Bundled response (passes BrandDossier through) |
| `src/app/api/aca/enrich-company-async/route.ts` | Fire-and-forget enrichment trigger with staleness guard |

---

## Held for v4 Stage W (next step)

**Synchronous "Run deep enrichment (~3 min)" UX.** When brand-pick lands on State B (SF account exists, alaric `companies` row exists, but `intelligence_reports.is_current` is empty), surface a primary action that runs `enrichCompany` and renders SSE progress until reports land.

- New alaric endpoint `/api/aca/enrich-progress` proxies alaric's existing `/api/activity/stream` SSE filtered to the per-job progress events.
- ACA proxy `/api/ads/[id]/enrich-progress` forwards via `signedFetch` SSE pipe.
- BrandDossierCard component with three states: rich (full dossier rendered inline), progress (per-platform progress strip), empty (with CTA).
- Cancel = client-side dismissal; alaric job continues regardless. Idempotency via `getActiveEnrichmentJob` guard.

**Held also:**
- "Look up brand context" web-search button on standalone-brand empty state (re-introduces web search but only when alaric can't help, explicit user click).
- TikTok / YouTube ad creative thumbnail modal (textual VLM analysis already lands in dossier; per-thumbnail click-through is rep-demand-gated).
- Stage F: transcript-level retrieval (corpus, not schema). Held until we measure whether the schema layer (current dossier) carries the load.
- Stage T: report-type-aware brand voice projection. Held pending prod-record inspection per report type.

---

## Environment

```bash
# alaric integration (added in v3.5)
ACA_ALARIC_SHARED_SECRET=<secret>     # same value on both apps
ALARIC_BASE_URL=https://alaric.…      # ACA points here for /api/aca/* calls

# Tag-weaver model override (optional; defaults to gpt-5.5)
TAG_WEAVER_MODEL=gpt-5.5
```

The V3 Redis env (`V3_KV_REST_API_URL`, `V3_KV_REST_API_TOKEN`) and OpenAI key (`OPENAI_API_KEY`) carry over unchanged.
