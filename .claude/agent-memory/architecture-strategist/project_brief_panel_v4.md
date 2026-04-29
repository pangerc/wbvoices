---
name: Brief Panel v4 — single-PR ship, 3-topic restructure, alaric-grounded
description: V4 unified plan — Brand/Creative/Language topics on BriefPanelBase; combined /api/brand-context endpoint; markets sourced from alaric 86-aleph-markets mapping (no new ProjectBrief.country field); brandVoice retired; creativeAngle stays exposed; alaric enrichment implicit-on-save.
type: project
---

V4 brief panel design layered on Alexandru's `BriefPanelBase` (controlled core), preserving v3.5 enrichments (alaric, SF picker, Recents, references). Three-topic restructure with one basic field exposed and advanced subeditors collapsed. Single combined alaric endpoint replaces piecemeal SF+recents+prefetch fragmentation. Anticipates Spotify Ad Manager ingestion via the same endpoint. Markets sourced from alaric's recently-introduced 86-aleph-markets mapping — no new `country` field on `ProjectBrief`.

**Why:** Three forces — (1) audio-expert pushback that hiding `creativeAngle` causes Heineken-Bulgaria-reads-the-same regression, (2) v3 Stage R lesson that manual enrich buttons become "empty success theater", (3) alaric now owns the canonical 86-market mapping, so ACA shouldn't reinvent country fields. Ship in one PR — staged rollout would leak v3.5 leftovers into prod and force two rounds of brief-shape migration.

**How to apply:**
- Component tree: `BriefPanelV4` (orchestrator, owns `useReducer` + Redis save) wraps three topic shells (`BrandTopic`, `CreativeTopic`, `LanguageTopic`). `BriefPanelBase` is repositioned as a **shared field-rendering library** (controlled atoms: `BaseDuration`, `BaseFormat`, `BasePacing`, `BaseCTA`, `BaseLanguage`, `BaseProvider`, `BaseTone`) — not a wrapping container. Topics import the atoms they own. No tone block left inside Base — it migrates to `ToneOfVoiceSubeditor` (Creative topic, collapsed).
- Single endpoint: `POST /api/brand-context { kind, ... }` discriminated union — `sf-account | search | greenfield | spotify-ad-manager`. All four return the same `BrandContextResponse` shape (brand + dossier projection + market grounding). Folds `/api/sf-accounts/search` and `/api/brands/recent`.
- Markets: `GET /api/markets` (thin proxy to alaric's `/api/aca/markets`) returns canonical 86-market list with `{ alpha2, name, language[], region }`. Cached server-side. Drives SF search filtering, language defaults, brand discovery filtering, and SAM territory selection.
- `selectedRegion`: kept as the canonical field; relabeled "Market" in UI; values shift from voice-region taxonomy to alaric alpha-2 codes when set via the new picker. Legacy `selectedRegion` values that aren't valid alpha-2 are preserved as soft labels (no migration).
- Field placement:
  - Brand topic: brand picker (SF/Greenfield/SAM stub), market picker. Brand-identity-anchoring only — no spot-level fields here.
  - Creative topic: `creativeBrief` (the "what's the spot about" textarea, EXPOSED — the spot's primary input), `creativeAngle` (EXPOSED — per-spot variance), `selectedTone` + `voiceInstructions` (exposed atom + `VoiceInstructionsDialog` for fine-tune; tone-of-voice is a *creative* delivery choice, not a brand-identity assertion), `selectedCTA`, `referenceUrls`, `forbiddenWords`, `providedScript` (collapsed "Custom Script" subeditor).
  - Language topic: `selectedLanguage`, `selectedAccent`, `selectedProvider`, `adDuration`, `campaignFormat`, `selectedPacing`, `musicProvider`.
- Retired from UI (no field reads): `enrichWithWebSearch`, `brandVoice` (free-text). Both kept on the type for legacy decode.
- Alaric enrichment is implicit-on-save: `BriefPanelV4` posts to `/api/brand-context { kind: "sf-account", accountId }` on brand pick, renders dossier summary under brand badge ("Dossier loaded — 5 slots, last enriched 3h ago"). No "Enrich" button. The same dossier is embedded into the LLM user message via `prefetchBriefEnrichments` — single source of truth.
- Legacy tone-of-voice values (uuid-keyed presets from prod): `BaseTone` accepts `string | "custom" | null`; uuid values render as "Custom (legacy)" until the user re-picks. No DB migration.
- Tests touched: `voiceMetadataSynthesis.test.ts` unaffected; new `brand-context.route.test.ts`; new `BriefPanelV4.test.tsx` (smoke + topic-collapse + alaric implicit-fetch); kill `sf-accounts/search.test.ts` and `brands/recent.test.ts` if they exist.

**Single-PR scope (concrete file list):**
- Added: `src/components/BriefPanelV4.tsx`, `src/components/brief-topics/{BrandTopic,CreativeTopic,LanguageTopic}.tsx`, `src/components/brief-topics/subeditors/{ToneOfVoiceSubeditor,CustomScriptSubeditor,ReferenceUrlsSubeditor}.tsx`, `src/app/api/brand-context/route.ts`, `src/app/api/markets/route.ts`, `src/lib/markets.ts` (alaric proxy + cache).
- Modified: `src/components/BriefPanelBase.tsx` (extract atoms, drop wrapper), `src/types/index.ts` (mark `brandVoice` `@deprecated`, mark `enrichWithWebSearch` removal-pending), `src/lib/alaric-client.ts` (add `getMarkets()`, optionally `getBrandContext()` if we reuse signedFetch from the new route), `src/lib/brief-enrichment.ts` (no-op on `enrichWithWebSearch`), `src/app/api/ai/generate/route.ts` + `generate-stream/route.ts` (drop `enrichWithWebSearch` reads, ensure dossier embed reads from same shape `/api/brand-context` returns), `src/app/ad/[id]/page.tsx` (swap `BriefPanelV3` → `BriefPanelV4`), `src/components/DuplicateAdPopup.tsx` + `ScripterPanel.tsx` (selectedRegion is now alpha-2 — accept legacy strings unchanged).
- Deleted: `src/components/BriefPanelV3.tsx` (thin wrapper goes away), `src/app/api/sf-accounts/search/route.ts`, `src/app/api/brands/recent/route.ts`.
- Working tree salvage:
  - `versions.ts` resolution (v3.5 wins): KEEP — orthogonal.
  - `duplicate/route.ts` mixer-stream rewrite: KEEP — orthogonal.
  - `BriefPanelV3.tsx` thin wrapper from bitbucket/main: DISCARD (file is deleted by V4).
  - `tools/implementations.ts` and `ad/[id]/page.tsx` conflicts: must resolve before V4 lands. `ad/[id]/page.tsx` resolution should already swap to `BriefPanelV4` import.

**SAM future-proofing hooks (in this PR, no SAM commitment):**
- Sealed enum slot `kind: "spotify-ad-manager"` in `/api/brand-context`'s discriminated union — returns 501 today, schema reserved.
- `BrandRef.salesforceAccountSnapshot` parallel slot `BrandRef.spotifyAdManagerSnapshot?: { campaignId, market, ... } | null` reserved on the type (commented, not added) — note in `BrandRef` JSDoc.
- Markets endpoint already returns alpha-2 + language[] which is what SAM territory selection needs.

**Migration concerns:**
- Legacy briefs with `brandVoice` populated: render in a single read-only `<details>` "Legacy brand voice (no longer used)" block at top of Brand topic, scheduled for removal in next cleanup PR.
- Legacy `selectedRegion` values that aren't alpha-2: preserved as soft labels in market picker, marked "(legacy)" — re-picking promotes to alpha-2.
- Legacy `selectedTone` uuid values: render as "Custom (legacy)" — re-picking promotes to preset id or "custom".

**Open questions resolved:** country granularity → alpha-2 from alaric. BriefPanelV3 fate → deleted. BrandContextPanel empty state → topic-shell handles it. Manual enrich button → never lands.

**BLOCKER (2026-04-29):** alaric's `/api/aca/markets` endpoint does not yet exist. User is requesting alaric-side team to build it; will share the alaric spec before v4 implementation kicks off. Don't start v4 work until that spec arrives — endpoint shape may shift our `getMarkets()` signature, our cache invalidation story, and possibly `/api/brand-context`'s `marketAlpha2` parameter.

**Layout corrections (2026-04-29) — landed after the v4 PR shipped.**

The first v4 implementation pass collapsed `BriefPanelBase`'s 3-col grids into single-column stacks and over-exposed advanced fields. Corrections:

- Each topic uses `grid grid-cols-3 gap-6` internally; topics spaced via outer `space-y-12`.
- Creative exposure is exactly `creativeBrief` + `creativeAngle`. Acting instructions (tone + voiceInstructions), references, forbidden — collapsed by default; auto-expand only when populated on `initialBrief` load.
- Custom script swapped from a collapsible to a tabbar pair (`GlassTabBar` from MusicPanel) — "Brief the agent" / "I have the script" — at the top of CreativeTopic. When in script mode, the rest of the body hides; brief save still includes both fields so users can swap modes without losing edits.
- CTA migrated from CreativeTopic → LanguageTopic Row 2 col 2 (campaign-execution axis, not creative-direction). Pacing moved to LanguageTopic Row 3 col 1; duration spans col-2-3 of the same row.
- Acting instructions extracted into `ActingInstructionsSubeditor` (`src/components/brief-topics/subeditors/ActingInstructionsSubeditor.tsx`) so the tone+voiceInstructions+reset trio lives behind a single collapsible together. Internal grid mirrors BriefPanelBase Row 3.5/3.6: tone (col 1) | voiceInstructions (col-span-2 with reset chip).
- CustomScriptSubeditor's internal mode-toggle buttons removed — the topic-level tabbar supersedes them.

Default mode for the tabbar on initialBrief load: `providedScript.trim().length > 0 ? "script" : "brief"`. Simpler than the proposal in this file's earlier draft (no conjunction with creativeBrief) — if both are populated, the user is in script mode and the tab is one click to swap.

The 3-topic mental model and the alaric-grounded brand-context flow are unchanged.
