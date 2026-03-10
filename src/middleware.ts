import { auth } from "@/auth";
import { NextResponse } from "next/server";

function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/preview") ||
    pathname.startsWith("/auth/signin") ||
    pathname.startsWith("/api/auth")
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — no auth required
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to sign-in
  if (!req.auth) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Admin routes — require admin role
  if (isAdminRoute(pathname)) {
    if (req.auth.user?.role !== "admin") {
      // API routes get 403, page routes redirect to home
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
