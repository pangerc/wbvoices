"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "./AuthProvider";
import { isPublicRoute } from "@/lib/auth";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  
  // Always require auth for non-public routes
  const requireAuth = !isPublicRoute(pathname);

  return (
    <AuthProvider requireAuth={requireAuth}>
      {children}
    </AuthProvider>
  );
}