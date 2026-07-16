import { authConfig } from "@/auth.config";
import { getRedisV3 } from "@/lib/redis-v3";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";

// Edge-safe auth wrapper: `authConfig` has no DB adapter, so this bundle
// contains only JWT decode logic (no postgres / Drizzle). The full `auth()`
// from `@/auth` must not be imported here.
const { auth } = NextAuth(authConfig);

// Edge-readable mirror of maintenance mode (kept in sync by the settings
// service). Hardcoded here to avoid importing serverSettingsService, which
// pulls Drizzle/Postgres into the Edge bundle.
const MAINTENANCE_REDIS_KEY = "server:maintenance";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// During maintenance we block EVERY mutating (`POST/PUT/PATCH/DELETE`) request to
// `/api/**` — generation, ad edits, uploads, AI chat, everything — so a
// backup/migration captures a consistent snapshot. This is an allow-by-exception
// list rather than a block-list: new editing endpoints are frozen by default,
// so nothing can silently slip through (e.g. the client-direct upload token
// routes did under the old prefix match).
//
// Exempt (must keep working during maintenance):
//  - `/api/admin/*`         — the operator runs/clears the migration + settings
//  - `/api/auth/*`          — existing users must still be able to sign in
//  - `/api/maintenance-status` — public status read for the banner
function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/maintenance-status"
  );
}

function isBlockedDuringMaintenance(pathname: string, method: string): boolean {
  return (
    WRITE_METHODS.has(method) &&
    pathname.startsWith("/api/") &&
    !isMaintenanceExempt(pathname)
  );
}

async function isMaintenanceActive(): Promise<boolean> {
  try {
    // Upstash deserializes "1" to the number 1 — coerce before comparing.
    const v = await getRedisV3().get<string>(MAINTENANCE_REDIS_KEY);
    return v != null && String(v) === "1";
  } catch {
    return false; // fail-open: never block writes on a mirror read error
  }
}

function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/preview") ||
    pathname.startsWith("/auth/signin") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/maintenance-status" ||
    /^\/api\/ads\/[^/]+\/preview/.test(pathname)
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Server-to-server pull: the export endpoint self-authorizes via a one-time
  // access code (validated in the route) when no admin session is present.
  // Let it through the session gate only when the code header is supplied.
  if (
    pathname === "/api/admin/backup/export" &&
    req.headers.get("x-backup-access-code")
  ) {
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

  // Maintenance mode: block ALL content/generation/upload/chat writes for
  // EVERYONE (incl. admins) so a backup/migration captures a consistent
  // snapshot (AAC-185). Only reads the Redis mirror for mutating requests, so
  // GETs and exempt admin/auth traffic pay nothing. Authoritative Edge chokepoint.
  if (isBlockedDuringMaintenance(pathname, req.method) && (await isMaintenanceActive())) {
    return NextResponse.json(
      {
        error:
          "The service is in maintenance mode. Changes are temporarily disabled.",
        code: "MAINTENANCE",
      },
      { status: 503 },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // `api/admin/backup/import/file` is excluded so large archive uploads
    // aren't capped/truncated by `experimental.middlewareClientMaxBodySize`
    // (next.config.ts). That route enforces auth + admin in-handler instead.
    "/((?!_next/static|_next/image|favicon.ico|api/admin/backup/import/file|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
