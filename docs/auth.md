# Authentication & Multi-User Access Control

**Status:** Live
**Last Updated:** March 10, 2026

---

## Overview

Per-user identity via NextAuth.js v5. Magic links (Resend) are the primary sign-in method; Google OAuth is an optional secondary provider that activates when credentials are configured.

**What changed from the old system:**
- Password login → magic link email + optional Google OAuth
- Single shared session → per-user identity (email)
- All ads visible to everyone → users see only their own ads
- Admin pages open to all → admin-only access

**What stays the same:**
- Redis ad schema (same keys, just different `owner` value)
- Public `/preview/*` routes (no auth required)
- All voice/music/SFX generation flows

---

## Auth Providers

### Primary: Magic Links (Resend)

User enters their company email, receives a sign-in link, clicks it, authenticated.

- Provider: Resend via `alephcreative.cloud` domain
- From: `Aleph Creative Audio <no-reply@alephcreative.cloud>`
- Requires: `AUTH_RESEND_KEY` env var
- Custom HTML email template in `src/auth.ts` (dark theme, branded)

**DNS requirements for `alephcreative.cloud`:**
- DKIM (verified in Resend)
- SPF (MX + TXT on `send` subdomain)
- DMARC (`_dmarc` TXT record: `v=DMARC1; p=none;`)

### Secondary: Google OAuth (Optional)

Activates when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars are set. Appears as a second option on the sign-in page.

#### Development Setup (Personal GCP Project)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project (e.g., "wb-voices-dev")
3. APIs & Services → OAuth consent screen → **External** → Testing status
4. Add your email as test user
5. Credentials → Create OAuth 2.0 Client ID → Web application
6. Authorized redirect URI: `http://localhost:3003/api/auth/callback/google`
7. Copy **Client ID** + **Client Secret** to `.env.local`

#### Production Setup (IT Request)

> **Subject:** OAuth 2.0 Client ID for internal web application
>
> **What we need:** An OAuth 2.0 Client ID (Web application type) for our internal audio ad generation tool.
>
> **OAuth consent screen:**
> - Type: **Internal** (visible only to Workspace users)
> - App name: WB Creative Audio Studio
> - Scopes: `openid`, `email`, `profile` (basic sign-in only)
>
> **Credentials:**
> - Application type: Web application
> - Authorized redirect URIs:
>   - `https://alephcreative.cloud/api/auth/callback/google`
>   - `http://localhost:3003/api/auth/callback/google`
>
> **Deliverables:** Client ID and Client Secret

---

## Auth Architecture

### Library: NextAuth.js v5 (Auth.js)

- Drizzle adapter for Neon (stores verification tokens + account links)
- JWT session strategy (explicit override — no DB session lookups)
- Session cookie: encrypted, httpOnly, carries user email + role
- Config: `src/auth.ts`
- Catch-all route: `src/app/api/auth/[...nextauth]/route.ts`
- Middleware: `src/middleware.ts` (uses NextAuth's `auth()` wrapper)

### Domain Allowlist

Enforced in the `signIn` callback — rejects any email not matching:
- `@alephholding.com`
- `@byselva.com`
- `@partners.alephholding.com`
- `@partners.byselva.com`

### Session Shape

```typescript
// Available via useAuth() client-side or auth() server-side
session.user = {
  email: "user@alephholding.com",
  name: "User Name",
  image: "https://...",  // Google avatar (null for magic link users)
  role: "user" | "admin"
}
```

### Database Tables (Neon — `dark-band-57504937`)

| Table | Purpose |
|-------|---------|
| `users` | User profiles + custom `role` column |
| `accounts` | OAuth provider links (Google) |
| `verification_tokens` | Magic link tokens (short-lived, auto-cleaned) |

No `sessions` table needed (JWT strategy). Schema defined in `src/lib/db/schema.ts`.

### Admin Bootstrap

`ADMIN_EMAILS` env var (comma-separated) auto-promotes matching users to admin on first login. The DB `role` column is the source of truth after that.

```
ADMIN_EMAILS=matej.pangerc@partners.alephholding.com,ignacio@alephholding.com
```

---

## Ad Ownership Model

### Owner = User Email

`AdMetadata.owner` is populated with the authenticated user's email.

```
ad:{adId}:meta → { ..., owner: "user@alephholding.com" }
ads:by_user:user@alephholding.com → ["ad-id-1", "ad-id-2"]
ads:all → ["ad-id-1", "ad-id-2", ...]  // global index
```

### Access Rules

| Action | User | Admin |
|--------|------|-------|
| List own ads | `ads:by_user:{email}` | `ads:by_user:{email}` |
| List all ads | — | `ads:all` via `?all=true` (includes legacy) |
| View/edit ad | Owner only | Any ad |
| Delete ad | Owner only | Any ad |
| Admin pages | Blocked (redirect to `/`) | Full access |
| Public preview | Anyone | Anyone |

### Legacy Ads

Existing ads with `owner: "universal-session"` are **not migrated**. They remain accessible to admins via the `ads:all` index. Regular users won't see them.

---

## Key Files

| Area | File |
|------|------|
| NextAuth config | `src/auth.ts` |
| Catch-all route | `src/app/api/auth/[...nextauth]/route.ts` |
| Middleware | `src/middleware.ts` |
| Auth helpers | `src/lib/auth-helpers.ts` |
| DB schema | `src/lib/db/schema.ts` |
| Type augmentation | `src/types/next-auth.d.ts` |
| Sign-in page | `src/app/auth/signin/page.tsx` |
| Login form | `src/components/LoginForm.tsx` |
| Session provider | `src/components/AuthProvider.tsx` |

---

## Environment Variables

```bash
# Auth (required)
AUTH_SECRET=xxx                    # NextAuth v5 session encryption
AUTH_RESEND_KEY=xxx                # Resend API key for magic links
AUTH_RESEND_FROM="Aleph Creative Audio <no-reply@alephcreative.cloud>"
AUTH_URL=https://alephcreative.cloud  # Production URL
ADMIN_EMAILS=matej.pangerc@partners.alephholding.com,ignacio@alephholding.com

# Google OAuth (optional — magic links work without these)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
```

---

## Route Protection Matrix

| Route Pattern | Auth Required | Role Required |
|--------------|---------------|---------------|
| `/preview/*` | No | — |
| `/api/auth/*` | No (NextAuth handles) | — |
| `/auth/signin` | No | — |
| `/admin/*` | Yes | `admin` |
| `/api/admin/*` | Yes | `admin` |
| `/ad/*` | Yes | any |
| `/api/ads/*` | Yes | any (ownership checked per-ad) |
| `/api/ai/*` | Yes | any |
| `/api/voice/*` | Yes | any |
| `/api/music/*` | Yes | any |
| Everything else | Yes | any |

---

## Adding New Users

No manual steps needed. Anyone with an allowed domain email (`@alephholding.com`, `@byselva.com`, `@partners.alephholding.com`) can sign in — they enter their email and get a magic link. A `users` row is auto-created on first login with `role: 'user'`.

To make someone admin: add their email to the `ADMIN_EMAILS` env var (both `.env` and Vercel). They get promoted on next sign-in.
