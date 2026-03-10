import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, getDb } from "@/lib/db";
import { users, accounts, verificationTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ALLOWED_DOMAINS = [
  "@alephholding.com",
  "@byselva.com",
  "@partners.alephholding.com",
  "@partners.byselva.com",
];

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      from: process.env.AUTH_RESEND_FROM || "onboarding@resend.dev",
      async sendVerificationRequest({ identifier: email, url, provider }) {
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
        <!-- Header -->
        <tr><td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:16px;font-weight:600;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;">Aleph Creative Audio</div>
        </td></tr>
        <!-- Body -->
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
        <!-- Footer -->
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
    // Google OAuth — only when credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const email = user.email.toLowerCase();
      return ALLOWED_DOMAINS.some((domain) => email.endsWith(domain));
    },

    async jwt({ token, user, trigger }) {
      // On initial sign-in, look up role from DB (or bootstrap from ADMIN_EMAILS)
      if (user?.email) {
        const email = user.email.toLowerCase();
        const [dbUser] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (dbUser) {
          // Check if admin email list has been updated since last login
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
          // User was just created by the adapter — set role
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

      // On subsequent requests, carry the role forward
      if (trigger !== "signIn" && !token.role) {
        token.role = "user";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
