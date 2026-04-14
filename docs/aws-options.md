# AWS Deployment Options

**Decision:** SST v3 + OpenNext (Option A)
**Decided:** March 2026
**Approved by:** Zan Pajek, Sandi Krizanic

---

## Why not Amplify

AWS Amplify was evaluated first but has four hard blockers for our app:

1. **Next.js 16 not supported** — Amplify supports through v15. Our app uses async `params: Promise<...>` in 50+ routes, React 19, next-auth v5 beta. Downgrading touches 38+ files and rewrites the auth layer.
2. **SSE streaming broken** — Amplify buffers ReadableStream responses completely. Our `generate-stream` endpoint (the core real-time UX) cannot work. Confirmed limitation, no fix timeline.
3. **30s Lambda timeout, not configurable** — We need up to 300s for Lahajati voice generation and Mubert music polling (5-second intervals, up to 60 attempts). No workaround within Amplify.
4. **No VPC access** — Can't reach private databases without making them public.

Even with a full v15 downgrade, blockers 2-4 remain. Rearchitecting streaming into polling and extracting long-running ops into separate Lambdas eliminates Amplify's simplicity benefit entirely.

Next.js 16.2 shipped the stable Adapter API, co-built with OpenNext, AWS, Cloudflare, and Netlify. The ecosystem is converging on v16 — downgrading would mean upgrading again shortly after.

---

## Option A: SST v3 + OpenNext (chosen)

SST is an open-source deployment framework (same category as Terraform/CDK). It runs at build time only — production is 100% AWS services: Lambda, CloudFront, S3, Route 53.

| | |
|---|---|
| App code changes | None — add `sst.config.ts` and deploy |
| SSE streaming | Lambda Response Streaming, works natively |
| Timeout | Configurable up to 15 minutes |
| VPC | Supported for SSR Lambda |
| Next.js 16 | Supported via OpenNext + Adapter API |
| Edge routes | Supported (we have 11 edge routes) |
| Timeline | 4-5 weeks |
| Cost | ~$40/month at 200 users |

---

## Option B: ECS Fargate + CloudFront

Run `next start` in a Docker container behind ALB + CloudFront. 100% AWS-native including build tools (CodeBuild, CodePipeline).

| | |
|---|---|
| App code changes | None |
| SSE streaming | Works natively (just HTTP) |
| Timeout | No limit (long-running process) |
| VPC | Full control |
| Timeline | 8-12 weeks |
| Cost | $50-100/month minimal, $900/month full enterprise (multi-AZ, auto-scaling, managed databases) |

Only makes sense if the organization requires AWS-native tooling at build time as well, not just in production. At minimal scale the cost and timeline don't justify the overhead vs Option A.

---

## Option C: Amplify + workarounds (rejected)

Requires Next.js 15 downgrade, rewriting SSE to polling, adding background Lambdas for timeout workaround. More work than Option A, costs more, and has a dead end on data sovereignty (can't move database/cache into AWS VPC).

| | |
|---|---|
| App code changes | 38+ files async params, auth rewrite, streaming rearchitect |
| SSE streaming | Replaced with polling (UX regression) |
| Timeout | 30s (workaround: separate background Lambda) |
| VPC | Not supported for Next.js routes |
| Timeline | 6-7 weeks |
| Cost | ~$90/month at 200 users |
