/**
 * Auth utilities.
 * Main NextAuth config lives in src/auth.ts.
 * This file provides route classification helpers.
 */

export function isPublicRoute(pathname: string): boolean {
  return pathname.startsWith("/preview");
}

export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}
