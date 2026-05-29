import { useSession } from "next-auth/react";

/**
 * Hook to get the current authenticated user's info.
 * Wraps useSession for convenience.
 */
export function useAuth() {
  const { data: session, status } = useSession();

  return {
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    user: session?.user ?? null,
    isAdmin: session?.user?.role === "admin",
  };
}
