"use client";

import { SessionProvider, useSession } from "next-auth/react";
import React from "react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

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
