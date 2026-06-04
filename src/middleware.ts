import { authConfig } from "@/auth.config";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

// Edge-safe auth wrapper: `authConfig` has no DB adapter, so this bundle
// contains only JWT decode logic (no postgres / Drizzle). The full `auth()`
// from `@/auth` must not be imported here.
const { auth } = NextAuth(authConfig);

function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/preview") ||
    pathname.startsWith("/auth/signin") ||
    pathname.startsWith("/api/auth") ||
    /^\/api\/ads\/[^/]+\/preview/.test(pathname)
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth) {
    // API routes: clean 401 JSON so fetch-based clients don't crash on
    // JSON.parse of the sign-in HTML. Page routes: redirect to sign-in.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminRoute(pathname)) {
    if (req.auth.user?.role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
