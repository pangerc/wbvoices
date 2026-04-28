/**
 * Brief enrichment pre-fetch pipeline.
 *
 * Before `runAgentLoop` fires, the generate routes call
 * `prefetchBriefEnrichments()` which fans out to alaric:
 *   - one Salesforce client lookup (account + cached intelligence)
 *   - one fetchContent call per `referenceUrls[]`
 *
 * Everything runs in parallel, capped at a 12-second wall-clock budget.
 * Anything that times out or errors is dropped silently with a structured
 * log line — alaric being unreachable should never block a generation.
 *
 * The result feeds into `renderEnrichmentSections()`, which produces the
 * `## Client (from Salesforce)`, `## Reference Page Content`, and
 * `## Brand Voice — extracted` blocks injected into the LLM user message.
 *
 * URL-type-aware extraction (Stage E) lives here too: each fetched URL is
 * classified into one of {homepage, product, press_release, reference_ad,
 * unknown} and the extracted content is projected differently per type
 * (homepage → tagline + lede only; product → full readable; etc.).
 * `reference_ad` URLs are dropped from the prompt by default — including
 * raw ad transcripts is the regression-to-the-mean trap held for Stage F.
 */

import {
  alaric,
  AlaricRequestError,
  type AlaricFetchResult,
  type BrandDossier,
  type BrandVoiceExtract,
  type SfClientBundle,
} from "./alaric-client";

const PREFETCH_DEADLINE_MS = 12_000;
const URL_CONTENT_CHAR_CAP = 4000;

export type UrlType =
  | "homepage"
  | "product"
  | "press_release"
  | "reference_ad"
  | "unknown";

export interface PrefetchedUrlExtract {
  url: string;
  urlType: UrlType;
  /** Extracted text projected per urlType. Empty when the page returned
   *  nothing useful or when the type is excluded by default (reference_ad). */
  extract: string;
  /** When the url was excluded by policy (currently only reference_ad). */
  excluded?: { reason: string };
  /** When the fetch failed or timed out — surfaced for the log; not
   *  injected into the prompt. */
  error?: string;
}

export interface PrefetchedEnrichments {
  sfClient: SfClientBundle | null;
  sfError?: string;
  urlExtracts: PrefetchedUrlExtract[];
  /** Wall-clock ms spent in the fan-out (for telemetry / log). */
  elapsedMs: number;
  /** True when the deadline tripped before all promises settled. */
  timedOut: boolean;
}

/**
 * Race a promise against a deadline. Returns `{ ok: true, value }` on
 * resolution, `{ ok: false, reason }` on rejection or timeout. Doesn't
 * cancel the underlying promise — Node lets the work continue and the
 * result is discarded. This is fine: alaric is read-only over HTTP and
 * the cost is bounded by the upstream tier latencies.
 */
async function withDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  label: string
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`${label}: deadline ${deadlineMs}ms exceeded`)),
        deadlineMs
      );
    });
    const value = await Promise.race([promise, timeout]);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : `${label}: unknown error`,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

/**
 * Heuristic URL classifier. Path-pattern based; cheap, doesn't need to
 * fetch the page to decide. Misclassifications here just mean a slightly
 * less precise extraction — never a hard failure.
 */
export function detectUrlType(url: string): UrlType {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "unknown";
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // Reference-ad indicators: ad-archive sites + YouTube watch URLs (people
  // paste these as "make it sound like THIS spot").
  if (
    host.endsWith("adsoftheworld.com") ||
    host.endsWith("adweek.com") ||
    host.endsWith("adage.com") ||
    host.endsWith("vimeo.com") ||
    (host.endsWith("youtube.com") && parsed.searchParams.has("v")) ||
    host === "youtu.be" ||
    /\/(case[-_ ]?study|case[-_ ]?studies|our[-_ ]?work|portfolio)\b/.test(path) ||
    /\/(ad|spot|commercial|creative)s?\//.test(path)
  ) {
    return "reference_ad";
  }

  // Press / news indicators
  if (
    /\/(press|news|newsroom|blog|insights|articles?|stories|press[-_ ]?release)s?\b/.test(path) ||
    /\/\d{4}\/\d{2}\b/.test(path) // /YYYY/MM/ archive style
  ) {
    return "press_release";
  }

  // Product indicators
  if (
    /\/(product|p|shop|store|item|sku|collection|category|catalogue|catalog)s?\//.test(path) ||
    /\.(html|htm)$/.test(path) && path.split("/").length > 3
  ) {
    return "product";
  }

  // Homepage: root path, or single short segment like /home, /about, /us
  if (
    path === "/" ||
    path === "" ||
    /^\/(home|about|index|us|en)\/?$/.test(path)
  ) {
    return "homepage";
  }

  return "unknown";
}

/**
 * Project the fetched content per urlType. The cheap regex-based hooks
 * here are intentionally conservative — when the heuristic isn't
 * confident, fall through to a capped readability dump. Worst case the
 * LLM sees a bit more page chrome than necessary; never a hard failure.
 */
function extractByType(content: string, urlType: UrlType): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  switch (urlType) {
    case "homepage": {
      // Just the lede: first 1200 chars after readability strip. Brand
      // homepages are mostly marketing slop below the fold; the tagline
      // and the first paragraph are usually the only signal.
      return trimmed.slice(0, 1200);
    }
    case "press_release": {
      // News hook + lede: first 2000 chars. Skip the boilerplate "About
      // [Company]" footer that lives at the bottom of every release.
      return trimmed.slice(0, 2000);
    }
    case "product": {
      // Highest-value URL — full readable up to cap. This is the page
      // that contains the actual offer, the price, the features.
      return trimmed.slice(0, URL_CONTENT_CHAR_CAP);
    }
    case "unknown":
    default: {
      // Generic capped dump.
      return trimmed.slice(0, URL_CONTENT_CHAR_CAP);
    }
    // reference_ad is short-circuited by `prefetchOneUrl` and never
    // reaches the extractor.
  }
}

async function prefetchOneUrl(url: string): Promise<PrefetchedUrlExtract> {
  const urlType = detectUrlType(url);

  // Reference-ad URLs are excluded from injection by default. Plan: full
  // ad transcripts cause phrase-mimicry; corpus-level retrieval is held
  // for Stage F gated by varianceMode.
  if (urlType === "reference_ad") {
    return {
      url,
      urlType,
      extract: "",
      excluded: {
        reason:
          "reference_ad URLs are excluded by default (corpus retrieval is held for Stage F)",
      },
    };
  }

  try {
    const result: AlaricFetchResult = await alaric.fetchContent(url, {
      policy: "enrich",
    });
    return {
      url,
      urlType,
      extract: extractByType(result.content, urlType),
    };
  } catch (err) {
    return {
      url,
      urlType,
      extract: "",
      error:
        err instanceof AlaricRequestError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
            ? err.message
            : "fetch failed",
    };
  }
}

export interface PrefetchInput {
  adId: string;
  salesforceAccountId?: string | null;
  referenceUrls?: string[];
}

/**
 * Run the full enrichment fan-out: SF lookup + per-URL fetch+extract,
 * all in parallel, all bounded by a 12s wall-clock cap.
 */
export async function prefetchBriefEnrichments(
  input: PrefetchInput
): Promise<PrefetchedEnrichments> {
  const start = Date.now();

  const sfPromise: Promise<{ ok: boolean; bundle?: SfClientBundle; error?: string }> =
    input.salesforceAccountId
      ? alaric
          .getSfClient(input.salesforceAccountId)
          .then((bundle) => ({ ok: true as const, bundle }))
          .catch((err: unknown) => ({
            ok: false as const,
            error:
              err instanceof AlaricRequestError
                ? `${err.message} (HTTP ${err.status})`
                : err instanceof Error
                  ? err.message
                  : "sf lookup failed",
          }))
      : Promise.resolve({ ok: false as const, error: undefined });

  const urlPromises: Promise<PrefetchedUrlExtract>[] = (input.referenceUrls || []).map(
    prefetchOneUrl
  );

  // Race the whole bundle against a single deadline so a slow URL can't
  // stall the entire fan-out. Individual results that miss the deadline
  // are dropped from the response with a log line.
  const settled = await withDeadline(
    Promise.allSettled([sfPromise, ...urlPromises]),
    PREFETCH_DEADLINE_MS,
    `[prefetch ad=${input.adId}]`
  );

  const elapsedMs = Date.now() - start;

  if (!settled.ok) {
    console.warn(
      `[brief-enrichment] ${input.adId} timed out after ${elapsedMs}ms — proceeding without enrichments. Reason: ${settled.reason}`
    );
    return {
      sfClient: null,
      urlExtracts: [],
      elapsedMs,
      timedOut: true,
    };
  }

  const [sfResult, ...urlResults] = settled.value;

  // Unpack SF result
  let sfClient: SfClientBundle | null = null;
  let sfError: string | undefined;
  if (sfResult.status === "fulfilled") {
    const r = sfResult.value;
    if (r.ok && r.bundle) sfClient = r.bundle;
    else if (r.error) sfError = r.error;
  } else if (sfResult.status === "rejected") {
    sfError = sfResult.reason instanceof Error ? sfResult.reason.message : String(sfResult.reason);
  }

  if (sfError) {
    console.warn(`[brief-enrichment] ${input.adId} sf lookup failed: ${sfError}`);
  }

  // v2 Stage J — async fire-and-forget enrichment trigger. Default ON
  // when an SF account was looked up AND there's no cached intelligence
  // yet. Standalone brands (no SF backing) skip entirely. Never blocks
  // generation; alaric returns 202 immediately and runs the 5-minute
  // enrichment in the background. Next brief for the same client gets
  // warm intelligence cached.
  //
  // Cost watchdog: alaric logs a `[aca-enrich-trigger]` sentinel per
  // call. The dispatch itself is idempotent (alaric's
  // `getActiveEnrichmentJob` guard) so duplicate fires are no-ops.
  if (
    input.salesforceAccountId &&
    sfClient &&
    sfClient.intelligence === null
  ) {
    const accountIdForTrigger = input.salesforceAccountId;
    void alaric
      .triggerEnrichCompany(accountIdForTrigger)
      .then((result) => {
        // dispatch_failed and noop_fresh are surfaced distinctly so log
        // aggregators can tell "warm cache hit" (good) from "alaric infra
        // tripped" (worth investigating) from "we just kicked a 5-min job"
        // (informational). All other statuses are routine.
        if (result.status === "dispatch_failed") {
          console.warn(
            `[brief-enrichment] ${input.adId} enrich trigger DISPATCH FAILED for ${accountIdForTrigger}${result.warning ? ` — ${result.warning}` : ""}`
          );
          return;
        }
        if (result.status === "noop_fresh") {
          console.log(
            `[brief-enrichment] ${input.adId} enrich trigger noop_fresh for ${accountIdForTrigger} (age=${result.ageHours}h window=${result.windowHours}h)`
          );
          return;
        }
        console.log(
          `[brief-enrichment] ${input.adId} enrich trigger for ${accountIdForTrigger}: status=${result.status}${result.jobId ? ` jobId=${result.jobId}` : ""}`
        );
      })
      .catch((err) => {
        console.warn(
          `[brief-enrichment] ${input.adId} enrich trigger failed for ${accountIdForTrigger}:`,
          err instanceof Error ? err.message : err
        );
      });
  }

  // Unpack URL extracts — settled promises always succeed (errors are
  // captured inside PrefetchedUrlExtract.error), but be defensive.
  const urlExtracts: PrefetchedUrlExtract[] = urlResults.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return {
      url: "(unknown)",
      urlType: "unknown" as UrlType,
      extract: "",
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  for (const ext of urlExtracts) {
    if (ext.error) {
      console.warn(
        `[brief-enrichment] ${input.adId} url ${ext.url} failed: ${ext.error}`
      );
    }
  }

  console.log(
    `[brief-enrichment] ${input.adId} done in ${elapsedMs}ms — sf=${sfClient ? "ok" : "skip"}, urls=${urlExtracts.length} (${urlExtracts.filter((e) => e.extract).length} with content)`
  );

  return { sfClient, sfError, urlExtracts, elapsedMs, timedOut: false };
}

/**
 * Render the prefetched enrichments as the three structured sections that
 * land inside the LLM user message. Each section is omitted when there's
 * nothing to inject.
 *
 * Caller assembles these around the rest of the user message:
 *
 *   const enrichments = await prefetchBriefEnrichments(...);
 *   const sections = renderEnrichmentSections(enrichments);
 *   const userMessage = buildUserMessage({ ..., enrichmentSections: sections });
 */
export function renderEnrichmentSections(
  enrichments: PrefetchedEnrichments
): string {
  const parts: string[] = [];

  if (enrichments.sfClient) {
    // v4 — when alaric returns a `dossier`, project that into the prompt.
    // Falls back to the legacy SF-account + BrandVoiceExtract sections
    // only when dossier is null (alaric has no companies row at all).
    if (enrichments.sfClient.dossier) {
      parts.push(renderBrandDossier(enrichments.sfClient.dossier, enrichments.sfClient));
    } else {
      parts.push(renderSfClientSection(enrichments.sfClient));
      if (enrichments.sfClient.intelligence) {
        const block = renderBrandVoiceSection(
          enrichments.sfClient.intelligence,
          enrichments.sfClient.intelligenceAge
        );
        if (block) parts.push(block);
      }
    }
  }

  const usableUrls = enrichments.urlExtracts.filter((e) => e.extract);
  if (usableUrls.length) {
    parts.push(renderReferencePagesSection(usableUrls));
  }

  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

/**
 * Render the full BrandDossier as a single multi-section prompt block
 * for the agent's user message. Empty slots are omitted (no theatrical
 * "(no signal)" placeholders). Always opens with a load-bearing
 * "Creative posture" directive when known — that's what tells the
 * script-writing agent whether to write momentum / re-engagement /
 * win-back / exploratory voice.
 *
 * The block is comprehensive on purpose. Per user direction in v4:
 * NO COST BOUNDING — bring everything alaric has. Prompt caching makes
 * the repeat-seeing-of-large-blocks efficient.
 */
function renderBrandDossier(dossier: BrandDossier, bundle: SfClientBundle): string {
  const lines: string[] = [`## Brand Dossier — ${dossier.identity.name}`];

  // ===== Identity (compact territory + state line) =====
  const identityBits: string[] = [];
  if (dossier.identity.territoryDivergent) {
    identityBits.push(
      `Reporting territory: ${dossier.identity.reportingTerritory} (legal entity in ${dossier.identity.legalEntity} — divergent)`
    );
  } else if (dossier.identity.reportingTerritory) {
    identityBits.push(`Territory: ${dossier.identity.reportingTerritory}`);
  } else if (dossier.identity.legalEntity) {
    identityBits.push(`Country: ${dossier.identity.legalEntity}`);
  }
  if (dossier.meta.state === "rich") {
    identityBits.push("alaric profile: rich");
  } else if (dossier.meta.state === "thin") {
    identityBits.push("alaric profile: thin (no advertising-activity reports yet)");
  }
  if (identityBits.length) {
    lines.push(`- ${identityBits.join(" · ")}`);
  }

  // ===== Commercial relationship =====
  const c = dossier.commercial;
  const commercialLines: string[] = [];
  if (c.creativePosture) {
    commercialLines.push(`- Creative posture: ${posturePromptLine(c.creativePosture)}`);
  }
  if (c.isActivelySpending !== undefined || c.isOnboardedClient !== undefined || c.trailing12MonthRevenue !== undefined) {
    const relParts: string[] = [];
    if (c.isActivelySpending) relParts.push("Active spending client");
    else if (c.isOnboardedClient) relParts.push("Onboarded, not actively spending");
    else if (c.isOnboardedClient === false) relParts.push("Not an onboarded client");
    if (typeof c.trailing12MonthRevenue === "number" && c.trailing12MonthRevenue > 0) {
      relParts.push(`T12M revenue ${formatRevenue(c.trailing12MonthRevenue)}`);
    } else if (c.isOnboardedClient && !c.isActivelySpending) {
      relParts.push("T12M revenue €0");
    }
    if (relParts.length) commercialLines.push(`- Aleph relationship: ${relParts.join(", ")}`);
  }
  if (c.revenueByPlatform) {
    const platformLine = formatRevenueByPlatformLine(c.revenueByPlatform);
    if (platformLine) commercialLines.push(`  · ${platformLine}`);
  }
  if (c.revenueTimeline?.length) {
    const trend = formatRevenueTrend(c.revenueTimeline);
    if (trend) commercialLines.push(`  · Quarterly trend: ${trend}`);
  }
  if (c.openPipeline?.length) {
    const pipelineSummary = formatPipeline(c.openPipeline);
    if (pipelineSummary) commercialLines.push(`- Open pipeline: ${pipelineSummary}`);
  }
  if (c.leadType) {
    commercialLines.push(`- Lead profile: ${c.leadType}`);
  }
  if (commercialLines.length) {
    lines.push("", "### Commercial relationship", ...commercialLines);
  }

  // ===== Creative posture =====
  const cr = dossier.creative;
  const creativeLines: string[] = [];
  if (cr.pitchAngles?.length) {
    creativeLines.push(`- Pitch angles (from advertising activity):`);
    for (const a of cr.pitchAngles) creativeLines.push(`  · ${a}`);
  }
  if (cr.valueProposition) {
    creativeLines.push(`- Value proposition: ${cr.valueProposition}`);
  }
  if (cr.whatTheyreAdvertising?.length) {
    creativeLines.push(`- Currently advertising: ${cr.whatTheyreAdvertising.slice(0, 8).join(" · ")}`);
  }
  if (cr.salesBriefing) {
    creativeLines.push(`- Sales briefing: ${cr.salesBriefing}`);
  }
  if (cr.creativeStyleNotes?.length) {
    creativeLines.push(`- Creative style: ${cr.creativeStyleNotes.join(" · ")}`);
  }
  if (cr.tonalAxes) {
    const t = cr.tonalAxes;
    const tonalParts: string[] = [];
    if (t.energy !== undefined) tonalParts.push(`energy ${t.energy}/5`);
    if (t.pace) tonalParts.push(`pace: ${t.pace}`);
    if (t.vocabRegister) tonalParts.push(`register: ${t.vocabRegister}`);
    if (t.humorTolerance) tonalParts.push(`humor tolerance: ${t.humorTolerance}`);
    if (tonalParts.length) creativeLines.push(`- Tonal axes: ${tonalParts.join(" · ")}`);
  }
  if (creativeLines.length) {
    lines.push("", "### Creative posture", ...creativeLines);
  }

  // ===== Competitive read =====
  const comp = dossier.competitive;
  const compLines: string[] = [];
  if (comp.competitiveGaps?.length) {
    compLines.push(`- Competitive gaps:`);
    for (const g of comp.competitiveGaps) compLines.push(`  · ${g}`);
  }
  if (comp.longestCampaignDays !== undefined) {
    compLines.push(`- Longest campaign: ${comp.longestCampaignDays} days`);
  }
  if (comp.agencyManaged) {
    compLines.push(
      `- Agency-managed${comp.agencyName ? ` (${comp.agencyName})` : ""}`
    );
  }
  if (comp.crossSellGap) {
    compLines.push(`- Cross-sell gap: ${comp.crossSellGap}`);
  }
  if (compLines.length) {
    lines.push("", "### Competitive read", ...compLines);
  }

  // ===== Audience signals =====
  const aud = dossier.audience;
  const audLines: string[] = [];
  if (aud.targetAges?.length) {
    audLines.push(`- Target ages: ${aud.targetAges.join(", ")}`);
  }
  if (aud.targetLocations?.length) {
    audLines.push(`- Target locations: ${aud.targetLocations.slice(0, 6).join(", ")}`);
  }
  if (aud.publisherPlatforms?.length) {
    const pubs = aud.publisherPlatforms
      .map((p) => p.activeAdCount !== undefined ? `${p.name} (${p.activeAdCount} ads)` : p.name)
      .join(" · ");
    audLines.push(`- Publisher platforms: ${pubs}`);
  }
  if (aud.euTotalReach !== undefined && aud.euTotalReach > 0) {
    audLines.push(`- 30-day EU reach: ${formatReach(aud.euTotalReach)}`);
  }
  if (aud.primaryLanguages?.length) {
    audLines.push(`- Primary creative languages: ${aud.primaryLanguages.join(", ")}`);
  }
  if (audLines.length) {
    lines.push("", "### Audience signals", ...audLines);
  }

  // ===== Policy & constraints =====
  const pol = dossier.policy;
  const polLines: string[] = [];
  if (pol.industryGroup && pol.industrySubCategory) {
    const flag = pol.adsPolicyRelevant ? " ⚠ ads-policy relevant" : "";
    polLines.push(`- Industry: ${pol.industryGroup} > ${pol.industrySubCategory} (canonical${flag})`);
  }
  if (pol.mandatoryLegal?.length) {
    polLines.push(`- Mandatory legal: ${pol.mandatoryLegal.join(" | ")}`);
  }
  if (pol.tabooWords?.length) {
    polLines.push(`- Avoid (taboo): ${pol.tabooWords.join(", ")}`);
  }
  if (polLines.length) {
    lines.push("", "### Policy & constraints", ...polLines);
  }

  // ===== Optional verbatim SF Description =====
  if (bundle.account.Description && bundle.account.Description.trim()) {
    lines.push("", "### Brand description (verbatim from Salesforce)", bundle.account.Description.trim());
  }

  return lines.join("\n");
}

function formatRevenueByPlatformLine(byPlatform: Record<string, number>): string | null {
  const entries = Object.entries(byPlatform).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 4);
  return top
    .map(([platform, amount]) => {
      const pct = Math.round((amount / total) * 100);
      return `${platform}: ${formatRevenue(amount)} (${pct}%)`;
    })
    .join(" · ");
}

function formatRevenueTrend(
  timeline: NonNullable<BrandDossier["commercial"]["revenueTimeline"]>
): string | null {
  if (timeline.length === 0) return null;
  const sorted = [...timeline].sort((a, b) => (a.quarter < b.quarter ? -1 : 1));
  const top = sorted.slice(-8); // last 8 quarters
  // Identify peak.
  const peak = top.reduce((max, e) => (e.total > max.total ? e : max), top[0]);
  const last = top[top.length - 1];
  const delta = last.total - top[0].total;
  const trend = delta > 0 ? "growing" : delta < 0 ? "declining" : "flat";
  return `${top.length}Q rolling — peaked ${peak.quarter} (${formatRevenue(peak.total)}), ${trend}`;
}

function formatPipeline(
  pipeline: NonNullable<BrandDossier["commercial"]["openPipeline"]>
): string | null {
  if (pipeline.length === 0) return null;
  const products = pipeline
    .map((p) => p.product)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const productStr = products.length
    ? ` · products: ${unique(products).slice(0, 3).join(", ")}`
    : "";
  const totalAmount = pipeline.reduce((s, p) => s + (p.amount ?? 0), 0);
  const amountStr = totalAmount > 0 ? ` · total ${formatRevenue(totalAmount)}` : "";
  return `${pipeline.length} open opportunit${pipeline.length === 1 ? "y" : "ies"}${productStr}${amountStr}`;
}

function formatReach(reach: number): string {
  if (reach >= 1_000_000) return `~${(reach / 1_000_000).toFixed(1)}M`;
  if (reach >= 1_000) return `~${Math.round(reach / 1_000)}k`;
  return `~${Math.round(reach)}`;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function renderSfClientSection(bundle: SfClientBundle): string {
  // Two layers in this block: (1) the SF Account fields that carry
  // creative signal — Name, Industry (canonical when alaric has it,
  // free-text fallback), Description; and (2) the alaric profile —
  // creative posture, revenue distribution, divergent territory note.
  // Numbers like revenue and platform splits are framed as creative
  // context, not numeric reporting; the agent uses them to pick voice
  // and angle, not to recite figures back to the listener.
  const a = bundle.account;
  const p = bundle.alaricProfile;
  const headline = p ? `## Client (from Salesforce + alaric)` : `## Client (from Salesforce)`;
  const lines: string[] = [headline];

  lines.push(`- Name: ${a.Name}`);

  // Industry: prefer alaric's canonical taxonomy, fall back to SF free-text.
  if (p?.industryGroup && p.industrySubCategory) {
    const policyNote = p.adsPolicyRelevant ? " · ⚠ ads-policy relevant" : "";
    lines.push(
      `- Industry: ${p.industryGroup} > ${p.industrySubCategory} (canonical${policyNote})`
    );
  } else if (a.Industry) {
    lines.push(`- Industry: ${a.Industry}`);
  }

  // Territory: surface the reporting/billing divergence when present, since
  // it disambiguates accent + cultural register for the script-writing agent.
  if (p?.sfReportingCountry || p?.sfBillingCountry) {
    const reporting = p.sfReportingCountry;
    const billing = p.sfBillingCountry;
    if (reporting && billing && reporting !== billing) {
      lines.push(
        `- Reporting territory: ${reporting} (legal entity registered in ${billing} — divergent)`
      );
    } else if (reporting) {
      lines.push(`- Reporting territory: ${reporting}`);
    } else if (billing) {
      lines.push(`- Billing country: ${billing}`);
    }
  } else if (a.BillingCountry) {
    lines.push(`- Billing country: ${a.BillingCountry}`);
  }

  // Aleph relationship + creative posture — load-bearing for voice direction.
  if (p?.creativePosture) {
    const rel = relationshipLine(p);
    if (rel) lines.push(rel);
    const platforms = revenueByPlatformLine(p);
    if (platforms) lines.push(platforms);
    lines.push(`- Creative posture: ${posturePromptLine(p.creativePosture)}`);
  } else if (a.Status__c) {
    // Fallback to the legacy Status__c heuristic when alaric hasn't ingested.
    const lapsed = /lapsed|churn|inactive/i.test(a.Status__c);
    lines.push(
      `- Status: ${a.Status__c}${lapsed ? " (this is a win-back posture — acknowledge return / freshness)" : ""}`
    );
  }

  if (a.Description && a.Description.trim()) {
    lines.push(``);
    lines.push(`### Brand description (verbatim from Salesforce)`);
    lines.push(a.Description.trim());
  }
  return lines.join("\n");
}

/**
 * "Aleph relationship: Active client, T12M revenue €240k" — only
 * rendered when alaric has at least one of the data points. Currency
 * is left as `€` because the SF data we ingest is Aleph-EMEA-Aleph; if
 * we ever go cross-region the formatting policy lives here.
 */
function relationshipLine(p: import("./alaric-client").AlaricCompanyProfile): string | null {
  const parts: string[] = [];
  if (p.isActivelySpending === true) parts.push("Active client");
  else if (p.isOnboardedClient === true) parts.push("Onboarded but not actively spending");
  else if (p.isOnboardedClient === false) parts.push("Not an onboarded client");
  if (typeof p.trailing12MonthRevenue === "number" && p.trailing12MonthRevenue > 0) {
    parts.push(`T12M revenue ${formatRevenue(p.trailing12MonthRevenue)}`);
  } else if (p.isOnboardedClient && !p.isActivelySpending) {
    parts.push("T12M revenue €0");
  }
  if (parts.length === 0) return null;
  return `- Aleph relationship: ${parts.join(", ")}`;
}

function revenueByPlatformLine(p: import("./alaric-client").AlaricCompanyProfile): string | null {
  if (!p.revenueByPlatform) return null;
  const entries = Object.entries(p.revenueByPlatform).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  // Sort descending, render top 4 to keep the prompt tight.
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 4);
  const formatted = top.map(([platform, amount]) => {
    const pct = Math.round((amount / total) * 100);
    return `${platform}: ${formatRevenue(amount)} (${pct}%)`;
  });
  return `  · By platform: ${formatted.join(" · ")}`;
}

/**
 * One-line creative directive per posture. The agent reads this as a
 * voice-direction cue, not a label — it's load-bearing for whether the
 * script opens with momentum, re-engagement, win-back, or exploratory
 * framing.
 */
function posturePromptLine(
  posture: "active" | "dormant_onboarded" | "lapsed" | "prospect"
): string {
  switch (posture) {
    case "active":
      return "ACTIVE — momentum voice, brand-voice forward, no 'we miss you' framing.";
    case "dormant_onboarded":
      return "DORMANT (onboarded, no T12M revenue) — re-engagement voice, 'since you last heard from us' framing is appropriate.";
    case "lapsed":
      return "LAPSED (former client, > 18 months stale) — win-back voice, acknowledge return + freshness.";
    case "prospect":
      return "PROSPECT — exploratory voice, no relationship assumptions, lead with brand promise.";
  }
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `€${Math.round(amount / 1_000)}k`;
  return `€${Math.round(amount)}`;
}

function renderBrandVoiceSection(
  extract: BrandVoiceExtract,
  ageSeconds: number | null
): string | null {
  const lines: string[] = [];
  if (extract.tagline) lines.push(`- Tagline: "${extract.tagline}"`);
  if (extract.productNames?.length) {
    lines.push(`- Named products: ${extract.productNames.join(", ")}`);
  }
  if (extract.signOffPhrases?.length) {
    lines.push(`- Recurring CTAs / sign-offs: ${extract.signOffPhrases.join(", ")}`);
  }
  if (extract.tabooWords?.length) {
    lines.push(`- AVOID these words / phrases: ${extract.tabooWords.join(", ")}`);
  }
  if (extract.mandatoryLegal?.length) {
    lines.push(`- MANDATORY legal phrases: ${extract.mandatoryLegal.join(" | ")}`);
  }

  const tonal = extract.tonalAxes;
  if (tonal && (tonal.energy !== undefined || tonal.pace || tonal.vocabRegister || tonal.humorTolerance)) {
    const tonalParts: string[] = [];
    if (tonal.energy !== undefined) tonalParts.push(`energy ${tonal.energy}/5`);
    if (tonal.pace) tonalParts.push(`pace: ${tonal.pace}`);
    if (tonal.vocabRegister) tonalParts.push(`register: ${tonal.vocabRegister}`);
    if (tonal.humorTolerance) tonalParts.push(`humor tolerance: ${tonal.humorTolerance}`);
    lines.push(`- Tonal axes: ${tonalParts.join(" · ")}`);
  }

  if (lines.length === 0) return null;

  const ageNote = ageSeconds !== null
    ? ` (intelligence cached ${formatAge(ageSeconds)})`
    : "";

  return `## Brand Voice — extracted${ageNote}\n${lines.join("\n")}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

function renderReferencePagesSection(extracts: PrefetchedUrlExtract[]): string {
  const blocks: string[] = [`## Reference Page Content`];
  for (const e of extracts) {
    blocks.push(`\n### ${e.url} (${e.urlType})`);
    blocks.push(e.extract);
  }
  return blocks.join("\n");
}

