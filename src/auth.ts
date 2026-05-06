import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db, getDb } from "@/lib/db";
import { users, accounts, verificationTokens } from "@/lib/db/schema";
import { authConfig } from "@/auth.config";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Full NextAuth instance (Node runtime): extends the Edge-safe `authConfig`
// with the Drizzle adapter, the email (Resend) provider, and the DB-touching
// jwt/session callbacks. Route handlers and server helpers import from here.
// Middleware must NOT — Resend + DrizzleAdapter pull in Node-only deps.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...authConfig.providers,
    Resend({
      from: process.env.AUTH_RESEND_FROM || "onboarding@resend.dev",
      async sendVerificationRequest({ identifier: email, url, provider }) {
        // Dev fallback: print the magic link to stdout so local sign-in works
        // even when AUTH_RESEND_KEY is invalid or the from-domain isn't verified.
        // Added for DEV purposes because AUTH_RESEND_KEY became invalid
        if (process.env.NODE_ENV !== "production") {
          const banner = "═".repeat(70);
          console.log(
            `\n${banner}\n🔐 DEV SIGN-IN LINK for ${email}\n${url}\n${banner}\n`
          );
        }
        const { Resend: ResendClient } = await import("resend");
        const resend = new ResendClient(process.env.AUTH_RESEND_KEY);
        await resend.emails.send({
          from: provider.from!,
          to: email,
          subject: "Sign in to Aleph Creative Audio",
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.03) 100%);border:1px solid rgba(255,255,255,0.15);border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:16px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">Aleph Creative Audio</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#ffffff;text-align:center;">Sign in to your account</h1>
          <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.5;">Click the button below to securely sign in. This link expires in 24 hours.</p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${url}" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);border-radius:12px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">
              Sign in
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;font-size:13px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.5;">If you didn't request this email, you can safely ignore it.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);">Aleph Creative Audio &middot; Voice Ad Generation</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user, trigger }) {
      if (user?.email) {
        const email = user.email.toLowerCase();
        const [dbUser] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (dbUser) {
          const shouldBeAdmin = ADMIN_EMAILS.includes(email);
          if (shouldBeAdmin && dbUser.role !== "admin") {
            await db
              .update(users)
              .set({ role: "admin" })
              .where(eq(users.email, email));
            token.role = "admin";
          } else {
            token.role = dbUser.role;
          }
        } else {
          const role = ADMIN_EMAILS.includes(email) ? "admin" : "user";
          if (role === "admin") {
            await db
              .update(users)
              .set({ role: "admin" })
              .where(eq(users.email, email));
          }
          token.role = role;
        }
      }

      if (trigger !== "signIn" && !token.role) {
        token.role = "user";
      }

      return token;
    },
    // Note: the session callback that projects token.role -> session.user.role
    // lives in `authConfig` so Edge middleware sees it too. We inherit it via
    // the `...authConfig.callbacks` spread above.
  },
});
