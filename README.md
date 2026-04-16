# Aleph Creative Audio

## Local Development

Create a `.env` file with these values

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432
V3_KV_REST_API_URL=http://localhost:8079
V3_KV_REST_API_TOKEN=example_token
ADMIN_EMAILS="your@email.address"
AUTH_RESEND_FROM="Aleph Creative Audio <no-reply@alephcreative.cloud>"
```

And also add the rest of the needed environment variables as explained below.

## Environment Variables

### Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_EMAILS` | Yes | Comma-separated list of email addresses granted admin access |
| `GUEST_EMAILS` | Yes | Comma-separated list of email addresses granted guest access |
| `AUTH_RESEND_KEY` | Yes | API key for [Resend](https://resend.com) — used to send magic-link sign-in emails |
| `AUTH_RESEND_FROM` | No | Sender address for sign-in emails. Defaults to `onboarding@resend.dev` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID. When set (with secret), enables Google sign-in button |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `NEXT_PUBLIC_HAS_GOOGLE_PROVIDER` | No | Set to `true` to show the Google sign-in button in the UI (should match whether the OAuth keys are set) |

### Database & Storage

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Drizzle ORM (migrations and runtime queries) |
| `KV_REST_API_URL` | Yes | Upstash Redis REST URL — stores production project/ad data |
| `KV_REST_API_TOKEN` | Yes | Auth token for the production Upstash Redis instance |
| `V3_KV_REST_API_URL` | Yes | Upstash Redis REST URL for the v3 version-streams namespace (isolated from production) |
| `V3_KV_REST_API_TOKEN` | Yes | Auth token for the v3 Redis instance |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token — enables client-side direct audio uploads (bypasses 4.5 MB serverless limit) |

### LLM / Orchestration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key — primary LLM orchestrator for script generation, headline creation, chat, and voice synthesis fallback |
| `NEXT_PUBLIC_OPENAI_API_KEY` | No | Client-side OpenAI key (optional fallback for browser-side voice synthesis) |

### Voice Providers

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for voice synthesis, sound effects, and music generation |
| `NEXT_PUBLIC_ELEVENLABS_API_KEY` | No | Client-side ElevenLabs key (optional fallback for browser-side SFX calls) |
| `QWEN_BEIJING_API_KEY` | No | Alibaba Qwen TTS key (Beijing region) — required for Chinese-language voices |
| `LOVO_API_KEY` | No | Lovo voice synthesis API key |
| `LAHAJATI_SECRET_KEY` | No | Lahajati Arabic TTS API key — required for Arabic dialect voices |
| `BYTEDANCE_APP_KEY` | No | ByteDance TTS 2.0 key — required for ByteDance multi-language voices |

### Music Generation

| Variable | Required | Description |
|----------|----------|-------------|
| `LOUDLY_API_KEY` | No | Loudly API key for royalty-free background music generation |
| `MUBERT_COMPANY_ID` | No | Mubert company identifier — required for Mubert music generation |
| `MUBERT_LICENSE_TOKEN` | No | Mubert license token (paired with `MUBERT_COMPANY_ID`) |

### Regional Configuration & Proxy

| Variable | Required | Description |
|----------|----------|-------------|
| `ALEPHREGION` | No | Deployment region: `apac`, `americas`, or `europe`. Controls default language and available providers. Defaults to `americas` |
| `AMERICAS_API_URL` | No | Base URL of the regional OpenAI proxy. Defaults to `https://wb-voices.vercel.app` |
| `PROXY_API_KEY` | No | API key for the regional proxy service (used with `AMERICAS_API_URL`) |

### Deployment

| Variable | Required | Description |
|----------|----------|-------------|
| `VERCEL_URL` | Auto | Set automatically by Vercel. Used to build the base URL for internal server-to-server API calls |
| `PORT` | No | Local dev server port. Defaults to `3003` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | No | Secret for bypassing Vercel Deployment Protection on internal API calls. Only needed if protection is enabled |
| `NEXT_PUBLIC_BASE_URL` | No | Base URL used by scripts (e.g. `scripts/create-test-ad.ts`). Defaults to `http://localhost:3003` |
| `NODE_ENV` | Auto | Standard Node.js environment (`development`, `production`, `test`). Used in Redis error logging |
