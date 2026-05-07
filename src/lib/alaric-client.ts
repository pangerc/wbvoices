/**
 * Signed HTTP client for the sibling alaric service.
 *
 * Alaric exposes brief-enrichment endpoints under `/api/aca/*` (web fetch +
 * Salesforce client lookup). All requests are HMAC-signed over a payload
 * that includes the consumer slug + a unix timestamp; alaric verifies
 * with a per-consumer secret and a 60-second replay window. See alaric's
 * `src/lib/aca-auth.ts` for the verifier — keep payload format and
 * header names in lock-step.
 *
 * Canonical headers we send:
 *   x-aleph-consumer:  "aca"
 *   x-aleph-timestamp: <unix seconds>
 *   x-aleph-signature: <hex HMAC-SHA256>
 *
 * Canonical signed payload (one string, components joined by `\n`):
 *   <consumerId>
 *   <timestampSeconds>
 *   <METHOD UPPERCASED>
 *   <pathname-with-querystring>
 *   <sha256(body) as lowercase hex>
 *
 * For GET requests with no body, the sha256 is over the empty string.
 * Binding `consumerId` into the signed payload means a signature minted
 * by consumer A's secret can't be replayed against consumer B's surface
 * once alaric registers consumer #2.
 *
 * Failure semantics: every wrapper throws `AlaricRequestError` on non-2xx.
 * Callers in the brief pre-fetch path (`src/app/api/ai/generate/route.ts`)
 * use Promise.allSettled and drop failures silently with a structured log
 * — alaric being unreachable should never block a generation.
 */

import { createHmac, createHash } from "crypto";

/** Identifies this app to alaric's HMAC verifier. Bound into every signed
 *  payload so a leaked ACA secret can't be replayed against future sibling
 *  apps once alaric onboards a second consumer. */
const CONSUMER_ID = "aca";

const CONSUMER_HEADER = "x-aleph-consumer";
const TIMESTAMP_HEADER = "x-aleph-timestamp";
const SIGNATURE_HEADER = "x-aleph-signature";

export class AlaricRequestError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "AlaricRequestError";
    this.status = status;
    this.body = body;
  }
}

interface SignedRequestInit {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // pathname + (optionally) ?query
  body?: unknown; // JSON-serialisable; will be JSON.stringified
}

function getConfig(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.ALARIC_BASE_URL;
  if (!baseUrl) {
    throw new AlaricRequestError(
      "ALARIC_BASE_URL env var not set — cannot reach alaric.",
      500,
    );
  }
  const secret = process.env.ACA_ALARIC_SHARED_SECRET;
  if (!secret) {
    throw new AlaricRequestError(
      "ACA_ALARIC_SHARED_SECRET env var not set — cannot sign alaric requests.",
      500,
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

async function signedFetch<T>(init: SignedRequestInit): Promise<T> {
  const { baseUrl, secret } = getConfig();
  const url = `${baseUrl}${init.path}`;
  const rawBody = init.body === undefined ? "" : JSON.stringify(init.body);
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  // Canonical payload: consumerId prefix locks this signature to alaric's
  // ACA-secret bucket. See alaric/src/lib/aca-auth.ts.
  const payload = `${CONSUMER_ID}\n${timestamp}\n${init.method}\n${init.path}\n${bodyHash}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");

  const headers: Record<string, string> = {
    [CONSUMER_HEADER]: CONSUMER_ID,
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: signature,
  };
  if (rawBody) headers["content-type"] = "application/json";

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: rawBody || undefined,
    // Don't cache cross-service calls — they're already cheap to repeat
    // and we want fresh data on every brief generation.
    cache: "no-store",
  });

  if (!response.ok) {
    let errBody: unknown;
    try {
      errBody = await response.json();
    } catch {
      errBody = await response.text().catch(() => undefined);
    }
    throw new AlaricRequestError(
      `alaric ${init.method} ${init.path} failed: ${response.status}`,
      response.status,
      errBody,
    );
  }

  return (await response.json()) as T;
}

// ============================================
// Typed wrappers — one per alaric endpoint
// ============================================

/**
 * Tier names mirror alaric/src/lib/fetch/types.ts. Defined here as a
 * narrow string union so we don't need a runtime dep on alaric's types.
 */
export type AlaricFetchTier =
  | "direct"
  | "jina"
  | "firecrawl"
  | "puppeteer"
  | "authenticated";

export type AlaricFetchDiagnosis =
  | "ok"
  | "too_short"
  | "cookie_wall"
  | "error_page"
  | "login_wall"
  | "best_effort";

export type AlaricFetchPolicy =
  | "triage"
  | "enrich"
  | "spa"
  | "browser_only"
  | "multi_page"
  | "authenticated";

export interface AlaricFetchResult {
  url: string;
  content: string;
  html: string | null;
  tier: AlaricFetchTier;
  diagnosis: AlaricFetchDiagnosis;
  charCount: number;
  error?: string;
}

/**
 * Fetch a single URL via alaric's tiered cascade. Default policy `enrich`
 * (T0 → T1 Jina → T3 Puppeteer with diagnosis-driven escalation). Returns
 * the best content available even when every tier under-delivered
 * (`diagnosis: "best_effort"`) — caller decides whether to use it.
 */
export async function fetchContent(
  url: string,
  opts: { policy?: AlaricFetchPolicy } = {},
): Promise<AlaricFetchResult> {
  return signedFetch<AlaricFetchResult>({
    method: "POST",
    path: "/api/aca/fetch-content",
    body: { url, policy: opts.policy ?? "enrich" },
  });
}

export interface SfAccountSearchResult {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
}

/**
 * Search Salesforce Account by name fragment for the brief picker UI.
 * Thin SOQL `LIKE` — returns top N (default 10) so the autocomplete stays
 * responsive. Optional `clientPlatforms` filter restricts hits to SF
 * accounts that alaric has tagged as buying at least one of the given
 * platforms (e.g. `["spotify"]`) — derived from enriched
 * `OpportunityLineItem.Product2.Name` mappings on the alaric side. ACA's
 * brand picker defaults to `["spotify"]` so reps only see accounts
 * relevant to the Spotify creative being authored.
 */
export async function searchSfAccounts(
  query: string,
  opts: { limit?: number; clientPlatforms?: string[]; market?: string } = {},
): Promise<SfAccountSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.clientPlatforms && opts.clientPlatforms.length > 0) {
    params.set("clientPlatforms", opts.clientPlatforms.join(","));
  }
  // alaric filters SF accounts by market (alpha-2). When the brief panel
  // has a market picked, we forward it so reps don't see results from
  // other countries. Param name mirrors alaric's /api/aca/markets shape.
  if (opts.market) params.set("market", opts.market);
  return signedFetch<SfAccountSearchResult[]>({
    method: "GET",
    path: `/api/aca/sf-search?${params.toString()}`,
  });
}

export interface SfAccountFull {
  Id: string;
  Name: string;
  Website: string | null;
  Industry: string | null;
  Description: string | null;
  BillingCountry: string | null;
  Status__c: string | null;
}

/**
 * Tonal axes derived from cached brand intelligence. Each axis is a short
 * structured cue the LLM can act on without phrase-level mimicry. Optional
 * across the board — alaric only emits values it can confidently project
 * from the source intelligence report.
 *
 * Definitions:
 *  - energy: 1 (subdued) → 5 (high-arousal)
 *  - pace: characteristic speaking rhythm
 *  - vocabRegister: how the brand actually talks
 *  - humorTolerance: whether jokes / dry wit are on-brand
 */
export interface BrandTonalAxes {
  energy?: 1 | 2 | 3 | 4 | 5;
  pace?: "slow" | "medium" | "fast";
  vocabRegister?: "street" | "conversational" | "formal";
  humorTolerance?: "none" | "dry" | "broad";
}

/**
 * Extracted brand-voice signal pulled from any cached intelligence report
 * on alaric's side. Six categories total, split into:
 *  - High-confidence facts (tagline, productNames, signOffPhrases,
 *    tabooWords, mandatoryLegal) — omitting them is wrong, not creatively
 *    brave.
 *  - Tonal axes (energy / pace / vocabRegister / humorTolerance) — short
 *    structured cues, hard for the LLM to drift on.
 *
 * Specifically excludes full ad transcripts. Per the brand-mean vs
 * global-slop-mean ladder: at our current stage the schema-level extracts
 * anchor the model to the brand without phrase-level mimicry. Transcript-
 * level retrieval is a v2 dial gated by `varianceMode`.
 */
export interface BrandVoiceExtract {
  tagline?: string | null;
  productNames?: string[];
  signOffPhrases?: string[];
  tabooWords?: string[];
  mandatoryLegal?: string[];
  tonalAxes?: BrandTonalAxes;
}

/**
 * Alaric-side projection from `companies.signals` — see
 * alaric/src/lib/salesforce/account-lookup.ts:AlaricCompanyProfile for
 * the canonical type definition + field semantics. Mirror kept here so
 * ACA can render the bundle without importing from alaric.
 */
export interface AlaricCompanyProfile {
  isOnboardedClient?: boolean;
  isActivelySpending?: boolean;
  trailing12MonthRevenue?: number;
  lastCloseWonDate?: string | null;
  clientPlatforms?: string[];
  revenueByPlatform?: Record<string, number>;
  sfReportingCountry?: string;
  sfReportingCountryCode?: string;
  sfBillingCountry?: string;
  sfManagingEntity?: string;
  industryGroup?: string;
  industrySubCategory?: string;
  industryCode?: string;
  adsPolicyRelevant?: boolean;
  creativePosture?: "active" | "dormant_onboarded" | "lapsed" | "prospect";
}

/**
 * Five-slot BrandDossier — see alaric/src/lib/salesforce/account-lookup.ts
 * for the canonical definition + projection logic. Mirrored here so ACA
 * can render the prompt block without importing from alaric.
 */
export interface BrandDossier {
  identity: {
    name: string;
    sfAccountId?: string;
    domain?: string;
    market?: string;
    reportingTerritory?: string;
    legalEntity?: string;
    territoryDivergent?: boolean;
  };
  commercial: {
    isOnboardedClient?: boolean;
    isActivelySpending?: boolean;
    trailing12MonthRevenue?: number;
    lastCloseWonDate?: string | null;
    revenueByPlatform?: Record<string, number>;
    revenueTimeline?: Array<{
      quarter: string;
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
    leadType?: string;
    creativePosture?: "active" | "dormant_onboarded" | "lapsed" | "prospect";
  };
  creative: {
    pitchAngles?: string[];
    valueProposition?: string;
    whatTheyreAdvertising?: string[];
    messagingThemes?: string[];
    salesBriefing?: string;
    tonalAxes?: BrandTonalAxes;
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
    industryCode?: string;
    adsPolicyRelevant?: boolean;
    mandatoryLegal?: string[];
    tabooWords?: string[];
  };
  meta: {
    state: "rich" | "thin" | "empty";
    lastEnrichedAt?: number;
    reportTypesPresent: string[];
  };
}

export interface SfClientBundle {
  account: SfAccountFull;
  /** @deprecated v4: read from `dossier.policy.tabooWords` etc. */
  intelligence: BrandVoiceExtract | null;
  intelligenceAge: number | null;
  /** @deprecated v4: read from `dossier.commercial` + `dossier.policy`. */
  alaricProfile: AlaricCompanyProfile | null;
  /** v4 — the load-bearing projection. Null when alaric has no companies row. */
  dossier: BrandDossier | null;
}

/**
 * Bundled SF account + cached intelligence lookup. ACA almost always wants
 * both — Account gives identity, intelligence gives codified brand voice
 * — so a single endpoint saves a network hop. `intelligence: null` is the
 * normal case for clients alaric has never enriched (we don't trigger
 * enrichment from here — that's a 5-minute orchestration that belongs
 * out-of-band).
 */
export async function getSfClient(accountId: string): Promise<SfClientBundle> {
  const params = new URLSearchParams({ accountId });
  return signedFetch<SfClientBundle>({
    method: "GET",
    path: `/api/aca/sf-client?${params.toString()}`,
  });
}

/**
 * Status returned by alaric's async enrichment trigger. Mirrors the
 * server-side `Status` union in alaric/src/app/api/aca/enrich-company-async/route.ts.
 *   - `enqueued` — created a new enrich_company job and dispatched it.
 *   - `in_progress` — guard hit; enrichment already running.
 *   - `noop_fresh` — a current intelligence report exists and is younger
 *     than alaric's staleness window. Healthy cache hit, not an error.
 *   - `noop_no_company` — no alaric company matches the SF account id yet.
 *   - `noop_no_domain` — alaric company exists but has no domain set.
 *   - `dispatch_failed` — job row was created but the dispatcher threw.
 *     Alaric still returned 202 so we don't block; surface as a warning,
 *     not as success.
 */
export type EnrichTriggerStatus =
  | "enqueued"
  | "in_progress"
  | "noop_fresh"
  | "noop_no_company"
  | "noop_no_domain"
  | "dispatch_failed";

export interface EnrichTriggerResult {
  status: EnrichTriggerStatus;
  jobId?: string;
  warning?: string;
  /** Set when status === "noop_fresh": age of the most recent intelligence
   *  report in hours, and the staleness window alaric is currently using. */
  ageHours?: number;
  windowHours?: number;
}

/**
 * Fire-and-forget trigger: ask alaric to enrich the company matching this
 * SF account in the background. Always resolves to a 202 response from
 * alaric — never blocks. Use after `getSfClient` returns
 * `intelligence: null` so the next brief for the same client is warm.
 *
 * Caller should NOT await the response if it cares about latency. The
 * brief-enrichment fan-out fires this and lets the promise settle in the
 * background; even an error here is non-fatal (alaric problems surface
 * in alaric's own activity panel, not in the brief flow).
 */
// ============================================
// Markets — alaric's canonical 86-market mapping
// ============================================

/**
 * Per-platform availability indicator. `available` = Aleph has volume here;
 * `empty` = supported but no volume yet (don't filter out — campaigns may
 * still run); `unsupported` = the platform doesn't operate in this market.
 */
export type PlatformCoverage = "available" | "unsupported" | "empty";

/**
 * Per-market language record. `commerceVocabulary` is currency words +
 * "buy/shop/price" cognates in the market's primary language (plug into VO
 * scripts); `legalDescriptors` is regulatory phrasing (e.g. legal-entity
 * suffixes) used in compliant ad copy.
 */
export interface MarketLanguage {
  code: string;
  name: string;
  script: string;
  commerceVocabulary: string[];
  legalDescriptors: string[];
}

/**
 * Canonical market record from alaric. `code` is alpha-2 (ISO 3166-1).
 * `region` is a descriptive grouping ("Southern Europe", "DACH") used for
 * voiceover-session batching, not a geopolitical taxonomy.
 */
export interface MarketRow {
  code: string;
  name: string;
  region: string;
  aliases: string[];
  tld: string;
  platformCoverage: Record<string, PlatformCoverage>;
  language: MarketLanguage;
}

export interface MarketsResponse {
  markets: MarketRow[];
  totalCount: number;
  generatedAt: string;
}

/**
 * Fetch the canonical 86-market mapping from alaric.
 *
 * @param opts.platform — when set, alaric filters out `unsupported` markets
 *   for that platform; `empty` markets stay (campaigns can still run there).
 *   Pass "spotify" for ACA's default warm path.
 */
export async function getMarkets(
  opts: { platform?: string } = {},
): Promise<MarketsResponse> {
  const params = new URLSearchParams();
  if (opts.platform) params.set("platform", opts.platform);
  const query = params.toString();
  return signedFetch<MarketsResponse>({
    method: "GET",
    path: `/api/aca/markets${query ? `?${query}` : ""}`,
  });
}

export async function triggerEnrichCompany(
  accountId: string,
): Promise<EnrichTriggerResult> {
  return signedFetch<EnrichTriggerResult>({
    method: "POST",
    path: "/api/aca/enrich-company-async",
    body: { accountId },
  });
}

export const alaric = {
  fetchContent,
  searchSfAccounts,
  getSfClient,
  triggerEnrichCompany,
  getMarkets,
};
