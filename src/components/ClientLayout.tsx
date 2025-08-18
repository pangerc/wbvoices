"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "./AuthProvider";
import { shouldRequireAuth, isPublicRoute } from "@/lib/auth";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  
  // Determine if auth is required based on environment and route
  const requireAuth = shouldRequireAuth() && !isPublicRoute(pathname);

  return (
    <AuthProvider requireAuth={requireAuth}>
      {children}
    </AuthProvider>
  );
}