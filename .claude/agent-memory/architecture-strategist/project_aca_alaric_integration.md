---
name: ACA ↔ Alaric loose integration design
description: Strategy decisions for ACA pulling rich context from sibling alaric app (SF lookup + web fetch); plan in ~/.claude/plans/look-at-the-way-resilient-naur-agent-ae75246cd0132aeff.md
type: project
---

Cross-app integration: ACA (wb-voices) consumes alaric endpoints for Salesforce client lookup + tiered web-fetch. Both apps owned by same dev, both on Vercel.

**Why:** Alaric already has production-grade tiered fetch (T0/T1/T3), Salesforce OAuth + queries, and `enrichCompany()` orchestration. ACA's brief today is thin (free-text clientDescription + creativeBrief). Every Spotify client ACA generates ads for exists in SF — free knowledge.

**How to apply:**

- Auth: shared HMAC of body+timestamp (`ACA_ALARIC_SHARED_SECRET`) — not JWT, not OIDC, not mTLS. Both apps single-tenant, no third-party verifier needed.
- Endpoints on alaric: 2 not 3. `POST /api/aca/fetch-content` (wraps `fetchContent(url, {policy})`) and chunky `GET /api/aca/sf-client?domain|name|accountId=...` returning account + contacts + opportunities + summary slice of latest `intelligenceReports` row in one shot.
- Where on ACA: pre-fetch on submit (in `/api/ai/generate` before `runAgentLoop`), inject into `buildUserMessage`. NOT tool-call — predictable cost/latency, cacheable, degrades cleanly. One exception: `fetch_url` tool gated by `enrichWithWebSearch` for URLs the LLM discovers via OpenAI web_search.
- SF matching: cheap LLM extraction over `clientDescription` returning `{domain, brandName, confidence}`, plus new optional `salesforceAccountId` field on `ProjectBrief` for explicit override. No new toggle.
- v1 consumes existing `intelligenceReports` rows; never triggers `enrichCompany()` (5-min orchestration, wrong for hot path). v2 adds explicit "Deep enrich" button.

**Key reuse decisions:**

- Stage-3 `referenceUrls` field is currently dead weight (URLs rendered into prompt but never fetched). Repurpose silently as the "scrape these via alaric" trigger — same field, useful behavior. No schema change, no UI churn.
- `enrichWithWebSearch` stays narrowly scoped to OpenAI hosted web_search. Do NOT conflate with alaric enrichment.
- Pre-fetch hook point: between knowledgeContext build (line ~218) and userMessage build (line ~221) in `src/app/api/ai/generate/route.ts`. Same pattern needed in `generate-stream/route.ts`.
