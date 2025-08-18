"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { LoginForm } from "./LoginForm";

interface AuthContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AuthProvider({ children, requireAuth = false }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoginForm, setShowLoginForm] = useState(false);

  const checkAuthStatus = React.useCallback(async () => {
    if (!requireAuth) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/verify", {
        credentials: "include",
      });
      const authenticated = response.ok;
      setIsAuthenticated(authenticated);
      setShowLoginForm(!authenticated);
    } catch (error) {
      console.error("Auth check failed:", error);
      setIsAuthenticated(false);
      setShowLoginForm(true);
    } finally {
      setIsLoading(false);
    }
  }, [requireAuth]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = () => {
    setIsAuthenticated(true);
    setShowLoginForm(false);
    // Refresh the page to ensure all auth state is updated
    window.location.reload();
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    setIsAuthenticated(false);
    setShowLoginForm(true);
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    login,
    logout,
    isLoading,
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-black text-white">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
            <p className="text-lg">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated && showLoginForm) {
    return <LoginForm onSuccess={login} />;
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}