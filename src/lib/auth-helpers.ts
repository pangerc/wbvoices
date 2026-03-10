import { auth } from "@/auth";
import { getAdMetadata } from "@/lib/redis/versions";
import type { Session } from "next-auth";

/**
 * Get the current session or return null.
 * Use in API routes to get the authenticated user.
 */
export async function getSession(): Promise<Session | null> {
  return auth();
}

/**
 * Get the authenticated user's email, or throw a 401-style error.
 * Convenience for API routes that require authentication.
 */
export async function requireAuth(): Promise<{ email: string; role: string }> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new AuthError("Not authenticated", 401);
  }
  return {
    email: session.user.email,
    role: session.user.role || "user",
  };
}

/**
 * Check if the current user owns an ad or is an admin.
 * Returns true if allowed, false if not.
 */
export async function verifyAdAccess(
  adId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  if (userRole === "admin") return true;

  const meta = await getAdMetadata(adId);
  if (!meta) return false;

  return meta.owner === userEmail;
}

/**
 * Check if user has admin role.
 */
export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
