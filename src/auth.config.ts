import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAINS = [
  "@alephholding.com",
  "@byselva.com",
  "@alephdigital.com",
  "@partners.alephholding.com",
  "@partners.byselva.com",
  "@partners.alephdigital.com",
];

const GUEST_EMAILS = (process.env.GUEST_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Edge-safe NextAuth config used by middleware. Contains only OAuth providers
// (which don't require an adapter at assertConfig-time), session strategy,
// pages, and the string-only signIn callback. The Resend (email) provider
// requires an adapter and therefore lives in the Node-only `@/auth` module.
export const authConfig = {
  providers: [
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
      return (
        ALLOWED_DOMAINS.some((domain) => email.endsWith(domain)) ||
        GUEST_EMAILS.includes(email)
      );
    },
    // Projects token.role onto session.user.role. Defined here (Edge-safe)
    // so middleware sees the role claim — without this, NextAuth's default
    // session shape drops custom JWT fields and admin gates redirect even
    // for users whose JWT carries role: "admin".
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
